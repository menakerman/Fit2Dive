# Fit2Dive — Security Audit & Data-Protection Plan

_Audit date: 2026-07-17 · Scope: full project (server, client, deployment, dependencies)._

This system holds sensitive personal and **medical/fitness** data for hundreds of
divers (names, personal numbers, phones, emails, fitness status, exam notes). The
findings below are ordered by severity, each with the location, impact, and fix,
followed by a phased remediation plan.

> **Bottom line:** authorization (roles/scoping) and SQL handling are solid, but
> **authentication is effectively bypassable** — a static shared staff OTP plus a
> default admin password that self-resets on every boot means anyone on the
> internet can currently sign in as admin and export all data. These are the
> first things to fix.

## Severity summary

| # | Severity | Finding |
|---|----------|---------|
| 1 | 🔴 Critical | Static shared staff 2FA code (`150475`), hardcoded & logged |
| 2 | 🔴 Critical | Default `admin/admin123` force-reset to `admin123` on every startup |
| 3 | 🟠 High | `xlsx` (SheetJS) dependency: prototype pollution + ReDoS, no fix, parses uploads |
| 4 | 🟠 High | `JWT_SECRET` has an insecure hardcoded fallback |
| 5 | 🟠 High | Diver OTP code returned in API response and shown on screen (fallback) |
| 6 | 🟡 Medium | No rate limiting (brute force, SMS-cost abuse, enumeration) |
| 7 | 🟡 Medium | CORS allows all origins in production |
| 8 | 🟡 Medium | No security headers (HSTS/CSP/X-Frame-Options/…) |
| 9 | 🟡 Medium | Login factors (phone + personal number) are semi-public |
| 10 | 🟡 Medium | `trust proxy` not set → audit-log IPs are the proxy, not the client |
| 11 | 🔵 Low | bcrypt cost 10; 24h staff tokens with no revocation; verbose secret logging; no size limit; no backups; unencrypted at rest; data-retention/consent gaps |

## What's already good (keep it)

- **Parameterized SQL everywhere** — no injection surface (interpolated values are `parseInt`ed or constants).
- **Solid RBAC** — per-role guards plus team/self scoping (see `docs/ROLES_AND_PERMISSIONS.md`).
- **Account lockout** on repeated failed logins (staff and diver).
- **Audit logs** — `user_login_log`, `diver_access_log`.
- **bcrypt** password hashing; **secrets in env** (`.env` gitignored).
- **HTTPS** via Railway; **persistence** hardened (`DATA_DIR` hard-fail).

---

## Critical findings

### 1. Static, shared staff 2FA code
`server/src/routes/auth.ts:115` — `const STAFF_OTP = '150475'` verifies every staff
login, and `auth.ts:99` logs it to the console on every password step.

**Impact:** the "OTP" second factor is a public constant identical for all staff.
Anyone who has (or guesses) a username+password completes login with `150475`.
Combined with finding #2 this is a full authentication bypass.

**Fix:** issue a real per-login OTP (random 6 digits, short TTL, single-use, stored
hashed) delivered by SMS/email — reuse the diver OTP machinery (`diver_otp_codes`,
`sms.ts`, `email.ts`). Remove the constant and the console log. Rate-limit + lock
out on failed OTP.

### 2. Default admin that self-heals to `admin123`
`server/src/db.ts:213-229` — seeds `admin/admin123`, and on **every startup**, if the
admin password isn't `admin123`, it **re-hashes it back to `admin123`**.

**Impact:** the admin password cannot be changed — every restart/redeploy reverts
it. This is a permanent, publicly-known backdoor to the highest-privilege account.

**Fix:** delete the re-hash block entirely. Seed the initial admin from a
`SEED_ADMIN_PASSWORD` env var (or force a password reset on first login) and only
when no users exist. Rotate the current admin credential immediately.

---

## High findings

### 3. `xlsx` (SheetJS) known-vulnerable, parses user uploads
`npm audit`: HIGH prototype pollution + ReDoS, **no npm fix available**. Used in
`upload.ts` / `activities.ts` / `users.ts` to parse attacker-influenceable files.

**Fix:** migrate to the maintained SheetJS build (`https://cdn.sheetjs.com`, not the
npm `xlsx`) or `exceljs`; validate/size-cap files; parse defensively.

