# CampusConnect — Milestone 25: Integration, Security & Performance QA

**Branch:** `feature/milestone25-integration-security-performance` based on CI-green Milestone 24. **Purpose:** close verified privacy gaps, measure synthetic performance, and establish release gates. No production deployment or local checkout changes.

## Security fix: Society announcements

The pre-Milestone-25 `GET /api/v1/announcements` and `GET /api/v1/announcements/:id` APIs accepted `scope:society` for **every authenticated university user**, even if not a member of that society. Milestone 24's notification inbox had already introduced stricter `notificationAudience(req)` logic, creating two inconsistent access policies.

Milestone 25 changes the original announcement list/detail endpoints to **reuse the same audience rules as the notifications inbox**:

- `scope:university`: any authenticated, active user of the target university.
- `scope:department`: only users matching the announcement department.
- `scope:society`: active society members, actively assigned managers, or the campus Admin.
- University identity is always enforced by the active backend configuration, not request parameters.
- When a student leaves, or a Society Manager's assignment is revoked, the affected society announcements stop appearing in **both** endpoints and the notification inbox immediately.

The isolated integration test creates separate members, nonmembers, managers, department users and foreign-university announcements, then verifies list, detail, inbox, forbidden mark-as-read and revocation behavior. It also checks that unread markers are not written for forbidden audiences. This is an **actual authorization behavior change** from the old permissive listing; affected users must expect restricted results.

## Repeatable synthetic benchmark (not production measurements)

`backend/scripts/benchmark-qa25.js` starts a temporary **in-memory MongoDB replica set** and uses synthetic users with a fixture Firebase auth verifier. The script never connects to the real campus MongoDB cluster or Firebase. On completion, it disconnects and stops the temporary database.

**Synthetic fixture sizes:**

| Collection | Documents |
| --- | ---: |
| Announcements | 1,500 |
| Private notifications | 500 |
| Events | 180 |
| Student memberships | 80 |

**Workloads:** 50 requests per route, 5 concurrent simulated clients, including one pre-warm request, against these authenticated API endpoints: `/announcements`, `/notifications`, `/events` and `/me/society-memberships`. Each response is validated to contain at most 20 list items. The script records success/failure count, p50, p95 and maximum request latency, and uses MongoDB `explain('executionStats')` to require indexed access for private notifications, shared announcements and student memberships.

Output is structured JSON beginning with `QA25_BENCHMARK_REPORT=`. When `QA25_REPORT_PATH` is set, a JSON report is also generated as a local file. GitHub Actions uploads `campusconnect-m25-synthetic-benchmark` as a downloadable short-lived artifact.

```powershell
# Existing project checkout; no new local project folder required.
cd backend
npm.cmd install
$env:MONGOMS_VERSION = "7.0.24"
npm.cmd run qa:benchmark
```

**Performance caveats:** The GitHub runner is not a production server. In-memory MongoDB, mock authentication and localhost request overhead differ significantly from Firebase Auth, MongoDB Atlas networking, Android radios and production traffic. The benchmark guards basic indexing/bounded responses, but **is not a production load test, a throughput capacity claim, or proof of real-world p95**. No hard p95 budget is enforced by default; set `QA25_MAX_P95_MS` deliberately after collecting representative environments.

## Web performance observability

`web/scripts/check-bundle.js`, invoked by `npm run build`, already verifies independent lazy route chunks. It now separately reports the initial hashed `index-*.js` entry's gzip size and the six largest JS chunks. Total bundle size **must not** be interpreted as the initial downloaded size, and the main entry size is only a partial approximation of initial network cost. An optional regression gate `QA25_ENTRY_GZIP_BUDGET_KIB` can be enabled after a team-agreed baseline; no ungrounded fixed cap is imposed.

## CI and release gates

- Existing **Backend tests**: unit and isolated integration suites, including new authorization regression.
- Existing **Web tests/build**: route code splitting and initial bundle metrics.
- Existing **Flutter student app**: static analysis and unit/widget tests; no phone required.
- Existing **Consolidated full-stack QA**: all three suites together.
- New **Milestone 25 — Security and Performance QA** workflow: isolated indexed-query and API benchmark, JSON artifact.

**Not covered automatically:** Real Firebase/Atlas RBAC, actual FCM delivery, Android physical-device acceptance, slow mobile networks, account logout/device-ID revocation, data-retention and role-policy approval, high-concurrency soak testing, OWASP penetration testing, payment audit acceptance, real accessibility testing, production infrastructure/backups, and scale testing with personally identifiable data.

## Recommended pilot acceptance before main merge

1. Review entire stacked PR sequence from Milestone 19 to 25, preserving upstream security fixes and confirming their individual CI checks.
2. Stage a real Firebase + Atlas environment with test accounts: student, faculty, society member/nonmember, assigned/revoked manager, finance officer and Admin; confirm read and write permissions.
3. Run physical Android checks for login, offline preview, actual backend reachability, FCM opt-in/delivery, notification rotation, notification revocation, connectivity loss and recoveries.
4. Measure real p50/p95, error rate, cold-start latency, DB indexes and bundle loading under approved representative users and devices. Establish **explicit** performance budgets only after data exists.
5. Obtain privacy, financial, abuse-handling, moderation, data-retention, backup/recovery and security sign-off.
6. Only then plan reviewed merge order and a protected, reversible pilot rollout. Do not confuse CI passing with production readiness.

## PowerShell verification (existing repository)

```powershell
cd backend
npm.cmd install
npm.cmd test
npm.cmd run test:integration
npm.cmd run qa:benchmark
cd ..\web
npm.cmd install
npm.cmd test
npm.cmd run build
cd ..\mobile
flutter pub get
flutter analyze
flutter test
```

No real credentials, university student records, Firebase Admin keys or production MongoDB connection strings should be pasted into public CI reports.
