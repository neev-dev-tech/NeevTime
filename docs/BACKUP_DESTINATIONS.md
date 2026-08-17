# NeevTime — Backup Destinations

**Configuring and testing every place a backup can go**

17 August 2026

---

## How the second copy works

NeevTime always writes a backup to the server itself. A **second copy** sends the same file somewhere else, on every backup — scheduled or manual.

A dump beside the database survives a bad migration. It does not survive the disk, the machine, or the room. The second copy is what makes a backup a backup.

Everything below is configured in one place: **System → Database → Backup**, in the panel headed *Second copy — where backups also go*.

### The Test button is the point

Every destination has a **Test** button that writes a small file, reads it back, and deletes it.

That is deliberate, and it is not the same as checking a folder is reachable. An account with read access but no write access passes a listing and then fails every backup afterwards, silently, for months. Test proves the thing that actually matters.

**Always press Test before Save.** A green result means a real file made the round trip.

### One rule for all of them

A failed second copy never fails the backup. The local dump is written first and kept regardless — losing both because a file server was switched off would be the wrong trade. When a copy fails, the reason appears on screen after a manual backup, and in the server log after a scheduled one.

---

## 1 · Folder or mounted share

**Use when:** you have a NAS, a Windows share, or a second disk that can be mounted on the NeevTime server.

**Stores no credentials at all** — which makes it the safest option when it is available.

### Configuration

| Field | Value |
|---|---|
| Path | `/mnt/backup-external` |

### What has to be true first

The path is inside the application container. `/mnt/backup-external` is mapped to a folder on the server, set by `BACKUP_EXTERNAL_DIR` in `.env` (default `/opt/neevtime-backups`).

For a copy that leaves the machine, point that at a mounted share:

```
sudo mkdir -p /mnt/nas-backups
sudo mount -t cifs "//SERVER/SHARE" /mnt/nas-backups -o username=ACCOUNT,vers=3.0
```

Then in `.env` on the server:

```
BACKUP_EXTERNAL_DIR=/mnt/nas-backups
```

and redeploy. The path inside NeevTime stays `/mnt/backup-external`; only where it points changes.

To survive a reboot, add the mount to `/etc/fstab` with a credentials file.

### Testing it

Press **Test**. Two possible successes, and the difference matters:

- *"Writable, and on a separate mount — copies survive a redeploy."* — correct.
- *"Writable, but this is inside the container."* — it works today and every copy is deleted on the next deploy. The mount is missing.

### Common failures

| Message | Cause |
|---|---|
| `is a Windows path` | A UNC path such as `\\server\share` was entered. Linux cannot use one. Mount it, or use the SMB destination. |
| `EACCES: permission denied` | The mount is read-only, or owned by another user. Add `uid=0,gid=0` to the mount options. |
| `ENOENT: no such file or directory` | `BACKUP_EXTERNAL_DIR` points at something that does not exist on the host. |

---

## 2 · S3-compatible storage

**Use when:** you want the copy to leave the building entirely, without another machine to look after.

Works with **AWS S3, MinIO, Backblaze B2, Wasabi**, and anything else speaking the S3 API. One implementation covers all of them.

### What to obtain first

**AWS S3**
1. S3 console → **Create bucket**. Note the name and region.
2. IAM → **Users** → create a user for backups, no console access.
3. Attach a policy allowing `s3:PutObject`, `s3:GetObject` and `s3:DeleteObject` on `arn:aws:s3:::YOUR-BUCKET/*`. Do not grant more.
4. **Security credentials** → create an access key. The secret is shown once.

**Backblaze B2** — create a bucket, then an application key scoped to it. B2 gives you an endpoint like `https://s3.us-west-004.backblazeb2.com`.

**Wasabi** — same shape; endpoint like `https://s3.ap-southeast-1.wasabisys.com`.

**MinIO (self-hosted)** — bucket via the console, then an access key pair.

### Configuration

| Field | Value | Notes |
|---|---|---|
| Endpoint | `https://s3.ap-south-1.amazonaws.com` | **Leave empty for AWS** if the region is set. Required for B2, Wasabi and MinIO. |
| Region | `ap-south-1` | AWS region, or the one your provider states. |
| Bucket | `neevtime-backups` | Must already exist. |
| Folder inside the bucket | `vayudb/` | Optional. Trailing slash. |
| Access key ID | | |
| Secret access key | | Stored encrypted. |

