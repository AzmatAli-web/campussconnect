# Milestone 18 — Database query/index optimization

These changes address query patterns observed in CampusConnect's current Express routes.

## Schema changes

- **Event registrations:** added a compound index for `/me/event-registrations` (`universityId,studentId,confirmedAt DESC,_id DESC`), which previously lacked an index ordered by student and timestamp.
- **Events:** indexes now cover the published campus listing's stable sort and organizer-specific event history.
- **Announcements:** added `_id DESC` as a sort tie-breaker to the existing campus/status/published-time index.
- **Timetable & resources:** removed redundant single-column `universityId` schema index declarations. Compound indexes with `universityId` as the first column remain.
- **AdminBootstrap:** removed the duplicate `universityId` unique index declaration (the field retains its unique constraint). This was one source of Mongoose duplicate-index warnings.
- **Academic PDF catalog and timetable read endpoints:** explicitly project public fields from MongoDB. No longer fetch full internal upload storage metadata or full 15-minute timetable key arrays just to discard them in API projection.

### Existing MongoDB indexes

The app's `npm run db:ensure-indexes` command **creates/checks** indexes. It does not delete obsolete indexes and this PR does not drop any indexes in Atlas. Consequently, a development database that already has old indexes may still store them, using additional disk/write resources until a DBA verifies replacement indexes and drops obsolete ones intentionally.

From `backend` after verifying credentials and backup:

```powershell
npm.cmd run db:ensure-indexes
npm.cmd run test
npm.cmd run test:integration
```

**Do not automatically drop existing indexes.** Inspect `db.getCollection('events').getIndexes()` and related collections using your DBA tooling. Verify new indexes exist, inspect production query plans with `explain('executionStats')`, assess data distribution, then consider rolling removal of obsolete indexes only in a scheduled migration.

No measured latency/speedup is claimed; correctness and query-index alignment are verified by schema unit tests and existing API integration tests.

## Security/release

This remains a draft stacked PR. No live data is queried or modified by CI; backend integration tests use fake Firebase users with an isolated MongoDB replica set. Student data privacy and staff permissions remain unchanged.
