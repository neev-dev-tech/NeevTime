/**
 * Where a backup is copied to, besides this machine.
 *
 * A dump sitting beside the database survives a bad migration. It does not
 * survive the disk, the machine, or the room. This system holds biometric
 * identifiers and payroll evidence with a multi-year retention obligation, and
 * until today every copy of it lived on one VM.
 *
 * ── Why a registry and not four features ────────────────────────────────────
 *
 * Each destination is declared once: its name, the fields it needs, how to test
 * it, and how to send a file. The route and the settings screen read those
 * declarations, so adding a destination is one entry and no changes anywhere
 * else — the same shape as services/integrations/registry.js.
 *
 * That pattern is here for a specific reason. Four HRMS and payroll adapters
 * were deleted from this codebase for being buttons that could never work:
 * they were declared, they appeared in the interface, and the vendors gate the
 * APIs behind partner agreements a self-hosted product cannot obtain. Every
 * destination below is one this deployment can actually reach with credentials
 * its owner can actually get. `test()` exists so that claim is checked rather
 * than assumed — the button proves itself before anyone relies on it.
 *
 * ── Secrets ─────────────────────────────────────────────────────────────────
 *
 * Fields marked `secret` are encrypted at rest (see utils/secrets) and never
 * returned to the browser — the API sends a mask, and a submitted mask means
 * "leave it as it is". These credentials can read every backup, so a stolen
 * copy of app_settings must not be enough to fetch them.
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

/**
 * Refuse a Windows path before it silently becomes a filename.
 *
 * A UNC path like \\10.81.20.100\IT_Team\Backup means nothing to Linux. The
 * container would take it as a single very oddly named directory, create it
 * happily, copy every backup into it, report success, and lose the lot on the
 * next deploy — indistinguishable from a working off-machine copy until the day
 * it is needed.
 *
 * The share has to be mounted on the host and referenced by its mount point.
 * That is a one-time act by someone with root on the VM, and no amount of code
 * here can do it from a web form — so the message says exactly what to run.
 */
const assertLinuxPath = (dest) => {
    if (/^\\\\/.test(dest) || /^[A-Za-z]:[\\/]/.test(dest)) {
        throw new Error(
            `"${dest}" is a Windows path. This server is Linux, and a path like that would be `
            + 'treated as a filename — backups would appear to succeed and be lost on the next '
            + 'deploy.\n\n'
            + 'Mount the share on the server first, then use its mount point here:\n'
            + '  sudo mkdir -p /mnt/it-backups\n'
            + '  sudo mount -t cifs //10.81.20.100/IT_Team /mnt/it-backups '
            + '-o username=YOURUSER,vers=3.0\n\n'
            + 'Then set BACKUP_EXTERNAL_DIR to that path in .env, redeploy, and use '
            + '/mnt/backup-external here. Add it to /etc/fstab so it survives a reboot.'
        );
    }
};

/**
 * A copy that lands on a filesystem the container can see.
 *
 * The plainest option and the safest, because it stores no credentials at all.
 * Mount an SMB share, an NFS export, a NAS or a second disk on the host, point
 * BACKUP_EXTERNAL_DIR at it, and use /mnt/backup-external here.
 */
const filesystem = {
    key: 'filesystem',
    name: 'Folder or mounted share',
    description:
        'A path inside the container. Mount a NAS, a Windows share or a second disk on the '
        + 'host and it lands there. Stores no credentials — the safest option when you have one.',
    fields: [
        { key: 'path', label: 'Path', type: 'text', placeholder: '/mnt/backup-external',
          help: 'Must be a mounted volume to reach other hardware. Test reports whether it is.' },
    ],

    async test(cfg) {
        const dest = String(cfg.path || '').trim();
        if (!dest) throw new Error('No path given');
        assertLinuxPath(dest);

        const probe = path.join(dest, `.neevtime-write-check-${Date.now()}`);
        await fsp.mkdir(dest, { recursive: true });
        await fsp.writeFile(probe, 'write check');
        const back = await fsp.readFile(probe, 'utf8');
        await fsp.unlink(probe);
        if (back !== 'write check') throw new Error('file read back different than written');

        // A path that is not a separate mount is the container's own disk, and
        // will not survive the next deploy. It works, which is why it needs
        // saying out loud.
        let mounted = false;
        try {
            const [here, parent] = await Promise.all([
                fsp.stat(dest), fsp.stat(path.dirname(dest)),
            ]);
            mounted = here.dev !== parent.dev;
        } catch { /* advisory only */ }

        return {
            ok: true,
            detail: mounted
                ? 'Writable, and on a separate mount — copies survive a redeploy.'
                : 'Writable, but this is inside the container. Copies here are lost on the next '
                  + 'deploy. Mount a volume at this path.',
            warn: !mounted,
        };
    },

    async send(cfg, filepath, filename) {
        const dest = String(cfg.path || '').trim();
        assertLinuxPath(dest);
        await fsp.mkdir(dest, { recursive: true });
        const target = path.join(dest, filename);
        await fsp.copyFile(filepath, target);
        return target;
    },
};