### Testing it

Press **Test**. It uploads a probe object, downloads it, compares the contents and deletes it. Success reads *"Wrote, read and deleted a probe object in `<bucket>`."*

### Common failures

| Message | Cause |
|---|---|
| `The specified bucket does not exist` | Wrong bucket name, or wrong region for that bucket. |
| `SignatureDoesNotMatch` | Secret key is wrong, or has a trailing space. |
| `AccessDenied` | The key exists but the policy does not allow `PutObject` on that path. |
| `getaddrinfo ENOTFOUND` | Endpoint hostname is wrong or unreachable from the server. |

### Cost

A backup is about 11 MB today and grows with attendance history. Seven daily copies is under a gigabyte. On B2 or Wasabi that is a few dollars a month; on AWS, similar with lifecycle rules.

---

## 3 · Another server over SFTP

**Use when:** you have a second Linux machine, on site or elsewhere.

### Two ways to authenticate — prefer the key

**A key file (recommended).** Nothing sensitive is stored in NeevTime; only the path to a key already on the server.

On the NeevTime server:

```
sudo mkdir -p /opt/neevtime-backups/.ssh
sudo ssh-keygen -t ed25519 -f /opt/neevtime-backups/.ssh/backup_key -N ""
sudo cat /opt/neevtime-backups/.ssh/backup_key.pub
```

Add that public key to `~/.ssh/authorized_keys` on the destination server. The file must be readable by the application container — `/opt/neevtime-backups` is already mounted at `/mnt/backup-external`, so the path to enter is `/mnt/backup-external/.ssh/backup_key`.

**A password.** Stored encrypted, but a password that can write to another server is worth more than most rows in the database. Use the key where you can.

### Configuration

| Field | Value |
|---|---|
| Host | `192.168.1.50` |
| Port | `22` |
| Username | `backups` |
| Private key file (on this server) | `/mnt/backup-external/.ssh/backup_key` |
| Password | only if no key |
| Remote folder | `/backups/neevtime` |

The remote folder is created if it does not exist.

### Testing it

Press **Test**. It connects, creates the folder if needed, uploads a probe, reads it back and deletes it.

### Common failures

| Message | Cause |
|---|---|
| `All configured authentication methods failed` | Wrong username, or the public key is not in `authorized_keys` on the destination. |
| `ENOENT ... backup_key` | The key path is wrong *inside the container*. It must be under `/mnt/backup-external`. |
| `Permission denied` on upload | The account cannot write to the remote folder. |
| `connect ETIMEDOUT` | Firewall, or the host is unreachable from the NeevTime server. |

---

## 4 · SharePoint or OneDrive

**Use when:** you are on Microsoft 365 and want the copy in the tenant rather than on hardware you maintain.

**This one needs an Azure administrator before any configuration can be done, and it is the only destination not verified automatically** — see *What is proven* at the end.

A SharePoint **sharing link is not usable here.** A link points a browser at a folder; the backup authenticates as an application and uploads. Different mechanisms.

### What an administrator must do first

1. **Azure Portal → App registrations → New registration.** Name it `NeevTime Backup`. Single tenant.
2. From the **Overview** page, copy the **Directory (tenant) ID** and the **Application (client) ID**.
3. **Certificates & secrets → New client secret.** Copy the **Value** immediately — it is shown once. Note its expiry; the backup stops working the day it lapses.
4. **API permissions → Add a permission → Microsoft Graph → Application permissions.**
   - `Sites.Selected` — preferred. Access only to the site you grant, rather than every file in the tenant.
   - `Files.ReadWrite.All` — works, but grants access to everything. Use only if `Sites.Selected` is not practical.
5. **Grant admin consent.** Nothing works without this step.
6. If using `Sites.Selected`, grant the app write access to the specific site (PowerShell or Graph; your admin will know the procedure).

### Finding the drive ID

The drive is the document library. With the app registered, from any machine with `curl`:

```
curl -s -X POST "https://login.microsoftonline.com/TENANT_ID/oauth2/v2.0/token" \
  -d "client_id=CLIENT_ID" -d "client_secret=CLIENT_SECRET" \
  -d "scope=https://graph.microsoft.com/.default" -d "grant_type=client_credentials"
```

Take the `access_token` from that, then:

