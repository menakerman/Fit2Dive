# Fit2Dive — System Overview & Roles

> Diver certification management system (מערכת לניהול הסמכות צוללים)

This document describes **what the system does**, the **roles** it defines, and **what each role can do and see**.

---

## 1. What the system does

**Fit2Dive** is a web application for managing a diving organization: its divers, their certifications, teams, diving activity, and medical status. The interface is in Hebrew (right‑to‑left).

The system keeps a central registry of divers and lets staff track each diver's certifications and expiry dates, group divers into teams led by an instructor, log diving activity, and monitor medical clearance and warnings. Divers themselves can log in to a self‑service portal to view their own status.

### Main features

- **Diver registry** — personal details, ID number, phone, email, notes, medical status and expiry.
- **Certifications** — configurable certification levels, plus per‑diver certifications with issue and expiry dates.
- **Teams** — divers grouped into teams, each led by a team leader (madar).
- **Activities** — a diving activity log per diver.
- **Medical tracking** — valid / expired / pending status with "expiring soon" warnings.
- **Excel import** — bulk import of divers, users, and activities from spreadsheets.
- **Self‑service diver portal** — divers log in with phone + ID via a one‑time code (OTP) to view their own record.
- **Audit & security** — staff login log and diver access log, with account lockout after repeated failed attempts.

### Architecture (high level)

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript, React Router, Zustand, TailwindCSS |
| Backend | Node.js + Express (TypeScript) |
| Database | SQLite (better‑sqlite3), single file |
| Auth | Stateless JWT (`Authorization: Bearer`), passwords hashed with bcrypt |
| Imports | Excel parsing via `xlsx` + `multer` upload |
| Deployment | Railway; Express serves the built client in production |

It is a monorepo with three workspaces: `shared` (shared types), `server` (API), and `client` (UI).

---

## 2. Roles

The system defines **four roles** (`shared/types.ts`, enforced in the database at `server/src/db.ts`):

| Role | Hebrew label | In short |
|------|-------------|----------|
| `manager` | מנהל | System administrator — full access |
| `secretary` | מזכירה | Office staff — organization‑wide, no administration |
| `madar` | מד"ר | Team leader / instructor — scoped to their own team |
| `diver` | צולל | Diver — read‑only self‑service |

There are **two ways to sign in**:

1. **Staff login** — username + password, followed by a one‑time code, used by `manager`, `secretary`, and `madar`. Accounts lock after 3 failed attempts (for 12h) and every login is recorded in the staff login log.
2. **Diver portal login** — a public page where a diver enters phone + ID number and receives a one‑time code (OTP). This grants a short‑lived diver session. (A diver may also be given a staff‑style user account linked to their diver record; either way they get the same `diver` capabilities.)

A default administrator account is seeded on first run (username `admin`, role `manager`).

---

## 3. What each role can do and see

Permissions are enforced **on the server** (the real boundary) and mirrored in the UI navigation. The summary below describes the effective capabilities.

### 🟣 Manager (מנהל) — full access

The manager can do everything in the system.

**Can see:** every diver in the organization, all certifications, teams, activities, the admin panel, and both audit logs.

**Can do:**
- **Divers** — view all, search, create, edit, and **delete** (only the manager can delete a diver).
- **Certifications** — manage certification levels (create/edit/delete) and per‑diver certifications.
- **Activities** — add, edit, and delete activities for any diver.
- **Admin panel** (4 tabs):
  - *Certification levels* — define the available certification levels.
  - *Teams* — create/edit/delete teams and assign a team leader.
  - *Users* — create/edit/delete user accounts of any role, set passwords, link a user to a team and/or a diver record; **bulk‑import users from Excel**.
  - *Settings* — organization name; OTP expiry, max attempts, and lockout duration; medical‑expiry warning window; seed default certification levels/teams; generate **shareable links** for the diver portal and staff login.
- **Excel imports** — import divers and import activities.
- **Audit logs** — view the staff login log and the diver access log.

### 🔵 Secretary (מזכירה) — office staff, organization‑wide

**Can see:** every diver in the organization, with all their certifications and activities.

**Can do:**
- **Divers** — view all, search, create, and edit. **Cannot delete** divers.
- **Certifications & activities** — add/edit/delete per‑diver certifications and activities.
- **Excel imports** — import divers and import activities.

**Cannot:** access the admin panel, manage users, teams, certification levels, or settings, and cannot view the audit logs (all manager‑only).

### 🟢 Madar (מד"ר) — team leader, scoped to own team

The madar works only with the divers in **their own team**.

**Can see:** only divers belonging to their team, and those divers' certifications and activities. Attempts to view a diver outside their team are rejected.

**Can do (own team only):**
- **Divers** — view and edit divers in their team; create divers. **Cannot delete** divers.
- **Certifications & activities** — add/edit/delete for divers in their team.

**Cannot:** import Excel, access the admin panel, manage users/teams/certification levels/settings, or view audit logs.

### ⚪ Diver (צולל) — read‑only self‑service

**Can see:** only their own record — name and ID, their certifications and expiry dates, medical status and expiry (with an "expiring soon" warning), their teams, and their own activity history. This appears on a single **"My status"** screen.

**Can do:** nothing beyond viewing. Divers have no create/edit/delete abilities and cannot see any other diver's data.

---

## 4. Capability matrix

| Capability | Manager | Secretary | Madar | Diver |
|---|:---:|:---:|:---:|:---:|
| View all divers | ✅ | ✅ | Own team only | Own record only |
| Create diver | ✅ | ✅ | ✅ | — |
| Edit diver | ✅ | ✅ | Own team | — |
| **Delete diver** | ✅ | — | — | — |
| Manage per‑diver certifications | ✅ | ✅ | Own team | View own |
| Manage per‑diver activities | ✅ | ✅ | Own team | View own |
| Manage certification **levels** | ✅ | — | — | — |
| Manage **teams** | ✅ | — | — | — |
| Manage **users** | ✅ | — | — | — |
| System **settings** | ✅ | — | — | — |
| Import divers (Excel) | ✅ | ✅ | — | — |
| Import activities (Excel) | ✅ | ✅ | — | — |
| Import users (Excel) | ✅ | — | — | — |
| Staff login log | ✅ | — | — | — |
| Diver access log | ✅ | — | — | — |

Legend: ✅ full · "Own team / Own record" scoped · "—" not allowed.

---

### Reference (for developers)

- Role definition: `shared/types.ts`; database constraint: `server/src/db.ts`.
- Server‑side enforcement: `server/src/middleware/auth.ts` (`requireRole`) plus inline team/ownership checks in `server/src/routes/*.ts`.
- Staff authentication & login log: `server/src/routes/auth.ts`.
- Diver portal (OTP) authentication & access log: `server/src/routes/diverAuth.ts`.
- Client route guards & navigation: `client/src/App.tsx`, `client/src/components/Layout.tsx`, `client/src/components/ProtectedRoute.tsx`.
- Admin panel: `client/src/components/AdminPanel.tsx`.