/** Any S3-compatible store: AWS, MinIO, Backblaze B2, Wasabi, Ceph. */
const s3 = {
    key: 's3',
    name: 'S3-compatible storage',
    description:
        'AWS S3, MinIO, Backblaze B2, Wasabi or any S3-compatible endpoint. The only option '
        + 'here that puts a copy outside the building without another machine to maintain.',
    fields: [
        { key: 'endpoint', label: 'Endpoint', type: 'text', placeholder: 'https://s3.ap-south-1.amazonaws.com',
          help: 'Leave empty for AWS with the region below. Required for MinIO, B2 and Wasabi.' },
        { key: 'region', label: 'Region', type: 'text', placeholder: 'ap-south-1' },
        { key: 'bucket', label: 'Bucket', type: 'text', placeholder: 'neevtime-backups' },
        { key: 'prefix', label: 'Folder inside the bucket', type: 'text', placeholder: 'vayudb/' },
        { key: 'access_key_id', label: 'Access key ID', type: 'text' },
        { key: 'secret_access_key', label: 'Secret access key', type: 'password', secret: true },
    ],

    client(cfg) {
        const { S3Client } = require('@aws-sdk/client-s3');
        return new S3Client({
            region: cfg.region || 'us-east-1',
            endpoint: cfg.endpoint || undefined,
            // MinIO and most self-hosted gateways need path style; AWS accepts it.
            forcePathStyle: Boolean(cfg.endpoint),
            credentials: {
                accessKeyId: cfg.access_key_id,
                secretAccessKey: cfg.secret_access_key,
            },
        });
    },

    async test(cfg) {
        if (!cfg.bucket) throw new Error('No bucket given');
        const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
        const client = this.client(cfg);
        const key = `${cfg.prefix || ''}.neevtime-write-check-${Date.now()}`;

        // Write, read back, delete — the same probe as the filesystem. Listing a
        // bucket proves far less: read permission without write permission
        // passes a list check and fails every backup.
        await client.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: 'write check' }));
        const got = await client.send(new GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
        const body = await got.Body.transformToString();
        await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
        if (body !== 'write check') throw new Error('object read back different than written');

        return { ok: true, detail: `Wrote, read and deleted a probe object in ${cfg.bucket}.` };
    },

    async send(cfg, filepath, filename) {
        const { PutObjectCommand } = require('@aws-sdk/client-s3');
        const key = `${cfg.prefix || ''}${filename}`;
        await this.client(cfg).send(new PutObjectCommand({
            Bucket: cfg.bucket,
            Key: key,
            Body: fs.createReadStream(filepath),
            ContentLength: (await fsp.stat(filepath)).size,
        }));
        return `s3://${cfg.bucket}/${key}`;
    },
};