```
curl -s -H "Authorization: Bearer ACCESS_TOKEN" \
  "https://graph.microsoft.com/v1.0/sites/YOURTENANT.sharepoint.com:/sites/YOURSITE:/drives"
```

The `id` of the library you want is the **Drive ID**.

Do not run these on a shared machine — the secret appears in the command. Use a private terminal and clear the history afterwards.

### Configuration

| Field | Value |
|---|---|
| Directory (tenant) ID | from step 2 |
| Application (client) ID | from step 2 |
| Client secret | from step 3, stored encrypted |
| Drive ID | from the lookup above |
| Folder path in the library | `NeevTime/backups` |

### Testing it

Press **Test**. It requests a token, uploads a probe file, then deletes it.

### Common failures

| Message | Cause |
|---|---|
| `AADSTS7000215: Invalid client secret` | Secret is wrong, or has expired. |
| `AADSTS700016: Application not found` | Wrong client ID, or wrong tenant. |
| `403 Forbidden` on upload | Admin consent was not granted, or `Sites.Selected` has no grant for that site. |
| `404` on upload | Wrong drive ID, or the folder path is wrong. |

### Secret expiry

Azure client secrets expire — commonly in 6, 12 or 24 months. **Put the expiry date in a calendar.** When it lapses the backup fails nightly, and the only sign is an alert email and a log line.

---

## After configuring any destination

### 1 · Prove a real backup copies

**System → Database → Backup → Create Backup.** The message afterwards says one of three things: no second copy configured, copied to *where*, or the copy failed and why.

Then look at the destination yourself and confirm the file is there with a sensible size — around 11 MB, not zero.

### 2 · Prove the scheduled one copies

The schedule takes one backup per day. If today's has already run, the next is tomorrow.

The morning after, check the file exists in both places, named `auto-YYYY-MM-DDTHH-MM-SS.dump`.

### 3 · Rehearse a restore — the step everyone skips

A backup nobody has restored is a hypothesis. Restore into a scratch database, never over the live one:

```
docker exec attendance_db sh -c 'psql -U "$POSTGRES_USER" -c "CREATE DATABASE restore_check"'

docker exec attendance_server sh -c 'PGPASSWORD=$DB_PASSWORD pg_restore -h $DB_SERVER \
  -U $DB_USER -d restore_check --no-owner "/app/backups/FILENAME.dump"'

docker exec attendance_db sh -c 'psql -U "$POSTGRES_USER" -d restore_check -c \
  "SELECT (SELECT count(*) FROM employees) AS employees, \
          (SELECT count(*) FROM attendance_logs) AS punches, \
          (SELECT max(punch_time) FROM attendance_logs) AS last_punch"'

docker exec attendance_db sh -c 'psql -U "$POSTGRES_USER" -c "DROP DATABASE restore_check"'
```

The counts must match the live system. `DROP DATABASE` here removes only the scratch copy created on the first line.

Do this once when a destination is set up, and once a year thereafter.

---

## What is proven, and what is not

Every push to this codebase runs each destination against a **real server of that kind** — a Samba server, a MinIO object store and an SSH server — writing a file, reading it back and deleting it. Not a mock: a mock agrees with whatever the code does, including being wrong.

| Destination | Verified automatically |
|---|---|
| Folder or mounted share | Yes |
| Windows share (SMB) | Yes |
| S3-compatible | Yes |
| SFTP | Yes |
| SharePoint / OneDrive | **No** |

SharePoint authenticates against Microsoft's identity platform and there is no local emulator worth trusting. Verifying it needs a real tenant, an app registration and admin consent. The code is written carefully and follows Graph's documented behaviour, but it has not been exercised end to end — so if you configure it, treat the first successful Test and the first restored file as the verification.

---

## Which to choose

| Situation | Destination |
|---|---|
| A NAS or file server on the LAN | Folder or mounted share, or Windows share (SMB) |
| A Windows file server, no mounting allowed | Windows share (SMB) |
| Nothing on site should be trusted to survive | S3-compatible |
| A second Linux machine already exists | SFTP |
| Microsoft 365 tenant, admin available | SharePoint |

**The most common good answer is two of them.** A share on the LAN for fast recovery, and object storage off site for the case where the building is the problem. Only one can be configured in NeevTime at a time; the second copy can be handled by the file server's own replication or a scheduled copy on the NAS.
