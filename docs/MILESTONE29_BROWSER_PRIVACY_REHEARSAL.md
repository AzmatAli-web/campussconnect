# Milestone 29 — Browser Privacy Rehearsal

This test runs the actual React workspace in Chromium, with fictional accounts and intercepted API responses. It exercises the screens used for event browsing, registration, and roster viewing. It does not use the in-app Test Lab, sign into Firebase, talk to MongoDB, or deploy anything.

- Student A registers from a desktop browser. Student B, on a mobile-width browser, sees the updated seat count but no personal confirmation until registering.
- Both students then see the same published event and seat totals, each sees a personal confirmation, and neither sees an attendee list or sends a roster request.
- The fictional organizer opens the roster and sees the two fictional registrants.

From `web/`:

```powershell
npm.cmd install
npx.cmd --no-install playwright install chromium
npm.cmd run test:browser
```

The runner starts a loopback-only Vite server on an available port, uses isolated browser contexts, and closes them afterward. The fixture HTML is not a production build entry point. The web workflow runs the same test in GitHub Actions. The [backend integration suite](MILESTONE28_EVENT_PRIVACY_ACCEPTANCE.md) separately checks server-side authorization.

**Still outstanding:** the approved HTTPS staging origins, isolated Firebase and Atlas resources, and the two-student live walkthrough on web and native Android. This browser run is fixture evidence only and cannot close `event-roster-privacy`.
