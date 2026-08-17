# Employee sign-in

How the 68 people in this system get onto the portal without an administrator
knowing 68 passwords.

## Why this exists

Portal passwords were set by an administrator and could not be changed by the
employee. That means one person permanently knows everyone's credentials, so a
punch recorded against somebody is not really attributable to them — which is
the one property an attendance record has to have. It also meant employees
punched from an admin account, and an admin token can punch **as anyone**,
because `/api/mobile/punch` takes the employee code from the request body.

Three sign-in methods are now available, and more than one can be on at once:

| Mode | Who it suits | What the app stores |
|---|---|---|
| `local` | sites with no directory; shop-floor staff with no mailbox | a bcrypt hash |
| `oidc` | anyone on Microsoft 365, Google Workspace, Okta | nothing |
| `ldap` | on-prem Active Directory, no internet needed | nothing |

`Settings → auth → employee_login_modes`, comma separated. Default `local`.

## Matching a directory account to an employee

First sign-in matches on **email or UPN**, held in `employees.directory_email`.
On success the directory's own immutable identifier — Entra's `oid`, AD's
`objectGUID` — is stored in `employees.directory_subject`, and every later
sign-in matches on that.

That second step matters here specifically. Your Wi-Fi EAP-TLS work ran into
`innopay.in` vs `innopayad.in`: the same people, two different UPN suffixes.
Whenever an address changes — a marriage, a domain migration, a tenant merge —
matching on the address alone locks somebody out of their own attendance
history. Matching on the immutable id does not care what the address becomes.

An account that matches nothing is refused with the address named, so HR can put
it on the right profile. It never creates an employee record; otherwise anyone
in the company could sign in once and generate themselves an attendance history.

## Entra ID (Microsoft 365)

In the Azure portal, **Entra ID → App registrations → New registration**:

- Name: `NeevTime Employee Portal`
- Supported account types: single tenant
- Redirect URI, type **Web**: `https://<your-host>/api/portal/auth/oidc/callback`

Then **Certificates & secrets → New client secret**. Copy the *Value* — it is
shown once.

Under **API permissions**, the delegated Microsoft Graph permissions `openid`,
`profile`, `email` are enough. No admin consent is required for those.

Set in `Settings → auth`:

| Key | Value |
|---|---|
| `employee_login_modes` | `local,oidc` |
| `oidc_issuer` | `https://login.microsoftonline.com/<tenant-id>/v2.0` |
| `oidc_client_id` | the Application (client) ID |
| `oidc_redirect_uri` | exactly what you registered above |

The secret goes in the environment, not the database:

```yaml
# docker-compose.yml, under the server service
environment:
  OIDC_CLIENT_SECRET: "<the secret value>"
```

A secret in a settings row is a secret in every backup, every export, and every
screenshot of the settings page.

**The redirect URI must be reachable from the employee's phone.** On a LAN-only
install that means it has to be the address they actually browse to. This is the
same problem the Cloudflare Tunnel work is solving; until that is in place,
single sign-on works only where the app itself is reachable.

## Active Directory over LDAP

Needs a read-only service account and LDAPS. Plain `ldap://` is refused, because
a simple bind sends the employee's domain password in clear text — on a flat
factory network that is every password on the wire. `LDAP_ALLOW_INSECURE=true`
overrides it if the link is genuinely private, and that decision should be
written down somewhere.

| Key | Example |
|---|---|
| `employee_login_modes` | `local,ldap` |
| `ldap_url` | `ldaps://dc01.innopayad.in:636` |
| `ldap_base_dn` | `DC=innopayad,DC=in` |
| `ldap_bind_dn` | `CN=svc-neevtime,OU=Service Accounts,DC=innopayad,DC=in` |
| `ldap_user_filter` | `(userPrincipalName={login})` |

```yaml
environment:
  LDAP_BIND_PASSWORD: "<service account password>"
```

`{login}` is substituted with what the employee typed, escaped per RFC 4515 — a
login of `*` would otherwise match every account in the directory.

The password is checked by binding **as the user**: the domain controller
accepts or refuses it. This app never compares, stores, or logs it.

To match on `sAMAccountName` instead of UPN, use
`(sAMAccountName={login})` — but then `directory_email` still has to hold
something the directory returns as `userPrincipalName` or `mail`, because that
is what the first match uses.

## Signing in with an employee code — who sets the password?

The employee does. An administrator issues a one-time code; the password itself
is chosen by the person who will use it, and nobody else ever sees it.

```
POST /api/employees/portal-invite
{ "employee_ids": [12, 13, 14] }
```

Each employee gets an eight-character code, valid 24 hours, usable once. Only
its hash is stored — an administrator cannot look one up tomorrow, and a stolen
database yields no working codes.

Delivery splits on whether the person has an address on file:

- **With an email** (`directory_email`, or the ordinary `email` field) — the code
  is emailed and is *not* returned to the administrator at all.
- **Without one** — the code comes back in `hand_out`, shown once, to be given
  on paper. Half a factory has no mailbox, and pretending otherwise means those
  people never get access.

The employee then opens `/portal`, presses **First time here?**, and enters
their employee code (`INT089`), the activation code, and a password of their
choosing. The alphabet excludes `O`/`0` and `I`/`1`, because these get read over
a phone and written on paper.

### If an administrator sets a password directly

`PUT /api/employees/:id/portal-password` still exists for the case where someone
is standing at the desk and needs access now. That password is flagged
`portal_must_change`: it gets the employee to the change-password screen and
nowhere else. The check is in the request guard, not the page, so a client that
skips the screen — or a script that never loads it — still cannot punch.

This matters more than it sounds. A punch made with a credential an
administrator knows is not evidence about who made it, which defeats the purpose
of collecting it.

### Forgotten passwords

`/portal` → **Forgot password** emails a fresh activation code, if the employee
has an address. It answers identically whether or not the employee code exists —
employee codes are printed on badges, and confirming which are real is a gift to
anyone holding one. Employees with no address go back to HR for a new code.

### Changing it later

`POST /api/portal/change-password` requires the current password even though the
session is already authenticated. An unlocked phone left on a bench should not
be enough to lock its owner out of their own attendance record.

## Rolling it out to 68 people

1. Put each person's work email in their profile (`directory_email`).
2. Enable portal access in bulk:

```
POST /api/employees/portal-access
{ "employee_ids": [1,2,3], "enabled": true }
```

It refuses to enable anyone with no `directory_email` and returns them in
`skipped`. Enabling someone who then cannot sign in looks like a working setup
until they try.

3. Employees go to `/portal` and press **Sign in with your company account**.

No password is set for directory sign-in. That is the entire point.

## What is deliberately not built

- **Auto-creating employees from directory accounts.** Attendance records would
  appear for anyone who signs in.
- **Group-based access control.** Every account that matches an employee record
  can sign in; there is no "only this AD group" filter yet. If you need one, it
  belongs in `linkIdentity`.
- **SCIM provisioning.** Employee records still come from the biometric readers
  and HR, not from the directory.
