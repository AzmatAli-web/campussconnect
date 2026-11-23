# Milestone 43 — Assignment priorities and deadline overview

The browser-only student Assignment Tracker now supports high/medium/low priority on create and edit. Existing saved entries migrate to medium priority when read. The dashboard shows open, overdue, due in the next seven inclusive campus dates, and high-priority open counts. Countdown labels use calendar-day differences in Asia/Karachi rather than local browser timezone. Open items are sorted by due date, then priority for tied dates.

No backend deadline notifications, cross-device syncing, or official faculty submissions are added. Data remains locally scoped to the campus account and browser. Imported .ics files continue to contain titles, optional course, and dates, not priority or account details. Automated tests cover legacy records, leap-day boundaries, sorting, countdowns and status calculations. Test on real mobile devices later.
