# CampusConnect MVP release candidate

This branch includes the milestone stack through the event calendar export and adds a local web demo for the three core modules: timetable, events, and faculty notes. The branch is a review candidate, not a live release. Other modules remain in the repo and are outside the core demo.

## Start the credential-free demo

In Windows PowerShell, from the repository root:

```powershell
git fetch origin
git switch --track origin/feature/milestone31-mvp-release-candidate
cd web
npm.cmd install
$env:VITE_ENABLE_TEST_LAB = 'true'
npm.cmd run dev
```

If the branch already exists locally, use `git switch feature/milestone31-mvp-release-candidate` and `git pull --ff-only` in place of the first switch command. Open `http://localhost:5173/?test-lab=1` using the port printed by Vite. No Firebase account, database, backend process, or uploaded files are required. The Lab banner identifies all content as fictional.

| Demo stop | What to show |
| --- | --- |
| Timetable | Select Section A and Section B to see different classes, times, and rooms. |
| Events | Switch to Demo Student 1, open Events, and register for Campus Dev Meetup. Switch to Demo Student 2. The event and count remain visible, but Student 1’s confirmation and the roster do not. Register Student 2 and switch to Demo Administrator to show the restricted roster. Use a desktop-width browser to switch personas. |
| Faculty notes | Open the sample course note and expand its preview. The Lab shows fictional text. PDF upload and download are available only in the connected portal. |

Use **Reset all demo data** to repeat the walkthrough. Reloading also clears the fictional state. Stop Vite with Ctrl+C. The demo is not enabled in the production build.

## Run the connected web portal when needed

Use the same checkout. Keep the Lab toggle off or use the regular URL without `?test-lab=1`. The connected portal requires approved development Firebase/Atlas settings, an existing campus record and authorized accounts. Reuse your existing approved development settings, or use `backend/.env.example` and `web/.env.example` as templates. Keep actual backend credentials outside Git. Ensure the web Firebase project matches the backend Firebase project, and that backend CORS allows the web origin.

Backend terminal, from the repository root:

```powershell
cd backend
npm.cmd install
npm.cmd run db:ensure-indexes
npm.cmd run dev
```

Run the index command only against your configured development database. Web terminal, from the repository root:

```powershell
cd web
npm.cmd install
npm.cmd run dev
```

In the connected app, Staff/Admin publish official timetable classes, verified Faculty publish PDF notes, and authorized organizers publish events. Students browse the published content, register for events and download published notes. Event seat totals are visible, but a student sees only their own registration. The event’s authorized organizer and campus administrators can see the roster. Empty lists are expected when approved roles have not published content.

**Release status:** draft review only. Local demo and automated tests are separate from live acceptance. The [web and Android staging walkthrough](MILESTONE28_EVENT_PRIVACY_ACCEPTANCE.md) remains deferred, no deployment or pilot approval is implied, and QR check-in is outside this candidate.