/** Any other machine reachable over SSH. */
const sftp = {
    key: 'sftp',
    name: 'Another server over SFTP',
    description:
        'Copy to any machine you can reach over SSH. A key file placed on this server is safer '
        + 'than a password stored in the database — the database is what the backup contains.',
    fields: [
        { key: 'host', label: 'Host', type: 'text', placeholder: '192.168.1.50' },
        { key: 'port', label: 'Port', type: 'text', placeholder: '22' },
        { key: 'username', label: 'Username', type: 'text' },
        { key: 'private_key_path', label: 'Private key file (on this server)', type: 'text',
          placeholder: '/mnt/backup-external/.ssh/id_ed25519',
          help: 'Preferred. Place the key on the server and give its path — nothing sensitive is stored here.' },
        { key: 'password', label: 'Password (only if no key)', type: 'password', secret: true },
        { key: 'remote_path', label: 'Remote folder', type: 'text', placeholder: '/backups/neevtime' },
    ],

    async connect(cfg) {
        const Client = require('ssh2-sftp-client');
        const client = new Client();
        await client.connect({
            host: cfg.host,
            port: Number(cfg.port) || 22,
            username: cfg.username,
            ...(cfg.private_key_path
                ? { privateKey: await fsp.readFile(cfg.private_key_path) }
                : { password: cfg.password }),
            readyTimeout: 15000,
        });
        return client;
    },

    async test(cfg) {
        if (!cfg.host || !cfg.username) throw new Error('Host and username are required');
        if (!cfg.private_key_path && !cfg.password) {
            throw new Error('Either a private key file or a password is required');
        }

        const client = await this.connect(cfg);
        try {
            const dir = cfg.remote_path || '.';
            await client.mkdir(dir, true).catch(() => { /* already there */ });
            const probe = `${dir}/.neevtime-write-check-${Date.now()}`;
            await client.put(Buffer.from('write check'), probe);
            const back = await client.get(probe);
            await client.delete(probe);
            if (back.toString() !== 'write check') throw new Error('file read back different');
            return { ok: true, detail: `Wrote, read and deleted a probe file in ${dir} on ${cfg.host}.` };
        } finally {
            await client.end().catch(() => {});
        }
    },

    async send(cfg, filepath, filename) {
        const client = await this.connect(cfg);
        try {
            const dir = cfg.remote_path || '.';
            await client.mkdir(dir, true).catch(() => {});
            const target = `${dir}/${filename}`;
            await client.put(filepath, target);
            return `${cfg.username}@${cfg.host}:${target}`;
        } finally {
            await client.end().catch(() => {});
        }
    },
};

/**
 * SharePoint or OneDrive, through Microsoft Graph.
 *
 * Needs an Azure AD app registration with the Files.ReadWrite.All application
 * permission and admin consent. That is a deliberate act by someone with tenant
 * admin rights, and no code here can substitute for it — which is exactly why
 * the field help says so rather than leaving a button that fails mysteriously.
 *
 * Client credentials flow, plain fetch, no SDK.
 */
const sharepoint = {
    key: 'sharepoint',
    name: 'SharePoint or OneDrive',
    description:
        'Uploads to a document library through Microsoft Graph. Requires an Azure AD app '
        + 'registration with Files.ReadWrite.All and admin consent from your tenant.',
    fields: [
        { key: 'tenant_id', label: 'Directory (tenant) ID', type: 'text' },
        { key: 'client_id', label: 'Application (client) ID', type: 'text' },
        { key: 'client_secret', label: 'Client secret', type: 'password', secret: true },
        { key: 'drive_id', label: 'Drive ID', type: 'text',
          help: 'The document library. Find it with GET /sites/{site}/drives in Graph Explorer.' },
        { key: 'folder', label: 'Folder path in the library', type: 'text', placeholder: 'NeevTime/backups' },
    ],

    async token(cfg) {
        const res = await fetch(`https://login.microsoftonline.com/${cfg.tenant_id}/oauth2/v2.0/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: cfg.client_id,
                client_secret: cfg.client_secret,
                scope: 'https://graph.microsoft.com/.default',
                grant_type: 'client_credentials',
            }),
        });
        const body = await res.json();
        if (!res.ok) {
            // Graph's error descriptions are long but genuinely diagnostic —
            // they name a wrong tenant, an expired secret or missing consent.
            throw new Error(body.error_description?.split('\n')[0] || `token request failed (${res.status})`);
        }
        return body.access_token;
    },

    async upload(cfg, token, name, body, size) {
        const folder = String(cfg.folder || '').replace(/^\/+|\/+$/g, '');
        const target = folder ? `${folder}/${name}` : name;
        const url = `https://graph.microsoft.com/v1.0/drives/${cfg.drive_id}`
            + `/root:/${encodeURI(target)}:/content`;

        const res = await fetch(url, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/octet-stream',
                ...(size ? { 'Content-Length': String(size) } : {}),
            },
            body,
            duplex: 'half',
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`upload failed (${res.status}): ${text.slice(0, 200)}`);
        }
        return (await res.json()).webUrl || target;
    },

    async test(cfg) {
        if (!cfg.tenant_id || !cfg.client_id || !cfg.drive_id) {
            throw new Error('Tenant ID, client ID and drive ID are required');
        }
        const token = await this.token(cfg);
        const name = `.neevtime-write-check-${Date.now()}.txt`;
        await this.upload(cfg, token, name, 'write check');

        // Delete it again, so a test leaves nothing behind.
        const folder = String(cfg.folder || '').replace(/^\/+|\/+$/g, '');
        const target = folder ? `${folder}/${name}` : name;
        await fetch(
            `https://graph.microsoft.com/v1.0/drives/${cfg.drive_id}/root:/${encodeURI(target)}:`,
            { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
        );

        return { ok: true, detail: 'Signed in, uploaded and removed a probe file.' };
    },

    async send(cfg, filepath, filename) {
        const token = await this.token(cfg);
        const size = (await fsp.stat(filepath)).size;
        // Graph accepts a simple PUT up to 250 MB; these dumps are ~11 MB.
        return this.upload(cfg, token, filename, fs.createReadStream(filepath), size);
    },
};

