# Milestone 47 — Unified Student Campus Calendar

A single student-only web calendar brings together three **existing** data sources, with no new API permissions:

- **Official weekly classes** from the authenticated published timetable. It uses the same account-specific, browser-saved group preference as the Timetable page. The group is a *viewing preference*, not proof of actual student enrollment. Class sessions repeat by day of week, not from an academic term start/end schedule, and may show outside the current semester until official dates become available.
- **Published campus events** from `GET /api/v1/events?when=all&limit=100`, placing each event on its *start day* in Pakistan Standard Time. It does not display attendee identities or private registration receipts. An explicit warning notes that the feed can be incomplete beyond the first 100 events; it is not a full archive.
- **Personal unfinished assignment deadlines** from the account-scoped browser local storage, consistent with Assignment Tracker. These are personal reminders, not faculty submissions; they do not sync to other devices.

Students can switch between Monday-start weeks and six-row month grids, move back and forward, return to today, filter categories, select a day for its agenda, and refresh published schedule data. Dates and event times are displayed in **Asia/Karachi**; note that the underlying event timestamps are UTC.

The calendar is code-split and visible only to active Student roles in the frontend navigation. Existing server auth applies to timetable and event reads; the calendar introduces no new privileged endpoints or PDF access. Browser storage remains account scoped. Missing feeds and load errors are handled independently and surfaced to users.

**Checks:** `npm --prefix web test`, `npm --prefix web run build`, and `npm --prefix web run test:browser` (fixture-only Chromium). Release to production and real-campus acceptance (live sessions, phones, accessibility tools) remain deferred.

The preceding Milestones 2–46 were integrated into `main` under PR #47 before this milestone was started.
