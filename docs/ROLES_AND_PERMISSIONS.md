# Fit2Dive — Roles & Permissions

This document lists every role in the system and exactly which operations each
role can and cannot perform. It is derived from the server route definitions
(`server/src/routes/*`) and the authorization middleware
(`server/src/middleware/auth.ts`), which is the single source of truth for
access control.

Enforcement is per-endpoint: `authenticate` verifies a JWT, `requireRole(...)`
restricts by role, and several routes apply an additional **team scope** or
**self scope** check inside the handler.

---

## Roles

| Role key   | Hebrew name | Who they are | How they log in |
|------------|-------------|--------------|-----------------|
| `manager`  | מנהל        | System administrator. Full control over everything. | Username + password + staff OTP |
| `secretary`| מזכירה      | Back-office staff. Manages divers, activities, certifications org-wide, but not users/teams/config. | Username + password + staff OTP |
| `madar`    | מד"ר        | Team commander. Same data operations as secretary **but limited to their own team**. | Username + password + staff OTP |
| `diver`    | צולל        | End user. Read-only, and only their own record. | Self-service OTP (phone + personal number / מספר אישי) |

**Scope rules used below**

- **All** — every diver/record in the system.
- **Own team** — only divers assigned to the `madar`'s `team_id` (via `diver_teams`).
- **Self only** — only the diver's own record (matched on `diverId` in the token).

---

## Permission matrix

Legend: ✅ allowed · ⚠️ allowed but scoped · ❌ forbidden (returns `403 אין הרשאה`)

### Divers

| Operation | Endpoint | manager | secretary | madar | diver |
|-----------|----------|:---:|:---:|:---:|:---:|
| List divers | `GET /api/divers` | ✅ All | ✅ All | ⚠️ Own team | ⚠️ Self only |
| View a diver | `GET /api/divers/:id` | ✅ | ✅ | ⚠️ Own team | ⚠️ Self only |
| Lookup by ID number | `GET /api/divers/lookup/:idNumber` | ✅ | ✅ | ✅ | ⚠️ Self only |
| Create diver | `POST /api/divers` | ✅ | ✅ | ✅¹ | ❌ |
| Update diver | `PUT /api/divers/:id` | ✅ | ✅ | ⚠️ Own team | ❌ |
| Delete diver | `DELETE /api/divers/:id` | ✅ | ❌ | ❌ | ❌ |

¹ A `madar` can create a diver, but the new diver is always pinned to the
madar's own team — any submitted `team_ids` are ignored, and a madar with no
team assigned cannot create divers. Update/delete are team-scoped as shown.

### Diver certifications (per-diver records)

| Operation | Endpoint | manager | secretary | madar | diver |
|-----------|----------|:---:|:---:|:---:|:---:|
| View a diver's certs | `GET /api/diver-certs/:diverId` | ✅ | ✅ | ⚠️ Own team | ⚠️ Self only |
| Add certification | `POST /api/diver-certs` | ✅ | ✅ | ⚠️ Own team | ❌ |
| Update certification | `PUT /api/diver-certs/:id` | ✅ | ✅ | ⚠️ Own team | ❌ |
| Delete certification | `DELETE /api/diver-certs/:id` | ✅ | ✅ | ⚠️ Own team | ❌ |

### Activities (per-diver logbook)

| Operation | Endpoint | manager | secretary | madar | diver |
|-----------|----------|:---:|:---:|:---:|:---:|
| View a diver's activities | `GET /api/activities/:diverId` | ✅ | ✅ | ⚠️ Own team | ⚠️ Self only |
| Add activity | `POST /api/activities` | ✅ | ✅ | ⚠️ Own team | ❌ |
| Update activity | `PUT /api/activities/:id` | ✅ | ✅ | ⚠️ Own team | ❌ |
| Delete activity | `DELETE /api/activities/:id` | ✅ | ✅ | ⚠️ Own team | ❌ |
| Download activity template | `GET /api/activities/import/sample` | ✅ | ✅ | ❌ | ❌ |
| Preview activity import | `POST /api/activities/import/preview` | ✅ | ✅ | ❌ | ❌ |
| Import activities (Excel) | `POST /api/activities/import` | ✅ | ✅ | ❌ | ❌ |

### Certification levels (org-wide catalog)

| Operation | Endpoint | manager | secretary | madar | diver |
|-----------|----------|:---:|:---:|:---:|:---:|
| List levels | `GET /api/certifications` | ✅ | ✅ | ✅ | ✅ |
| Create level | `POST /api/certifications` | ✅ | ❌ | ❌ | ❌ |
| Update level | `PUT /api/certifications/:id` | ✅ | ❌ | ❌ | ❌ |
| Delete level | `DELETE /api/certifications/:id` | ✅ | ❌ | ❌ | ❌ |

### Teams

| Operation | Endpoint | manager | secretary | madar | diver |
|-----------|----------|:---:|:---:|:---:|:---:|
| List teams | `GET /api/teams` | ✅ | ✅ | ✅ | ✅ |
| Create team | `POST /api/teams` | ✅ | ❌ | ❌ | ❌ |
| Update team | `PUT /api/teams/:id` | ✅ | ❌ | ❌ | ❌ |
| Delete team | `DELETE /api/teams/:id` | ✅ | ❌ | ❌ | ❌ |