/**
 * A Windows or Samba share, spoken directly — no mount.
 *
 * Asked for by name: the owner wanted to point backups at
 * \\10.81.20.100\IT_Team\NeevTime Backup with a username and password, from the
 * settings screen.
 *
 * Mounting that share is a host operation needing privileges this container
 * does not have and should not be given. smbclient talks the protocol instead,
 * which needs no mount, no root, and no change to the VM — the credentials live
 * here, encrypted, and the copy is a single command.
 *
 * On MFA, plainly: an unattended backup at 02:00 cannot answer a prompt on
 * somebody's phone. Use a service account without MFA for this, or use the
 * SharePoint destination, which authenticates as an application and is the
 * option that genuinely coexists with MFA on user accounts.
 *
 * The password is passed through the environment, never on the command line —
 * an argument is visible to every process on the machine via ps.
 */
const smb = {
    key: 'smb',
    name: 'Windows share (SMB)',
    description:
        'A Windows or Samba share, by host and share name. No mounting required. Needs an '
        + 'account that can write to the share — a service account without MFA, because an '
        + 'unattended backup cannot answer an MFA prompt.',
    fields: [
        { key: 'host', label: 'Server', type: 'text', placeholder: '10.81.20.100' },
        { key: 'share', label: 'Share name', type: 'text', placeholder: 'IT_Team',
          help: 'Just the share, not the whole path. For \\\\10.81.20.100\\IT_Team this is IT_Team.' },
        { key: 'folder', label: 'Folder inside the share', type: 'text', placeholder: 'NeevTime Backup' },
        { key: 'domain', label: 'Domain', type: 'text', placeholder: 'INNOPAY',
          help: 'Leave empty for a local account on the file server.' },
        { key: 'username', label: 'Username', type: 'text' },
        { key: 'password', label: 'Password', type: 'password', secret: true },
    ],

    /**
     * Run one smbclient command inside the share.
     *
     * -E sends messages to stderr so a failure is not mistaken for output, and
     * the exit code alone is not enough: smbclient exits 0 for some failures
     * and prints NT_STATUS_... instead. Both are checked.
     */
    run(cfg, command) {
        const { execFile } = require('node:child_process');
        const args = [
            `//${String(cfg.host || '').trim()}/${String(cfg.share || '').trim()}`,
            '-U', cfg.domain ? `${cfg.domain}\\${cfg.username}` : String(cfg.username || ''),
            '-E',
            '-c', command,
        ];

        return new Promise((resolve, reject) => {
            execFile('smbclient', args, {
                env: { ...process.env, PASSWD: String(cfg.password || '') },
                timeout: 120000,
            }, (err, stdout, stderr) => {
                const out = `${stdout || ''}${stderr || ''}`;
                const status = out.match(/NT_STATUS_[A-Z_]+/);

                // Translate on BOTH paths. This used to explain the status only
                // when smbclient exited zero, and a connection failure exits
                // non-zero — so the one case a customer is most likely to hit,
                // an unreachable file server, was the one that returned
                // "do_connect: Connection to 10.81.20.100 failed (Error
                // NT_STATUS_CONNECTION_REFUSED)" verbatim. Caught by the test
                // written to assert exactly this.
                if (status) return reject(new Error(smbExplain(status[0])));
                if (err) return reject(new Error(out.trim().split('\n')[0] || err.message));
                resolve(out);
            });
        });
    },

    async test(cfg) {
        if (!cfg.host || !cfg.share) throw new Error('Server and share name are required');
        if (!cfg.username) throw new Error('A username is required');

        const folder = String(cfg.folder || '').replace(/^[\\/]+|[\\/]+$/g, '');
        const name = `.neevtime-write-check-${Date.now()}`;
        const local = path.join(require('node:os').tmpdir(), name);
        await fsp.writeFile(local, 'write check');

        try {
            // Write, read back, delete — a directory listing would pass with
            // read-only access and then fail every backup afterwards. That is
            // not hypothetical here: this share refused write access when it
            // was first tried from the command line.
            const cd = folder ? `cd "${folder}"; ` : '';
            await this.run(cfg, `${cd}put "${local}" "${name}"`);
            await this.run(cfg, `${cd}get "${name}" "${local}.back"`);
            await this.run(cfg, `${cd}del "${name}"`);

            const back = await fsp.readFile(`${local}.back`, 'utf8');
            if (back !== 'write check') throw new Error('file read back different than written');

            return {
                ok: true,
                detail: `Wrote, read and deleted a probe file on \\\\${cfg.host}\\${cfg.share}`
                    + `${folder ? `\\${folder}` : ''}.`,
            };
        } finally {
            await fsp.unlink(local).catch(() => {});
            await fsp.unlink(`${local}.back`).catch(() => {});
        }
    },

    async send(cfg, filepath, filename) {
        const folder = String(cfg.folder || '').replace(/^[\\/]+|[\\/]+$/g, '');
        const cd = folder ? `cd "${folder}"; ` : '';
        await this.run(cfg, `${cd}put "${filepath}" "${filename}"`);
        return `\\\\${cfg.host}\\${cfg.share}${folder ? `\\${folder}` : ''}\\${filename}`;
    },
};

