# CampusConnect Admin Lab

Use the Admin Lab to test the React administration workspace and Express authorization and data changes without creating a cloud Admin or touching your connected data. It starts a disposable MongoDB replica set, seeds fictional test personas, and supplies a lab-only substitute for Firebase sign-in. Normal Firebase authentication and MongoDB settings are unchanged.

## Start on Windows

From the repository root in PowerShell:

```powershell
git fetch origin
git switch --track origin/feature/milestone33-admin-test-lab
npm.cmd --prefix backend install
npm.cmd --prefix web install
npm.cmd --prefix web run admin:lab
```

If you already have the local branch, use `git switch feature/milestone33-admin-test-lab` and `git pull --ff-only` instead of the tracking-branch command. Keep any local edits and configuration files. Neither `.env` file is needed for this lab. The command may download a MongoDB binary the first time.

Open **http://127.0.0.1:5180/**. Your working web and backend terminals can stay on ports 5173 and 4000. The lab binds only to loopback and discards its data when you stop it with Ctrl+C. Start it again to restore the original fixtures.

## Try these checks

1. As **Test Admin**, open **Administration** and confirm the fictional accounts appear. Open the workshop roster to see the fictional student registration.
2. Create a fictional society in **Administration** and check the audit log. You can also approve the seeded Faculty Applicant and switch to that persona to see the new faculty access.
3. Switch to **Test Student** in the lab header. Events and the student's own confirmation remain visible. Administration and the attendee roster do not.

This exercises the real UI and API against the local database. It does not verify real Firebase sign-in or provision any cloud role. For a real Admin in a confirmed development environment, use the separate [audited first-admin bootstrap](ADMIN_BOOTSTRAP_AND_ROLES.md). A public signup form should never provide an Admin role.
