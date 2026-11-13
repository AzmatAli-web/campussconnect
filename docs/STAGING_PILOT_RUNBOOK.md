# CampusConnect — Milestone 26 Controlled University Pilot Readiness

**Scope:** prepare a staging-only, synthetic-data acceptance process. No hosting deployment, role approval, real-student recruitment, database migration, signed Android release, or production access is authorized by this milestone. It is a **release-readiness package**, not a released pilot.

**Starting source:** `feature/milestone26-controlled-pilot-readiness`, stacked on draft Milestone 25. The proposed staging configuration requires its **own Firebase project and MongoDB Atlas database**, separate from any university/production environment.

## 1. Mandatory review before a staging pilot

| Gate | Criterion | This milestone's status |
| --- | --- | --- |
| CI source | Review the full stacked PR chain and approve the exact immutable commit | **Open** — draft branches remain unmerged |
| Offline regression | Backend unit/integration, React build/tests, Flutter analyze/tests | CI check required |
| Config guard | Run preflight with synthetic-only staging values; reject local/insecure endpoints | Automated gate added |
| Live HTTPS staging | Real staged HTTPS API responding ready, with unauthenticated routes blocked | **Not performed** |
| Identity | Separate Firebase project, verified authorized test email identities, no self-assigned roles | **Manual** |
| Data boundaries | Separate Atlas cluster/db, synthetic fixtures only, no real financial, medical, or student records | **Manual** |
| Privacy and uploads | Private durable storage, access revocation, attachment scanning and retention | **Production blocker** |
| Finance and complaints | Reconciliation, audit, correction policies and confidential-case routing | **Production blocker** |
| Notifications | FCM Admin credentials, dispatcher, device revocation on logout and physical phone acceptance | **Not performed** |
| Browser & Android | Latest build, permissions, accessibility, role-based end-to-end checks | **Deferred** |
| Performance | Real-world network p50/p95, load ceiling, error-rate and cold start measurements | **Not performed** |
| Recovery | Test database/file backup and restore, rollback owners, rollback target, stop/go process | **Manual** |

Do not treat a green GitHub PR check, synthetic performance number, or the preflight's `VALID` output as sufficient to open the app to real users.

## 2. Staging configuration: no committed secrets

Start from `backend/.env.staging.example` **as documentation only**. Store actual staging values only in a protected secret store or untracked, access-controlled local environment.

Required: `NODE_ENV=production` even in staging to enforce production backend checks; single exact HTTPS `CORS_ORIGIN`; isolated MongoDB Atlas SRV `MONGODB_URI` (TLS not disabled); separate `FIREBASE_PROJECT_ID`; stable `UNIVERSITY_ID`; approved `UNIVERSITY_EMAIL_DOMAINS`. Additional preflight-only controls: `CAMPUS_PILOT_STAGE=staging`, `CAMPUS_PILOT_DATA_POLICY=fictional-only`, HTTPS `CAMPUS_PILOT_API_BASE_URL` with staging/QA/pilot hostname, assigned pilot and rollback owners, and a non-empty approved fictional test-account roster field. The preflight does **not** verify those accounts actually exist or are authorized.

Run in a PowerShell terminal **only after the authorized staging operator has provided configuration through secure environment variables**:

```powershell
cd backend
npm.cmd install
npm.cmd run pilot:preflight
```

Expected: `CampusConnect staging configuration: VALID` with identifiers of remaining human-review items. A missing or unsafe value returns a nonzero exit code and a sanitized blocker code; values or credentials are never printed. **Never** paste full environment output or secrets into GitHub PR comments.

Run the offline fixture tests without any credentials, from any development checkout:

```powershell
cd backend
npm.cmd run test:pilot
```

## 3. Read-only staging smoke check — operator opt-in only

This script never sends auth tokens, creates student accounts, writes database documents or changes roles. It makes exactly four unauthenticated `GET` requests to an explicitly named HTTPS staging host:

| Endpoint | Expected | Purpose |
| --- | ---: | --- |
| `/api/v1/health/live` | 200 | Process is responding |
| `/api/v1/health/ready` | 200 | Basic ready check; still not full Firebase/Atlas connectivity proof |
| `/api/v1/me` | 401 | Student profile requires a session |
| `/api/v1/notifications` | 401 | Inbox requires a session and sends `Cache-Control: no-store` |