/** smbclient's status codes, in words someone can act on. */
const smbExplain = (status) => ({
    NT_STATUS_LOGON_FAILURE: 'Wrong username or password. If the account is in a domain, set the '
        + 'Domain field too.',
    NT_STATUS_ACCESS_DENIED: 'The account signed in but is not allowed to write here. Grant it '
        + 'write permission on the share and the folder.',
    NT_STATUS_BAD_NETWORK_NAME: 'That share name does not exist on the server.',
    NT_STATUS_OBJECT_NAME_NOT_FOUND: 'That folder does not exist inside the share.',
    NT_STATUS_UNSUCCESSFUL: 'The server refused the request without saying why. Check the share '
        + 'name and the folder.',
    NT_STATUS_IO_TIMEOUT: 'No answer from the server. Check the address and that it is reachable '
        + 'from this machine.',
    NT_STATUS_CONNECTION_REFUSED: 'The server refused the connection. Check SMB is enabled and '
        + 'reachable on port 445.',
}[status] || `The file server returned ${status}.`);

const DESTINATIONS = { filesystem, smb, s3, sftp, sharepoint };

/** Everything the settings screen needs to draw the form, and no secrets. */
const describe = () => Object.values(DESTINATIONS).map((d) => ({
    key: d.key,
    name: d.name,
    description: d.description,
    fields: d.fields.map(({ key, label, type, placeholder, help, secret }) => ({
        key, label, type, placeholder, help, secret: Boolean(secret),
    })),
}));

const get = (key) => DESTINATIONS[key] || null;

/** Field keys that must be encrypted, for whoever is saving the settings. */
const secretFields = (key) =>
    (DESTINATIONS[key]?.fields || []).filter((f) => f.secret).map((f) => f.key);

module.exports = { DESTINATIONS, describe, get, secretFields };
