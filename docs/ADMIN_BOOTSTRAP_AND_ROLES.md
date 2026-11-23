# CampusConnect — Secure role provisioning (stacked Milestone 3)

This code branch **depends on** `feature/events-announcements-mvp` (Milestone 2).
Review/merge Milestone 2 after its Atlas concurrency tests; then rebase this branch onto `main` before merging it.

## What is protected

- Public users **cannot** create Admin, Faculty, Society Manager or Staff roles with registration form fields.
- A one-time **local-only** CLI bootstraps the first Admin using an already verified campus Firebase account and a pre-existing MongoDB profile. It checks the Firebase Admin SDK, university record and singleton bootstrap lock.
- Admin-only endpoints approve Faculty **after independently checking evidence** (the server records administrator attestation, not fake automatic document verification), invite/activate Staff, initialize societies, assign/revoke Society Managers, suspend users and review audit logs.
- A Society Manager must have an active assignment before creating a new society; new society creation also assigns that manager transactionally.
- Role changes and important audit records use MongoDB transactions. Production requires configured indexes and secure service-account credentials.
- No Admin role is ever determined from client requests or Firebase custom claims.

## Provision the first Admin (only after tests and manual review)

1. On your local machine, with `backend/.env` configured, sign in using a verified approved university email and ensure the account already has a valid MongoDB profile. If using the existing Student profile, it retains the Student role.
2. In Firebase Console -> Authentication -> Users, locate that account and copy **UID** (not password, ID token or service-account JSON).
3. Run the following PowerShell commands, replacing the placeholder **locally**. Keep your service account outside GitHub:

```powershell
cd C:\Users\azmii\Desktop\campussconnect\backend
npm.cmd run db:ensure-indexes
$env:ADMIN_BOOTSTRAP_FIREBASE_UID = "YOUR_ACTUAL_FIREBASE_UID"
$env:ADMIN_BOOTSTRAP_CONFIRM = "BOOTSTRAP_FIRST_ADMIN"
npm.cmd run admin:bootstrap
Remove-Item Env:ADMIN_BOOTSTRAP_FIREBASE_UID
Remove-Item Env:ADMIN_BOOTSTRAP_CONFIRM
```

The bootstrap creates a singleton record in `admin_bootstraps` and adds `admin` to that user's MongoDB `activeRoles`. **It cannot safely run again for the same university.** A failed attempt does not give the account Admin rights. Never commit these variables to `.env` or create a public bootstrap endpoint.

## Admin API draft

All routes below require verified Firebase token and `activeRoles` Admin from the same university.

| Method | Path | Purpose |
|---|---|---|
| GET | /api/v1/admin/users | List campus accounts |
| PATCH | /api/v1/admin/users/:id/status | Suspend/reactivate non-Admin account |
| POST | /api/v1/admin/users/:id/verify-faculty | Admin-attested faculty review |
| POST | /api/v1/admin/societies | Create first/initial society |
| POST | /api/v1/admin/society-manager-assignments | Assign an existing society manager |
| POST | /api/v1/admin/society-manager-assignments/:id/revoke | Revoke a manager assignment |
| POST | /api/v1/admin/staff-invitations | Create short-lived Staff invitation |
| POST | /api/v1/admin/staff-invitations/:id/activate | Assign Staff role to matching verified campus user |
| POST | /api/v1/admin/staff-invitations/:id/revoke | Revoke pending invitation |
| GET | /api/v1/admin/audit-logs | Review audited privileged actions |
| POST | /api/v1/societies | Existing Society Manager creates society and becomes manager |
| GET | /api/v1/societies | List active societies |

### Faculty approval body (example)

```json
{"method":"facultyEmail","evidenceReference":"official faculty roster entry 2026/123","reviewNote":"Independently checked name and role against approved faculty roster","attested":true}
```

Use the `document` method only when the Admin has truly reviewed private faculty proof through an approved channel. The endpoint stores **evidence reference metadata**, not documents. This is an **Admin-led provisional workflow**; secure evidence upload/storage and a self-service faculty request screen remain future work. The API reference v1.4 describes faculty verification requests; that complete workflow is **not yet implemented**.

### Staff invite body

```json
{"universityEmail":"employee@cuiatd.edu.pk"}
```
Invitation creation does **not** send email automatically yet. Admin can activate it only for a pre-existing verified campus account with the exact same email. The invitation expires after 7 days.

### Manager assignment body

```json
{"societyId":"24_character_society_object_id","userId":"24_character_user_object_id"}
```

Initial societies are created by Admin. An approved manager can create subsequent societies.

## What is still untested

Automated unit tests cover policy validation, not real role permissions or MongoDB transactions. Before merge/deploy, add running-Atlas integration tests for duplicate Admin bootstraps, denied Faculty approvals, invitation races, manager revocation, cross-university attempts, and audit rollback. Create a nonproduction Firebase/Atlas test environment for these; never test destructive Admin operations on real user accounts.

**Important:** The frontend currently only supports student account creation and login. This branch supplies backend governance capabilities, not complete role dashboards. No production security review has been completed.
