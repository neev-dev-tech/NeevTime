# NeevTime

Biometric attendance for Indian workplaces. Punches arrive from ZKTeco-family
readers over ADMS, or from an employee's phone with a geofence and a selfie;
they become attendance, statutory registers, and payroll input.

Self-hosted by design — it runs on a closed LAN with no internet connection,
because the data is biometric identifiers and payroll records.

## Install

```bash
./install.sh
```

Full procedure, including the three things the script cannot do for you:
**[docs/INSTALL.md](docs/INSTALL.md)**

## Operating it

| | |
|---|---|
| Did that deploy work? | `./verify-deploy.sh` |
| Backups, and where to send them | [docs/BACKUP_DESTINATIONS.md](docs/BACKUP_DESTINATIONS.md) |
| Employees signing in — SSO, LDAP, passwords | [docs/EMPLOYEE_SIGN_IN.md](docs/EMPLOYEE_SIGN_IN.md) |
| Access from outside the LAN | [docs/REMOTE_ACCESS.md](docs/REMOTE_ACCESS.md) |
| ERPNext and other HR systems | [docs/integrations.md](docs/integrations.md) |
| What is built next, and why in that order | [docs/ROADMAP.md](docs/ROADMAP.md) |

## Layout

```
server/     Express API, ADMS endpoint for the readers, attendance engine
client/     React admin application and the employee portal
database/   000_schema.sql — the authoritative schema, loaded on first boot
docs/       the documents above
```

## Tests

```bash
cd server && node --test "tests/*.test.js"    # ~290, no database required for most
cd client && npm run build                     # includes lint and the UI guards
```

CI additionally installs the product from scratch on a clean machine, loads
every screen in a real browser, and proves a punch can reach the application
through nginx.
