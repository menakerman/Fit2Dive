# Deployment & Persistence

Fit2Dive stores **all** durable data — divers, users, certifications,
activities, required exams, OTP codes, login attempts and audit logs — in a
single SQLite database file. Per the project rule, that file must live on
storage that survives restarts, redeploys and container recreation. The
container filesystem is ephemeral and must never hold it.

## Where the database lives

The server resolves its data directory (`server/src/db.ts`) as follows:

1. **`DATA_DIR`** environment variable — **required in production**; point it at
   the mounted persistent volume. In production the server **refuses to start**
   (exits with an error) if `DATA_DIR` is not set, so it can never silently
   persist to the ephemeral container filesystem.
2. `server/data` in local development (when `NODE_ENV` is not `production`).

The resolved database path is logged on startup:

```
[persistence] SQLite database path: /app/data/fit2dive.db
```

## Required volume (production)

`/app/data` (or whatever `DATA_DIR` points to) **must be a mounted persistent
volume**. Without one, the directory is on the container's ephemeral overlay
filesystem and the entire database is wiped on every restart or redeploy.

### Railway

Railway volumes are created per-service. Configure one for this service:

1. In the service → **Settings → Volumes**, add a volume.
2. Set its **mount path** to `/app/data` (or set `DATA_DIR` to the volume's
   mount path if you use a different one).
3. Redeploy. Confirm the startup log shows the database path under the mounted
   volume, and that data survives a redeploy.

Set `DATA_DIR` to the volume's mount path (e.g. `/app/data`). In production the
server will exit on startup with a `[persistence] FATAL: DATA_DIR is not set …`
error if it is missing, so a misconfigured deploy fails fast instead of quietly
losing data.

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATA_DIR` | **Yes (prod)** | Absolute path to the persistent data directory (the mounted volume). Server refuses to start in production without it. |
| `JWT_SECRET` | **Yes (prod)** | Secret for signing auth tokens. The server refuses to start in production without it (dev uses a dev-only fallback). |
| `PORT` | No | HTTP port (default 3001). |
| `SMS_019_TOKEN` | No | 019 SMS API token (sent as `Authorization: Bearer`). Enables SMS OTP. |
| `SMS_019_USERNAME` | No | 019 account username. |
| `SMS_019_SOURCE` | No | Approved 019 sender ID (≤11 chars). |
| `SMS_019_API_URL` | No | Override the 019 endpoint; set to `https://019sms.co.il/api/test` to validate without sending. Defaults to production. |
| `SENDGRID_API_KEY` | No | Enables emailing diver OTP codes. |
| `SENDGRID_FROM_EMAIL` | No | Verified SendGrid sender address. |
| `SENDGRID_FROM_NAME` | No | Sender display name (defaults to the org name). |

OTP delivery order: **SMS (019)** if configured and the diver has a phone → **email** (SendGrid) if configured and the diver has an address → otherwise the code is returned on screen (testing fallback).

## Backups

Because everything lives in one SQLite file, back up
`${DATA_DIR}/fit2dive.db` (and its `-wal`/`-shm` companions, or checkpoint
first) from the volume on a schedule appropriate to the data's importance.
