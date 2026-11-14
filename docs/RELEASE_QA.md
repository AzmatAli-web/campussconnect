# CampusConnect — Full-stack QA / Development Release Gate

This is the consolidated acceptance plan for the latest **draft feature branch**, not a production deployment. It must be reviewed before merging the stacked pull requests. The user's physical Android phone may remain disconnected while the automated checks run.

## 1. Checkout without losing local configuration

On Windows PowerShell from the repository root:

```powershell
git status --short
git fetch origin
git switch feature/consolidated-release-qa
git pull --ff-only origin feature/consolidated-release-qa
```

If Git refuses to switch because of a locally edited tracked file (for example `backend/.env.example`), stash only that file before switching:

```powershell
git stash push -m "Preserve local backend sample config" -- backend/.env.example
```

Do not blindly stash or overwrite the real `backend/.env`; it contains deployment/development credentials and is intentionally untracked. Do not post secrets, full credentials, or Firebase tokens in test reports.

## 2. One-command automated verification — no phone

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\verify-all.ps1
```

This runs, in order: backend dependencies/unit tests/isolated MongoDB integration, React tests/build/lazy-split validation, Flutter dependencies/analyzer/unit tests. It uses fictional Firebase test claims and in-memory MongoDB for the integration tests and **does not write to Atlas**. The first integration run may download a MongoDB test binary. It can run without USB, Firebase credentials or production services.

```powershell
# Only when Flutter is unavailable on the PC:
.\scripts\verify-all.ps1 -SkipFlutter
```

The skipped component remains **unverified** and must be tested separately later.

## 3. Local live services

Use the configured backend environment from your authorized local development setup:

Backend terminal:
```powershell
cd backend
npm.cmd run db:ensure-indexes
npm.cmd run dev
```

React terminal:
```powershell
cd web
npm.cmd run dev
```

Backend readiness in another terminal:
```powershell
Invoke-RestMethod http://127.0.0.1:4000/api/v1/health/ready
```

Expected ready response: `data.status = ready`. If the backend returns 503, check the listed readiness components rather than bypassing authorization. Do not run multiple Express instances on TCP 4000.

## 4. Later USB-connected Android acceptance

The existing phone package is `com.campusconnect.campusconnect_mobile`; the app calls `http://127.0.0.1:4000/api/v1` **only through an ADB reverse connection**.

After plugging in and unlocking the phone:

```powershell
$adb = "C:\Users\azmii\dev\android-sdk\platform-tools\adb.exe"
& $adb devices -l
& $adb reverse tcp:4000 tcp:4000
& $adb reverse --list
```

The device status must be `device`. `adb reverse --list` must show `tcp:4000 tcp:4000`. A disconnected USB cable or restarted ADB daemon removes forwarding.

The already-installed APK represents an **older build** until you update the current branch and run the live launcher again. When you want to test newer Flutter changes:

```powershell
cd mobile
flutter pub get
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\run-phone-live.ps1
```

Keep the backend running separately. If APK installation streams hang after a successful build, verify the phone and use `adb install --no-streaming -r -t .\build\app\outputs\flutter-apk\app-debug.apk` rather than rebuilding. Restore `adb reverse` after restarting ADB.

## 5. Acceptance checklist

| Area | Student live acceptance | Privileged test (isolated/staging only) |
| --- | --- | --- |
| Firebase identity | Approved university email signs in; account loads; profile remains private | User cannot grant own privileges |
| Events | Event browser works; empty is valid; private registrations show only own records | Verified Faculty/Society Manager can publish under own scope |
| Announcements | Published campus notices visible; empty is valid | Approved Faculty or Society Manager publishes by scope |
| Timetable | Student selects program/semester/section; empty is valid | Authorized Staff publishes, overlapping section times rejected |
| Academic Resources | Filter course PDFs; authenticated download; empty is valid | Verified Faculty uploads/archive PDF, archived file inaccessible |
| Complaints | Student submits a **fictional, non-sensitive** staging complaint and sees only own history | Authorized Staff/Admin progress status and response |
| Fees | Student can only see own invoices and receipts; empty is valid | Explicit Finance Officer role needed; duplicate receipt and overpayment rejected |
| Security | Student cannot access staff/admin endpoints or other students' data | Grant/revoke role produces audit entry |

**Do not enter real bank credentials or create legally binding financial records while testing.** Privileged role use requires a legitimately authorized campus Admin/Staff/Finance Officer in a staging environment; isolated tests already exercise this without creating any live privileged accounts.

## 6. Current release blockers

- **Draft stacked PRs:** feature branches have not been merged into a reviewed baseline. Review the chain and resolve conflicts before a stable integration branch/release.
- **Production storage:** academic PDF bytes currently use private local disk suitable only for single-server development. Durable private object storage and malware scanning are not yet implemented.
- **Financial compliance:** Fee ledger is administrative only. Independent payment verification, reconciliation, correction/reversal procedures, finance-specific audit retention and off-system tamper-evident records are not yet delivered.
- **Privacy & governance:** Complaints require privacy policy, sensitive-case routing, abuse handling and retention. Roles require real campus administrator approval.
- **Mobile distribution:** Debug USB installation is not a signed production release or HTTPS deployment.
- **Real-device validation:** Full physical phone and browser acceptance must be repeated on the latest consolidated branch.
- **Data migration:** New indexes are created only; old indexes are **not** automatically removed. DBA review required before any index cleanup.

## 7. Report format

When testing, record for each module: pass/fail, exact observed error message, page/screen, role used, browser or phone model, and whether you were in **offline preview** or **live mode**. Do not include passwords, MongoDB connection strings, Firebase ID tokens or private student information. Screenshots can hide personally identifying data.