### Users (staff accounts)

The entire `/api/users` router is **manager only**.

| Operation | Endpoint | manager | secretary | madar | diver |
|-----------|----------|:---:|:---:|:---:|:---:|
| List users | `GET /api/users` | ✅ | ❌ | ❌ | ❌ |
| Create user | `POST /api/users` | ✅ | ❌ | ❌ | ❌ |
| Update user | `PUT /api/users/:id` | ✅ | ❌ | ❌ | ❌ |
| Delete user² | `DELETE /api/users/:id` | ✅ | ❌ | ❌ | ❌ |
| Download user template | `GET /api/users/import/sample` | ✅ | ❌ | ❌ | ❌ |
| Preview user import | `POST /api/users/import/preview` | ✅ | ❌ | ❌ | ❌ |
| Import users (Excel) | `POST /api/users/import` | ✅ | ❌ | ❌ | ❌ |

² A manager cannot delete their own currently-logged-in account (`400`).

### Diver bulk upload (Excel)

| Operation | Endpoint | manager | secretary | madar | diver |
|-----------|----------|:---:|:---:|:---:|:---:|
| Download diver template | `GET /api/upload/sample` | ✅ | ✅ | ❌ | ❌ |
| Preview diver import | `POST /api/upload/preview` | ✅ | ✅ | ❌ | ❌ |
| Import divers (Excel) | `POST /api/upload/import` | ✅ | ✅ | ❌ | ❌ |

### System configuration

The entire `/api/config` router is **manager only**.

| Operation | Endpoint | manager | secretary | madar | diver |
|-----------|----------|:---:|:---:|:---:|:---:|
| Read config | `GET /api/config` | ✅ | ❌ | ❌ | ❌ |
| Update config | `PUT /api/config` | ✅ | ❌ | ❌ | ❌ |
| Apply default levels/teams | `POST /api/config/apply-defaults` | ✅ | ❌ | ❌ | ❌ |

### Audit logs

| Operation | Endpoint | manager | secretary | madar | diver |
|-----------|----------|:---:|:---:|:---:|:---:|
| Staff login log | `GET /api/auth/login-log` | ✅ | ❌ | ❌ | ❌ |
| Diver access log | `GET /api/diver-auth/access-log` | ✅ | ❌ | ❌ | ❌ |

### Authentication (available to everyone / public)

| Operation | Endpoint | Access |
|-----------|----------|--------|
| Staff login (password) | `POST /api/auth/login` | Public |
| Staff OTP verification | `POST /api/auth/verify-otp` | Public |
| Current user info | `GET /api/auth/me` | Any authenticated user |
| Diver request OTP | `POST /api/diver-auth/request-otp` | Public |
| Diver verify OTP | `POST /api/diver-auth/verify-otp` | Public (issues a 1-hour diver token) |

---

## Role summaries

### מנהל (manager) — full administrator
**Can do everything**, including the operations no other role can:
- Delete divers.
- Full CRUD on staff **users**, **teams**, and **certification levels**.
- Read and change **system configuration** and apply defaults.
- View both audit logs (staff logins and diver access).
- Everything the secretary and madar can do, org-wide.

**Cannot do:** delete their own logged-in account.

### מזכירה (secretary) — back-office staff (org-wide, data only)
**Can:** full CRUD on divers (except delete), diver certifications, and
activities across **all** teams; bulk-import divers and activities from Excel;
view all divers and lookups.

**Cannot:** delete divers; manage users, teams, or certification levels; change
configuration; view audit logs.

### מד"ר (madar) — team commander (own team only)
**Can:** the same data operations as the secretary — create/update divers, and
full CRUD on certifications and activities — **but only for divers in their own
team**. Can list and view only their team's divers.

**Cannot:** delete divers; act on divers outside their team; run any Excel
import/template (divers, activities, or users); manage users, teams, or
certification levels; change configuration; view audit logs.

### צולל (diver) — end user (read-only, self only)
**Can:** log in via self-service OTP and view **only their own** record —
profile, certifications, and activities.

**Cannot:** view any other diver; create, update, or delete anything; access any
management, import, configuration, or audit feature.

---

## Notes for maintainers

- Authorization lives entirely in the server routes; the client UI hides
  controls by role but is not the security boundary. Any change to who-can-do-what
  must be made in `requireRole(...)` and the in-handler scope checks.
- **Team scoping for `madar`** is enforced case-by-case inside handlers
  (`diverIsInTeam`, or a `team_id === teamId` comparison), not by the role guard
  alone. On create, a madar's diver is force-assigned to their own team; on
  update, a madar cannot change team memberships at all (the `team_ids` sync is
  skipped for them), so they can neither move a diver out of their team nor add
  it to teams they don't manage. Only manager/secretary can reassign a diver's
  teams.
- The **staff OTP is currently a hard-coded constant** (`150475` in
  `routes/auth.ts`) shared by all staff accounts — a placeholder that should be
  replaced with per-user delivery before production.
- The default seeded admin is `admin / admin123` (`server/src/db.ts`); change it
  in any real deployment.
</content>
