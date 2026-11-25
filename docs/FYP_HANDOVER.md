# CampusConnect FYP handover and release decision

## Delivery report

The Flutter student app and React portal share an Express API backed by MongoDB. Firebase authenticates campus users. The delivered workflows cover verified profiles, events and QR attendance, announcements, societies, academic resources, lost and found, marketplace, private complaints and notifications. Personal study planning stays on the user's device. The [requirements matrix](FYP_REQUIREMENTS_TRACEABILITY.md) maps these workflows to implementation and identifies partial requirements.

Milestone 119 delivers per-event organizer analytics. Confirmed registrations form the denominator. Each successful QR check-in contributes one attendee; older receipts without a check-in count only as registrations. The percentage rounds to the nearest whole number. With zero registrations the UI shows “No registrations yet.” Counts cover the full event even when its private roster spans several pages. Messaging, institutional analytics and a campus AI assistant remain outside this delivery.

## User and operator manual

| Role | Walkthrough | Expected result |
|---|---|---|
| Student | Sign in with a verified campus account, open Events, register for an available event, then select My registrations → Show QR ticket. | The student's receipt displays a short-lived ticket. Refreshing replaces it. |
| Current organizer | In My managed events, select View attendance. Scan a student's ticket in the event's check-in field starting 30 minutes before the event, then submit. | An open summary updates on successful check-in. A second scan leaves the totals unchanged. Use Refresh attendance for scans made at another station. |
| Administrator | Use Administration to review a faculty applicant or inspect the private event roster. | The current role and campus scope determine access. |
| Maintainer | Follow the [setup checklist](SETUP_CHECKLIST.md), [mobile guide](MOBILE_STUDENT_APP.md) and [pilot runbook](STAGING_PILOT_RUNBOOK.md). | Record candidate, environment and observed outcomes in the [acceptance record](PILOT_ACCEPTANCE_RECORD.md). |

## Reproducible examiner demo

From the candidate checkout on Windows with Node.js 22+, open a PowerShell terminal in the repository root. The first lab run needs internet access to download dependencies and a MongoDB binary.

~~~powershell
git rev-parse HEAD
npm.cmd --prefix backend install
npm.cmd --prefix web install
npm.cmd --prefix web run admin:lab
~~~

Open http://127.0.0.1:5180/. Select Test Admin, open Administration and view the seeded workshop roster. Switch to Test Student; verify the student sees their own receipt and loses access to Administration. Stop the lab with Ctrl+C and restart it to reset the fictional data.

For repeatable evidence of the newer workflows, run these from the repository root:

~~~powershell
npm.cmd --prefix backend run test:integration
node backend/scripts/evaluate-lost-found.mjs
~~~

The QR integration scenario verifies attendance before registration, before check-in and after concurrent scans, plus student access denial. The matching evaluation prints precision and recall on eight labelled cases. See [QR attendance and matching](QR_AND_MATCHING.md) for the physical walkthrough and the limits of that sample.

## Release decision

**Hold production rollout.** The development prototype is available for demonstration. The following evidence is required before the project owner can sign off.

| Open gate | Evidence to record |
|---|---|
| Staging role acceptance (M115) | Candidate SHA and environment, successful role journeys, cross-account denial checks and unresolved defects. |
| Device and recovery acceptance (M116–117) | Physical Android push, PDF and calendar behavior; keyboard-reader QR scan and replay; staged restore and rollback outcome. Use the [Android guide](USB_ANDROID_LIVE_TEST.md) and [recovery rehearsal](../qa/README.md). |
| Final review (M120) | Reviewer and date, links to redacted evidence, remaining issues and explicit go/hold decision. |

The next action is a controlled staging and physical-device acceptance session. Keep personal data and credentials out of submitted evidence.
