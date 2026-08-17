# NeevTime — Reaching the App From Outside, Safely

**Cloudflare Tunnel, and what has to be true before you turn it on**

17 August 2026

---

## What this is for

Employees punching from a site, or checking their own attendance, without being on the office network and without a VPN client on every phone.

It is **not** for putting the admin console on the internet. That distinction is the whole of this document.

---

## Why a tunnel rather than forwarding a port

Forwarding 443 on the Sophos to `192.168.1.237` works, and I would not do it.

It puts an administrative interface holding **biometric identifiers and payroll records** on the public internet, answering unsolicited connections from every scanner that walks the address space, behind a self-signed certificate. The first bad day is a credential-stuffing run against `/api/login`.

`cloudflared` dials **outward** and holds the connection open. Nothing on the firewall changes. There is no inbound surface to find, so the scanners have nothing to knock on. You also get a real certificate and a proper hostname, which the self-signed pair never gave you.

---

## The three things that make it safe

Installing the tunnel is ten minutes. These are the parts that matter, and skipping any one of them makes the tunnel worse than no remote access at all.

### 1 · Expose the portal, not the admin console

The employee portal (`/portal`) and its API (`/api/portal`) are what staff need. The admin console is not.

In the Cloudflare dashboard, the public hostname's **Path** setting decides this. Route only:

```
/portal
/api/portal
/assets          (the JavaScript and CSS the page needs)
```

Everything else returns 404 from Cloudflare's edge, and never reaches your server. Someone who learns the hostname finds a login page for their own attendance record and nothing else.

### 2 · Put Cloudflare Access in front of it

Zero Trust → Access → Applications → Add an application, self-hosted, on the same hostname.

Add an identity provider — **Microsoft Entra ID**, since the organisation is already on Microsoft 365. Then a policy: *Allow, emails ending `@innopay.in`*.

The effect is that a visitor must sign in with their work account **before the request reaches NeevTime at all**. The application's own login then still applies. Two independent layers, and the outer one is maintained by people who do nothing else.

This also solves the leaving-employee problem for free: disable the Microsoft account and their access to the portal ends the same minute, whatever the app thinks.

### 3 · Never expose `/iclock`

The biometric readers speak to `/iclock` in clear text with no authentication worth the name. That is acceptable on a LAN where the devices physically are. On the internet it is an open door to insert attendance records.

The readers are on `10.81.20.x` and always will be. **`/iclock` must not be in the tunnel's path list.** If a reader is ever genuinely remote, it needs a site-to-site link, not a public path.

---

## Setup

### On Cloudflare

1. **Zero Trust → Networks → Tunnels → Create a tunnel.** Name it `neevtime`.
2. Choose **Docker** as the connector. Copy the token from the command it shows — the long string after `--token`. That token is a credential: it can create tunnels into your network. Treat it like a password.
3. **Public hostname:** for example `attendance.yourdomain.com`.
   - Service: `HTTP` → `client:80`
   - Path: add the three paths from §1, one entry each.
4. **Access → Applications → Add:** self-hosted, same hostname, Entra ID policy as in §2.

### On the server

Put the token in `.env` — never on a command line, where `ps` and `docker ps` show it to every process on the host:

```
TUNNEL_TOKEN=eyJhIjoi...
```

Then start it. The profile means the tunnel never runs unless asked for:

```
cd ~/NeevTime/NeevTime
docker compose --profile tunnel up -d cloudflared
docker compose logs --tail 20 cloudflared
```

A healthy start logs `Registered tunnel connection` four times — Cloudflare holds several for redundancy.

To stop it, and close the door completely:

```
docker compose stop cloudflared
```

---

## Proving it is actually restricted

Do all four. The first two prove it works; the last two prove it is *not* more open than intended, which is the part people skip.

```
# 1. The portal is reachable and asks Cloudflare Access to sign you in
curl -sI https://attendance.yourdomain.com/portal | head -3

# 2. The admin console is not reachable at all
curl -s -o /dev/null -w "admin console: %{http_code}\n" \
  https://attendance.yourdomain.com/

# 3. The device endpoint is not reachable
curl -s -o /dev/null -w "iclock: %{http_code}\n" \
  https://attendance.yourdomain.com/iclock/cdata

# 4. The admin API is not reachable
curl -s -o /dev/null -w "admin api: %{http_code}\n" \
  https://attendance.yourdomain.com/api/employees
```

Expected: **1** redirects to a Microsoft sign-in; **2, 3 and 4 return 404** from Cloudflare's edge.

If 2, 3 or 4 return anything else, the path list is wrong and the tunnel is exposing more than the portal. Stop the tunnel, fix the paths, test again.

---

## Before you publish anything

**Configure a geofence.** Once employees can punch from anywhere, the geofence is the only thing making a punch mean "was at work". No fence means every punch is refused, which is the safe default — but a fence with a 5 km radius is worse than none, because it looks like a control and is not.

**Pair it with the photo.** Position and a face together are much harder to fake than either alone, and the photo is captured at the moment of the punch rather than chosen from a gallery.

**Decide the retention.** Photos default to 90 days (`Settings → Attendance`). Under the DPDP Act these are personal data; keeping them indefinitely is a liability rather than a benefit. The attendance record itself is the evidence that must be kept for years.

---

## What this does not solve

- **A phone with a spoofed location.** Rooted or developer-mode devices can lie about GPS. The photo is the compensating control; if the risk is material for a customer, biometric readers on site remain the answer.
- **A shared portal password.** Employee portal accounts are as good as the passwords chosen for them. Cloudflare Access in front means a shared password is still gated by the person's own Microsoft sign-in, which is the strongest reason to do §2.
- **Availability.** If Cloudflare has an outage, remote punching stops. The readers on site are unaffected — they talk to the LAN and never traverse the tunnel.

---

## Cost

Cloudflare Tunnel is free. Cloudflare Access is free for up to 50 users; beyond that it is a few dollars per user per month. Both are reversible in minutes: stop the container and the hostname stops resolving to anything.
