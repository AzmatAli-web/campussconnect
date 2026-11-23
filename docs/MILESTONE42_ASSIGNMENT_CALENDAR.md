# Milestone 42 — assignment deadline calendar export

Student Assignment Tracker now provides **Export open deadlines (.ics)**. It generates a local calendar of unfinished assignments, with due dates as all-day events in the student-entered Pakistan campus date. An exclusive next-day `DTEND` makes each due date a single calendar day. The file contains only assignment title, optional course, due date, and a random local entry identifier. Completed items are excluded.

Importing the downloaded file into a calendar app is manual; no Google/Outlook integration, alarm, backend writes, account syncing, or automatic updates are implied. Re-importing an edited assignment should update an event in calendar apps that match calendar UIDs, but actual import behavior varies. Calendars may retain previous imports after planner deletion. Protect the downloaded file if course/deadline details are sensitive.

Run `npm --prefix web test`, `npm --prefix web run build`, and `npm --prefix web run test:browser` with Playwright Chromium installed. Live acceptance remains deferred.
