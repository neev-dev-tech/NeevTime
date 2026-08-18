# Installing NeevTime

One procedure, on a clean machine, start to finish.

```bash
git clone https://github.com/neev-dev-tech/NeevTime.git
cd NeevTime
./install.sh
```

That is the installation. This document explains what the script does, and
covers the decisions it cannot make for you.

**The script is the procedure.** Steps written in prose beside a script that
performs them disagree within a month, and the prose is what a customer follows.
CI runs `install.sh` on a fresh runner on every push and then proves a punch can
reach the application through nginx — so the documented install is the tested
install. This file was written after that job passed, not before.

Fifteen deployment documents used to describe this, in six variations, several
naming a product this has not been called for a year. They are gone; git has
them if a detail turns out to be missing here.

---

## What you need first

| | |
|---|---|
| **Machine** | any Linux host with 2 GB RAM and 20 GB disk. A VM is fine. |
| **Docker** | Engine plus Compose **v2** (the `docker compose` subcommand, not `docker-compose`). |
| **Network** | the readers must reach it on **port 80**; people reach it on **443**. |
| **Not needed** | an internet connection at run time. It is designed to run on a closed LAN. |

### On a fresh Linux host

Two things trip people up before the script ever runs:

```bash
sudo usermod -aG docker $USER   # then log out and back in, or `newgrp docker`
sudo ufw allow 80/tcp           # the readers; also the redirect to HTTPS
sudo ufw allow 443/tcp          # people
```

Port 5432 is published for administration on the LAN. If the machine is exposed
to anything wider, do not open it — nothing outside the box needs it.

## What `install.sh` does

1. **Checks Docker** is present and the daemon is reachable.
2. **Writes `.env`** with generated secrets, mode 600, if one does not exist. It
   never overwrites an existing file — those secrets are the only copy, and
   regenerating `JWT_SECRET` signs everybody out.
3. **Creates the database volume** `neevtime_postgres_data`.
4. **Builds and starts** the containers.
5. **Waits** for `/api/health`, polling for up to three minutes, because a first
   boot includes creating the database and loading the schema.
6. **Prints the first administrator's password**, once.

Re-running it is safe. It creates what is missing and leaves what exists alone.

### Two steps that fail loudly on purpose

**The database volume is `external`.** A missing volume stops the deploy instead
of silently starting an empty database. On 16 August 2026 a deploy came up on a
stale volume, served a five-month-old copy without complaint, and was reported
as catastrophic data loss for several hours. An empty database looks exactly
like a destroyed one from the outside. The cost of that safety is one
`docker volume create` on a new install, which the script performs.

**There are no default secrets.** `JWT_SECRET` and `DB_PASSWORD` have no
fallback: compose refuses to start without them. They previously defaulted to
values published in this repository, and sessions are signed with `JWT_SECRET` —
so an install that skipped the env file was one where anyone holding the source
could mint an administrator token without knowing a password.

**There is no default administrator.** No `admin/admin`. On first boot, if no
user exists, one is created and its password is printed once to the server log.
Set `ADMIN_PASSWORD` in `.env` beforehand to choose it yourself.

---

## After the script — three things it cannot do for you

### 1. SMTP

`Settings → Email/SMTP`. Password resets, employee activation codes, scheduled
reports and every alert go through it. Without it, a forgotten password becomes
a job for you.

Send yourself the test message on that page. A saved configuration is not a
working one.

### 2. An off-machine backup copy

Backups run nightly and land on a volume that survives redeploys. That protects
against a bad migration. It does not protect against losing the machine, because
the database and its backups are the same disk.

Mount a NAS, second disk, or remote share on the host, point `BACKUP_EXTERNAL_DIR`
in `.env` at it, restart, then set `/mnt/backup-external` as the second copy in
`Settings → Database`. Destinations and how to test each: `docs/BACKUP_DESTINATIONS.md`.

Then **restore one** into a scratch database. A backup nobody has restored is a
file, not a backup.

### 3. The readers

Point each device's ADMS server at this machine, **port 80**, path `/iclock`.

Clear text, deliberately, and it must stay that way. The readers are embedded
HTTP clients that cannot follow a redirect; a check in CI fails if `/iclock`
ever starts redirecting. Browser traffic on port 80 is redirected to HTTPS as
normal — this exception is scoped to that one path.

---

## Certificates

The install generates a self-signed pair, so browsers warn on first visit. The
certificate lives on its own volume: without that, every deploy issued a new one
and every visit produced a fresh warning, which teaches people to click through
warnings.

For a real certificate, replace `cert.pem` and `key.pem` in the `nginx_certs`
volume and restart the client container. `TLS_COMMON_NAME` in `.env` sets the
name on the generated certificate — use the hostname people will actually type.

## Verifying

```bash
./verify-deploy.sh
```

It checks containers, HTTP, the deployed bundle against what the container
holds, `/iclock` through nginx, and whether punches are arriving. Fourteen
checks; it fails rather than warns when the product has stopped doing its job.

## Updating

```bash
git pull && docker compose up -d --build client server && ./verify-deploy.sh
```

The database is untouched by this. Schema changes apply themselves at boot.

## Remote access

Nothing is exposed by installing this. For access from outside the LAN without a
VPN, read `docs/REMOTE_ACCESS.md` — the tunnel is the easy half; the access
policy is what makes it safe.

## When it does not work

| What you see | What it is |
|---|---|
| `set DB_PASSWORD in .env` | no `.env`. Run `./install.sh`. |
| `external volume not found` | run `./install.sh`, or `docker volume create neevtime_postgres_data`. |
| Health check never answers | `docker compose logs --tail 40 server` |
| Readers deliver nothing | `curl -o /dev/null -w '%{http_code}\n' http://localhost/iclock/cdata` — a 502 means nginx is up and the API is not. |
| Browser shows an old version | `./verify-deploy.sh` compares what is served against what the container holds. If they match, it is your browser cache. |
