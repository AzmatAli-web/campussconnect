# CampusConnect — Milestone 2 backend (review candidate)

This branch implements the initial Events and Announcements APIs against the v1.4 requirements baseline.

## Routes

- `GET /api/v1/events`: campus-scoped published events (paged)
- `GET /api/v1/events/:id`: published event and computed registration status
- `POST /api/v1/events`: verified Faculty or society-assigned Society Manager creates event
- `PATCH /api/v1/events/:id`: creator updates an event before first confirmation
- `POST /api/v1/events/:id/registrations`: authenticated Student automatically registers
- `GET /api/v1/events/:id/registrations`: creator or Admin lists confirmations
- `POST /api/v1/admin/events/:id/cancel`: Admin cancels event
- `GET /api/v1/announcements`: campus audience-filtered published notices
- `GET /api/v1/announcements/:id`: readable notice
- `POST /api/v1/announcements`: verified Faculty/assigned Society Manager publishes
- `PATCH /api/v1/announcements/:id`: author edits
- `POST /api/v1/admin/announcements/:id/moderation`: Admin archives notice

## Registration contract

Provide the same verified email as Firebase with `Idempotency-Key: <random 8-128-character safe key>`. A unique key is required for each *attempt*, and the same key must be reused on network retries. Successful responses are replayed within a 24-hour receipt window. Never reuse a key for different request content.

```json
{"universityEmail":"student@cuiatd.edu.pk","registrationNo":"FA23-BSE-024"}
```

Registration runs in one MongoDB transaction: receipt + conditional seat increment + unique student/event confirmation. A failed transaction rolls back the seat count. **Requires an Atlas replica set and built unique indexes**.

## Security
- Role claims from Firebase alone never authorize campus features.
- Faculty needs `activeRoles.includes('faculty')` plus `facultyVerificationStatus==='verified'`.
- Society Manager needs active role **and** active assignment to the specified society; Faculty cannot spoof society ownership.
- Student auto-registration checks the signed-in student's campus email and creates a confirmation; students cannot cancel.
- Department notices are limited to students in the department; university and society notices can be viewed by any authenticated active campus user.
- Admin event cancellation does not remove confirmed registrations.

## Deployment / limitations

The existing `users` model and Firebase login need real Faculty/Society Manager/Admin provisioning; those workflows are not yet implemented. Do not manually give users privileged roles in production. Until then, publish routes intentionally return 403 for ordinary Student accounts.

Confirm collection indexes (especially `event_registrations(eventId,studentId)` and `idempotency_keys(universityId,actorId,scope,key)`) **before opening registration to traffic**. Existing test coverage is unit validation only: live Atlas transaction, duplicate-retry, concurrency 20-claim and authorization integration tests remain required before merge or deployment.

Official API source-of-truth is `CampusConnect_OpenAPI_3_1_v1.4.yaml`, to be updated as remaining endpoint behavior is implemented.
