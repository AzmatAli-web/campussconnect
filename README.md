# CampusConnect

A **college campus services platform** with a Flutter Android student app, React web portal, Node.js/Express API, Firebase email authentication and MongoDB.

## Current status

**Development prototype — not production-deployed.** The connected development environment has been tested for a real Student sign-in and dashboard. Staff/Faculty/Admin/Finance Officer privileged flows remain subject to isolated automated tests and authorized acceptance testing. Current feature development lives in **stacked, draft GitHub pull requests**, not necessarily on `main`.

Implemented MVP modules on the stacked development branches: university email authentication and server-side roles; events and registrations; announcements; academic timetables; Faculty PDF resources; student complaints and tracking; read-only student fees and authorized offline receipt records; **Student Marketplace listings, seller-email consent, reports and Admin moderation (Milestone 21 automated CI passed)**; **Lost & Found reports, owner tracking and Admin moderation (Milestone 22 automated CI passed; live acceptance pending)**; **Society Membership (Milestone 23: student join/leave, assigned-manager approval and member administration; automated CI passed, live acceptance pending)**. The financial ledger is **not a bank or payment processor**.

## Latest development branch (draft; not merged)

`feature/milestone23-society-membership` builds on the CI-green Milestone 22 branch, which stacks on Milestones 21, 20 and the Milestone 19 QA baseline. Earlier PRs remain stacked and unmerged. **Milestones 21–23 have passed backend, web, Flutter and consolidated GitHub Actions checks.** All remain in draft, undeployed and not yet accepted on a physical Android device.

```powershell
git fetch origin
git switch feature/milestone23-society-membership
git pull --ff-only origin feature/milestone23-society-membership
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\verify-all.ps1
```

If tracked local files prevent switching, preserve them before checkout; **do not overwrite local backend credentials**.

## Local run

```powershell
# Terminal 1
cd backend
npm.cmd install
npm.cmd run db:ensure-indexes
npm.cmd run dev

# Terminal 2
cd web
npm.cmd install
npm.cmd run dev
```

Default development web address: `http://localhost:5173`. Backend readiness: `http://127.0.0.1:4000/api/v1/health/ready`.

For the physical Flutter app, see [USB Android live test](docs/USB_ANDROID_LIVE_TEST.md). A connected phone needs an active `adb reverse tcp:4000 tcp:4000` rule for the debug API address. Empty student-side modules are expected until authorized staff publish real campus content.

## Important docs

- [Milestone 23 Society Membership scope, APIs and authorization](docs/SOCIETY_MEMBERSHIP_MVP.md)
- [Milestone 22 Lost & Found scope, APIs and privacy](docs/LOST_FOUND_MVP.md)
- [Milestone 21 Marketplace scope, APIs and release gates](docs/MARKETPLACE_MVP.md)
- [Full-stack QA and release gates](docs/RELEASE_QA.md)
- [Backend security and roles](docs/ADMIN_BOOTSTRAP_AND_ROLES.md)
- [Finance Officer permissions](docs/FINANCE_OFFICER_AUDIT.md)
- [Query/index optimization](docs/QUERY_INDEX_OPTIMIZATION.md)
- [Academic Resources limitations](docs/ACADEMIC_RESOURCES_MVP.md)

No server credentials or sensitive student records belong in this repository. Production deployment requires formal security, privacy, data-retention and infrastructure review.
