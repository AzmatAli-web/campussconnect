# Milestone 23 — Campus Society Membership MVP

**Status:** development draft, stacked on Milestone 22. This extends the existing `societies`, `society_manager_assignments`, Firebase-verified roles and Admin society-management foundation. It does **not** confer any privileged `societyManager` role on an ordinary member.

## Scope and authorization

- Active, university-verified **Students** browse existing active societies, request membership, see their own status, cancel pending requests, and leave approved memberships.
- Students may reapply after cancellation, leaving, or rejection. A manager's removal leaves the record in `removed` state and cannot be bypassed by student reapplication.
- An **actively assigned Society Manager** sees only pending or active memberships for societies they currently manage. They can approve/reject a pending request, or remove an active member. A reason is required for rejections and removals; changes are audit logged.
- Admin continues to provision initial societies and manager roles through existing governance routes. This milestone does not add a self-serve manager grant or edit the existing event publishing authorization.
- No public member directories, shared student contact lists, payment or membership fee collection, automatic notification delivery, chat, invitations or membership analytics.

## API contract

All paths below have the prefix `/api/v1` and require an active Firebase-verified campus profile. The backend derives university and student identity from the authenticated profile. Ordinary student membership responses never expose student IDs, Firebase UIDs, email addresses, or manager identifiers.

| Method | Endpoint | Permission |
| --- | --- | --- |
| GET | `/societies?limit=100` | Existing active society directory, all verified campus roles |
| GET | `/me/society-memberships?limit=100` | Student's own membership history |
| POST | `/societies/:societyId/membership-requests` | Student submits `{}`; creates `pending` |
| POST | `/me/society-memberships/:id/withdraw` | Student submits `{}`; `pending → cancelled`, `active → left` |
| GET | `/me/managed-societies` | Existing list of societies currently assigned to Manager |
| GET | `/managed-societies/:societyId/memberships?status=pending&limit=100` | Active assigned Manager only; also supports `status=active` |
| POST | `/managed-societies/:societyId/memberships/:id/review` | Active assigned Manager only; `{action:"approve"}`, `{action:"reject",note:"Reason..."}`, or `{action:"remove",note:"Reason..."}` |

The Manager's restricted queue includes student name and verified university email to support approval. **Names/emails must not be shown in the student-facing directory**. Manager rights are checked both before reading and before mutation in a transaction; a revoked assignment cannot continue reviewing membership requests.

## Database

New collection: `society_memberships` (no modifications to existing event/society role models). Fields include `universityId`, `societyId`, `studentId`, `status`, `requestedAt`, `reviewedAt`, `reviewedBy`, `reviewNote`, `endedAt`, `endedBy`, and `endReason`. A **unique university/society/student index** prevents duplicate memberships under concurrent requests; list indexes optimize per-society pending/active review and personal history.

Transitions:
```text
not requested -> pending
pending -> active (manager approve) / rejected (manager decline) / cancelled (student cancel)
active -> left (student leaves) / removed (manager removes)
rejected / cancelled / left -> pending (student reapplies)
removed -> no automatic reapplication (campus appeal/admin process required)
```

Each restricted Manager decision is written together with a `society.membership.*` audit event in a MongoDB transaction. Membership is not proof of society office or an authorization to publish announcements and events.

## Interfaces

- React: lazy `SocietiesPage` added to campus workspace navigation for verified users. Students browse/join/leave/track. Active assigned managers review the restricted list and make decisions.
- Flutter Android: `SocietiesScreen` reachable from the Student Home/Profile. Student can browse, join, cancel and leave; membership status is read directly from the backend.
- Offline Flutter preview: fictional local societies and membership history; no Firebase/MongoDB/network calls.

## Security, testing and release gates

- Enforce backend ownership, university scope, actual manager assignment, active student identity at approval, strict request bodies, state-based conditional updates, and unique indexes.
- Node unit tests include validation, strict accepted transitions, identity redaction; isolated integration tests include manager revocation, concurrency, private rosters and tenant isolation. Flutter offline tests cover student lifecycle and the response model. Web lazy-module tests ensure the screen stays in a separate chunk.
- **Automated checks and physical-device acceptance are separate gates.** GitHub Actions covers backend, React and Flutter; Firebase/Atlas stage acceptance and physical Android testing remain deferred per project plan.
- Review campus membership eligibility policy, data retention and manager access audits before production. Member emails are restricted personal data; do not export or distribute a roster publicly.
- Existing PR chain remains in draft and is **not merged to `main` or deployed**. This PR targets `feature/milestone22-lost-found`.

## Local verification later (PowerShell, from existing checked-out project)

```powershell
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
