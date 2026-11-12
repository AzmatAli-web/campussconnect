# Milestone 24 — Campus Notifications and Performance Optimization

**Development draft** stacked on the CI-green Milestone 23 branch. This feature reuses existing announcements and adds a compact personal-notification outbox. It does **not** send any live push notifications automatically or run a production messaging service.

## Delivered flows

1. University announcements appear in an authenticated, **on-demand** inbox as references to the existing `announcements` documents; their body previews are truncated to 240 characters. There is **one announcement record**, not a copy for every university student.
2. Department announcements appear only for the authenticated user's department; society announcements appear only to approved active members, current assigned managers, or Admin. This is stricter than the legacy campus announcement feed (which currently exposes society-scope announcements to all authenticated campus accounts). Before production, align the original announcement listing audience checks with this member/manager policy.
3. When a Student successfully registers for an event, the registration and a **single personal confirmation notification** are committed in the same MongoDB transaction. Idempotency replays do not create duplicate notifications.
4. Approved/rejected/removed society membership decisions create personal inbox updates in the **same transaction** as the audited membership decision. Member identity stays private from other students.
5. Students can mark **only their own** personal notification as read, or their own read receipt for an announcement they are currently allowed to access. The former updates one row; the latter inserts a separate per-recipient marker, without duplicating the announcement.
6. React and Flutter read inbox pages **only when the user opens Notifications**. No startup polling, background HTTP loops or dashboard-wide fanout.
7. Android users can explicitly opt in to FCM push for **personal** notifications by registering an FCM device token. The opt-in can be revoked for the current token. The optional admin-operated dispatcher is described below. **Campus announcement FCM broadcasts are not implemented**; they remain in-app.

## API contract

All routes are `/api/v1`, authenticated via Firebase and university-scoped.

| Method | Endpoint | Returns / restrictions |
| --- | --- | --- |
| GET | `/notifications?limit=20&cursor=...` | `{data:{items,nextCursor,hasMore,limit,unreadOnPage}}`. Default 20, max 40. Stable reverse chronological keyset cursor. |
| POST | `/notifications/:kind/:id/read` | Body `{}`; `kind=personal|announcement`. Owner/audience enforced. |
| GET | `/notifications/push-status` | Own opt-in device count, not tokens. |
| POST | `/notifications/push-devices` | Android Firebase registration `{token:"...",consent:true}`; up to five opted-in devices per campus user. Never returns token. |
| POST | `/notifications/push-devices/revoke` | `{token:"..."}`; revokes only a token currently registered to this user. |

Inbox example:
```json
{
  "data": {
    "items": [{
      "id":"507f1f77bcf86cd799439011",
      "kind":"personal",
      "type":"membership_approved",
      "title":"Society membership approved",
      "body":"Your society membership status has changed. Open Societies for details.",
      "sourceId":"507f191e810c19729de860ea",
      "createdAt":"2026-11-12T10:00:00.000Z",
      "readAt":null
    }],
    "limit":20,"hasMore":false,"nextCursor":null,"unreadOnPage":1
  }
}
```

`unreadOnPage` is **not** an expensive global count. UI labels it accurately as unread among loaded items. Inboxes use the JWT-bound current user and never expose internal recipient IDs, source keys, FCM tokens, or push delivery status.

## Performance and storage

- **No O(students) announcement fanout**. Reads merge a small, sorted subset of existing announcements with personal notification rows.
- **Cursor pagination** uses `(createdAt, _id)` or `(publishedAt, _id)` reverse order, rather than high-offset scans. The two source queries each fetch at most `limit+1` rows; the response merges/sorts no more than 82 records for a 40-item page. One indexed, batched read-marker query covers the visible announcement IDs.
- Indexes: personal `{universityId,recipientId,createdAt,_id}`, membership-based audience, unique personal `sourceKey`, unique `{universityId,recipientId,announcementId}` receipt, push work queue index. Existing announcement index `{universityId,status,publishedAt}` is reused.
- `notifications` and `notification_announcement_reads` have **90-day MongoDB TTL indexes**. Announcement feed similarly filters the previous 90 days without deleting the real academic announcements. MongoDB TTL expiration is asynchronous.
- **No automatic polling** on web/mobile. Client refresh or next-page requests are explicit, minimizing CPU, Firebase ID-token operations and battery/network consumption.
- Personal inbox writes run transactionally with event registration and society manager decisions. Optimized for correctness under retries.
- Unread read-state tracking is per user; no materialized read/unread columns on shared announcements.
- Operator controls batch size of FCM delivery: 1–50 personal notifications. Claim lease, bounded retries and invalid-token cleanup avoid infinite blocking loops.

## Optional Android push worker

The Flutter screen requests notification permission only after an explicit user action and registers the FCM token through the authenticated backend. Offline-preview mode never initializes Firebase Messaging or sends device registration requests. Tokens are stored privately in `notification_push_devices` and **must be treated as secrets**. A token reused by a different logged-in user is reassigned; token revocation on sign-out/account change should be added before production.

Push is **opt-in and not automatically scheduled**. The server-side dispatcher uses Firebase Admin application-default credentials and must be invoked by an operator or a protected scheduler from a configured service, for example:

```powershell
# Only on a secure configured developer/staging environment
cd backend
$env:NOTIFICATION_BATCH_SIZE = "25"
npm.cmd run notifications:dispatch
```

Each invocation processes at most 25 pending personal notifications (limit 50). Push payloads deliberately contain a generic message, not names, membership decisions, or other sensitive material. Attempts use a lease and retry backoff (up to four attempts). FCM is **at least once**: a crash after FCM acceptance but before marking as sent can produce duplicate system alerts. Do not represent this as exactly-once or guaranteed push delivery.

An enabled push button **does not** guarantee a message will be delivered until a secure dispatch scheduler and Firebase Admin credentials exist. The in-app inbox is the primary reliable record. Server-side FCM delivery and Android notification permissions still need actual staging/physical-device verification.

## Explicit release limitations

- Push dispatcher is opt-in manual/scheduler-driven; not a continuously deployed service.
- No FCM broadcasting to all announcement subscribers, no automatic local reminders, and no user-configured per-category quiet hours.
- The old `GET /announcements` society audience policy is broader than the notification inbox and should be aligned separately.
- Device token cleanup on sign-out, privacy retention approval, push abuse limits, delivery monitoring, real-device tests, and cross-role acceptance remain pending.
- CI tests cover unit, isolated integration, React build and Flutter; there is no authenticated real Firebase/Atlas acceptance or production deployment.
- This branch is stacked on unmerged drafts and should remain a draft PR pending release review.

## QA commands (later, from the existing repository)

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