### 4. Insecure `JWT_SECRET` fallback
`server/src/middleware/auth.ts:5` — `process.env.JWT_SECRET || 'fit2dive-secret-key-change-in-production'`.
Prod currently sets `JWT_SECRET` (good), but the code will boot with a **public**
signing key if it's ever unset → forgeable tokens for any role.

**Fix:** require `JWT_SECRET` in production (hard-fail like `DATA_DIR`); no default.

### 5. OTP code disclosed to the client
`server/src/routes/diverAuth.ts:103` returns `otp_code` when delivery "failed", and
`DiverOtpLogin.tsx:168` renders it on screen. A transient SMS failure exposes the
code to whoever submitted the request.

**Fix:** never return the code in production; gate the on-screen fallback behind a
non-production flag. On delivery failure, show "code could not be sent".

---

## Medium findings

- **6. No rate limiting.** `login`, `request-otp`, `verify-otp` are unthrottled
  beyond per-account lockout. Enables credential brute force, **SMS-cost abuse**
  (spamming `request-otp` for a known phone+PN sends real 019 SMS), and account
  enumeration. **Fix:** add `express-rate-limit` per-IP on all auth/OTP routes and
  a per-phone cap on `request-otp`; set `app.set('trust proxy', 1)` so limits key
  on the real client IP.
- **7. CORS allow-all in production.** `index.ts:21` uses `cors({})` in prod.
  **Fix:** restrict to the known frontend origin.
- **8. No security headers.** No `helmet`. Missing HSTS, X-Frame-Options,
  X-Content-Type-Options, Referrer-Policy, CSP. **Fix:** add `helmet` with a CSP.
- **9. Semi-public login factors.** Diver login is phone + personal number, both
  printed on rosters — low secrecy. OTP mitigates, but treat these as identifiers,
  not secrets; rely on the OTP + lockout + rate limiting for actual auth.
- **10. `trust proxy` unset.** Behind Railway's proxy, `req.ip` is the proxy IP, so
  `user_login_log`/`diver_access_log` record the wrong address. **Fix:** set trust
  proxy.
- **(also)** `react-router` moderate open-redirect — `npm audit fix`.

## Low / hardening

- Raise bcrypt cost 10 → 12. · Shorten staff token (24h) + add revocation/refresh.
- Stop logging OTP codes / secrets to console (they land in Railway logs).
- `express.json({ limit: '100kb' })` explicit cap.
- **Automated DB backups** of `${DATA_DIR}/fit2dive.db` (data-loss protection).
- **Encryption at rest** — the SQLite file is plaintext on the volume; consider
  SQLCipher or volume encryption for medical PII.
- **Per-person admin accounts** instead of one shared `admin`; attribute actions.
- **Privacy/retention** — document lawful basis for storing medical data, a
  retention policy, and a deletion (right-to-erasure) path.

---

## Remediation plan

### P0 — Do now (auth bypass; hours)
1. **Remove the admin self-reset** (`db.ts`) and **rotate the admin password**; seed
   from `SEED_ADMIN_PASSWORD`, only when no users exist.
2. **Replace the static staff OTP** with a real per-login OTP (SMS/email, hashed,
   single-use, TTL, lockout). Remove `150475` and its console log.
3. **Hard-fail without `JWT_SECRET`** in production; drop the default.
4. **Disable the OTP on-screen/response fallback** in production.

### P1 — This week (exposure & abuse; 1–2 days)
5. Add **rate limiting** + `trust proxy`; per-phone cap on `request-otp`.
6. Add **`helmet`** (security headers + CSP) and **restrict CORS** to the frontend origin.
7. Replace/upgrade **`xlsx`**; run `npm audit fix` for react-router.
8. Stop logging secrets; add `express.json` size limit.

### P2 — Hardening & data protection (ongoing)
9. **Automated encrypted backups** of the DB; test restores.
10. **Encryption at rest** for the DB (SQLCipher / encrypted volume).
11. Bcrypt cost → 12; shorter staff sessions + token revocation.
12. Per-person admin accounts; expand audit logging (who changed what).
13. **Privacy program**: retention policy, deletion path, consent/lawful basis for medical data, access reviews.

### Suggested first PR (smallest change, biggest risk reduction)
Remove the admin self-reset + rotate the password, replace the static staff OTP,
and require `JWT_SECRET` — this closes the end-to-end "log in as admin from the
internet and export everything" path.