The read-only probe rejects HTTP, localhost, embedded usernames, redirects and hostnames without an obvious `staging`, `stage`, `pilot`, or `qa` component. A hostname naming convention alone cannot prove a host is non-production; the operator must verify DNS and ownership first.

```powershell
# Staging operator only, with an approved, real STAGING URL.
$env:CAMPUS_PILOT_SMOKE_ACK = "staging-readonly"
npm.cmd run pilot:smoke
```

The command fails if any route returns an unexpected status or content type. If it fails, investigate the staging deployment and fix the configuration; do not bypass authorization or substitute a production address.

## 4. Controlled acceptance matrix (future, no live tests today)

Record each test in `docs/PILOT_ACCEPTANCE_RECORD.md` with the exact branch/commit, staging project identifiers (non-secret), platform, role, outcome, and sanitized evidence location.

| Role / area | Positive test | Negative/security test |
| --- | --- | --- |
| Student | Campus email login and profile; events registration; timetable and resources; own complaints, fees, marketplace, lost/found, societies, notifications | Cannot see another student's records or staff workflows |
| Faculty | Verified faculty posts permitted announcements, events and resources | Cannot self-verify or post for unrelated department |
| Society Manager | Assigned society manages events and member decisions | Revoked manager cannot view private roster or approve |
| Admin | Approved role provisioning, report moderation and auditing | Other users cannot call Admin endpoints |
| Finance Officer | Authorized fictional invoices and offline receipt record review | Ordinary Student/Faculty cannot change finance balances |
| Multi-tenant | Staging university fixtures appear only to their intended campus | Foreign university records remain invisible |
| Android | Latest APK connects to staging safely; permission denial/retry; FCM opt-in/out; offline-to-online recovery | No use of production credentials, no cross-user token persistence |
| Accessibility | Keyboard navigation, semantics, readable errors, screen reader flow | No inaccessible role-critical action |
| Operations | HTTPS, backups/restore, limited logs, incident support path | Rollback restores expected availability without data leakage |

Use **fictional university records only**, with named authorization from the actual university administrators. No real bank payments, private medical cases, live student ID photos or real disciplinary complaints.

Milestone 27 adds an [offline checker for the gate evidence record](MILESTONE27_STAGING_ACCEPTANCE.md). It is independent of preflight and smoke, and cannot convert a fixture run into staging evidence.

## 5. Objective performance and acceptance gates

Synthetic Milestone 25 metrics are baselines for comparative CI only, **not** production SLOs. Before piloting, measure an authorized HTTPS staging workload across multiple representative network conditions. Capture sample counts, error rate, p50/p95 latency, traffic patterns, app cold start, Android battery/network behavior, MongoDB index plans and client memory. Define numeric service objectives with the team after representative data exists, and attach evidence to the acceptance record.

Stop or roll back for cross-tenant exposure, privilege escalation, data loss/corruption, public/private storage leak, financial inconsistency, repeated authentication failures, failed restoration, or sustained error rate above the approved staging objective. No rollout to real students while any such failure is open.

## 6. Recovery and release procedure (documentary only)

**Before** an authorized pilot: assign independent deployment and rollback owners, identify an immutable reviewed build/commit, record database snapshot and private-file backup status, test restores, confirm alerting and support/incident contacts, agree on a limited group of consenting pilot participants, schedule an approved maintenance window, and keep a known-good rollback artifact.

If a gate fails: stop new access, revert only the application release to the previously verified artifact, preserve evidence, and follow the database/filesystem restoration procedure **only** when explicitly approved and supported by an actual tested backup. Never run `git reset --hard`, `git clean`, or unreviewed MongoDB restores against local or real campus data.

This milestone adds no automated deployment/rollback commands because the target hosting provider, infrastructure topology, approved operator roles and actual staging resources have not yet been verified.

## 7. Final declaration for this branch

- **Implementation:** staging policy checks, offline preflight, read-only opt-in smoke contract, negative tests, CI gate and runbook.
- **Not delivered:** live staging instance, database migration, Firebase role setup, signed release build, real push sends, physical-device tests, production approval or main-branch merge.
- **Security:** both the intended staging environment and real campus users must be independently approved. Release controls and sensitive-identity handling require human sign-off, not inferred completion.
- **Project continuation:** after Milestone 26, stop new feature work and prioritize closing the listed blockers with actual evidence.

**Suggested review order:** security/privacy → database/storage/recovery → Finance/complaints policy → staging auth/RBAC → Android/browser acceptance → performance → launch decision.
