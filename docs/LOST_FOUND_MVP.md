# CampusConnect Milestone 22 — Lost & Found MVP (draft)

## Source and scope

Implements the approved **CampusConnect design v1.4** Lost & Found use cases (UC-07, UC-32, UC-33) and the documented OpenAPI contracts for `lost-found-items`, personal records and Admin moderation. The technical baseline is **Milestone 21**, not the older default `main` branch.

The original schema defines `lost_found_items` with `kind:lost|found`, item details, `contactPreference:adminMediated|helpdesk`, `status:open|resolved|removed`, campus-scoped records and redacted responses. **No public phone numbers, personal email addresses or in-app chat** are permitted.

## Supported API endpoints

All endpoints are prefixed `/api/v1` and require a verified campus Firebase session plus active university profile.

| Method | Path | Authorization |
|---|---|---|
| GET | `/lost-found-items?page=1&limit=20&kind=lost&category=electronics&q=usb` | Any authenticated campus user; **open items in their university only** |
| GET | `/lost-found-items/:id` | Any authenticated campus user; open item only |
| GET | `/me/lost-found-items` | Student; only their own reports, including resolved or moderated history |
| POST | `/lost-found-items` | Active Student; creates immediate `open` report |
| PATCH | `/lost-found-items/:id` | Student owner can edit title, description, location or mark resolved; Admin can mark resolved |
| POST | `/admin/lost-found-items/:id/moderation` | Admin only; `{action:"remove",reason:"..."}`; writes audit entry and removes from discovery |

Publication request example:

```json
{
  "kind": "lost",
  "title": "Missing black USB drive",
  "description": "A small black USB stick was misplaced near the CS lab.",
  "category": "electronics",
  "locationText": "CS laboratory entrance",
  "contactPreference": "helpdesk"
}
```

Optional `occurredAt` accepts an ISO-8601 timestamp with timezone or explicit `null`. Category choices in this milestone: `electronics|documents|keys|clothing|accessories|other`. Client-supplied `reporterId`, `universityId`, `status`, `email`, `phone`, `images`, or unknown properties are rejected by the create validator.

Search supports page/limit, kind/category and literal-text search across title/description/location. The backend enforces the university boundary and publishes a **sanitized DTO**, never a MongoDB document or reporter UID.

## Data, ownership, and safety

Collection: `lost_found_items`. University/status/kind, university/reporter, university/status/category indexes support browsing and private history. Only the authenticated reporter can change details. Changes to an already resolved/removed report are blocked. Admin can remove open or resolved reports with a reason; the action is recorded in `audit_logs`.

**Contact flow:** Every result displays a reference ID and asks the user to contact the university helpdesk or campus administration. This is a communication preference only; automated helpdesk routing and verified claims workflow are **not** implemented. Avoid displaying personal numbers or contact data in reports.

**Images:** The original design allows optional file references, but a shared campus image service with scanning, privacy protections and durable storage is not yet in place. Milestone 22 intentionally initializes `images:[]` and rejects client file IDs. Report images are a subsequent, separately reviewed change. Avoid collecting pictures of student ID cards or valuables that reveal private details.

## Interfaces

- **React** lazy-loaded Lost & Found workspace: campus search, type/category filters, report creation, edit/resolve, personal history, and Admin-only removal.
- **Flutter** student Lost & Found screen reachable from Home/Profile: browse, search by report type, publish, edit, resolve and personal history.
- **Offline preview** uses fictional reports held in memory; it never contacts live campus services.

## Acceptance and constraints

- Backend validation unit tests and isolated `mongodb-memory-server` integration test are included (Firebase fixture identities; no live credentials).
- Flutter model + offline lifecycle test and React lazy-bundle contract changes are included.
- Automated GitHub Actions **passed on 2026-11-11** (backend tests, web tests/build, Flutter analysis/tests and consolidated QA). **Full physical-phone Firebase/Atlas acceptance remains deferred** per project plan.
- Production blockers remain: secure case handling, privacy/retention approval, real helpdesk response workflows, attachment storage, rate-limit/abuse review, user-reporting policy and governance.
- GitHub drafts are stacked: Milestone 22 → 21 → 20 → 19 → earlier branches. No automatic merge into `main` and no production deployment.

## Later local verification

```powershell
# In the existing repository after safely checking out the Milestone 22 branch:
cd backend
npm.cmd install
npm.cmd test
npm.cmd run test:integration

cd ..\web
npm.cmd install
npm.cmd test
npm.cmd run build

cd ..\mobile
flutter pub get
flutter analyze
flutter test
```

Never paste credentials, ID tokens, real reports or student data into shared logs.
