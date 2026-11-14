# Milestone 27 — Staging Acceptance Evidence

Milestone 26 defined the acceptance gates. Milestone 27 makes their status checkable against one immutable release candidate before the team requests a human decision. It does not provision services, perform staging tests, or approve a pilot.

## Start with a blank record

Keep working records in an access-controlled local workspace under a `pilot-evidence/` directory, which Git ignores. The tracked [blank fixture](../backend/test/fixtures/pilot-evidence.blank.json) contains no live evidence.

From `backend/` on Windows:

```powershell
New-Item -ItemType Directory -Force pilot-evidence | Out-Null
Copy-Item test/fixtures/pilot-evidence.blank.json pilot-evidence/record.json
npm.cmd run pilot:evidence -- pilot-evidence/record.json 0000000000000000000000000000000000000000
```

The blank fixture returns exit 1 and NO-GO. For an authorized staging exercise, set `stage` to `staging` and replace `candidateCommit` with the full lowercase commit SHA for the reviewed candidate. Pass the independently confirmed candidate SHA as the second command argument. If the reviewed or deployed candidate changes, do not carry its old passes forward without reassessment. The validator only compares the values supplied. It does not query Git or verify which version is deployed.

Each gate must be present once. Leave unfinished checks as `not-run` with just the `id` and `status`. After a check or review, record `pass`, `fail`, or `blocked` with its source, check date (UTC, YYYY-MM-DD), and opaque reviewer and evidence IDs. A blocked row can point to a private record describing what is needed. Example structure, not a result:

```json
{
  "id": "https-readonly-smoke",
  "status": "blocked",
  "source": "staging",
  "checkedOn": "2026-11-13",
  "reviewerRef": "reviewer-01",
  "evidenceRef": "EV-1001"
}
```

Use `reviewer-` plus 2–6 digits and `EV-` plus 4–10 digits. Keep the mapping to actual reviewers and evidence separately in the team's approved private tracker. Do not add names, student details, URLs, credentials, screenshots, or free text to the JSON. The CLI prints only known gate IDs and sanitized states or error codes. Avoid passing anything sensitive as a command-line argument.

## What closes each gate

| Gate ID | Pass source | What the reviewer checks |
| --- | --- | --- |
| `source-review-ci` | review | Stacked changes reviewed and CI green for the exact candidate |
| `staging-preflight` | staging | Authorized staging configuration passes the Milestone 26 preflight |
| `https-readonly-smoke` | staging | Approved HTTPS staging origin passes live/ready and unauthenticated protection checks |
| `firebase-atlas-isolation` | staging | Dedicated staging Firebase and Atlas resources, approved fictional accounts, no production access |
| `student-data-isolation` | staging | Synthetic student accounts stay within their own records and university |
| `event-roster-privacy` | staging | [Two students can browse and register for the same event without seeing each other’s records](MILESTONE28_EVENT_PRIVACY_ACCEPTANCE.md) |
| `staff-role-acceptance` | staging | Assigned Faculty, Manager, Admin and Finance roles work only within their scope |
| `moderation-acceptance` | staging | Marketplace and Lost & Found reports reach the authorized moderator and are handled as expected |
| `finance-complaints-governance` | review | Owners review reconciliation, audit, corrections and confidential-case routing |
| `private-storage-privacy` | review | Reviewer verifies durable private storage, revocation, scanning and retention controls |
| `android-device-fcm` | staging | Physical Android device passes install, session and push opt-in/out acceptance |
| `browser-accessibility` | staging | Role-critical workflows work in a real browser with keyboard and assistive technology |
| `staging-performance` | staging | Representative staging latency and error rate compared with agreed thresholds |
| `backup-restore-rollback` | staging | Recovery owners record a successful staged restore and rollback rehearsal |
| `incident-support-retention` | review | Owners confirm incident contacts, support coverage and retention policy |

A mocked or local rehearsal is `fixture` evidence and cannot close a gate. The `review` and `staging` labels are reviewer assertions, not signatures. The tool does not retrieve or authenticate evidence, test environment isolation, or change a release decision.

## Read the result

| Exit | Meaning |
| --- | --- |
| 0 | All gate metadata is complete for the staging candidate and the record is ready for human review |
| 1 | Valid record, but one or more gates have not passed with the required evidence, or the record is a fixture |
| 2 | Invalid or unreadable record, candidate mismatch, or incorrect command usage |

The CLI never issues GO. Record any actual release decision separately in the [acceptance record](PILOT_ACCEPTANCE_RECORD.md) process with the named approvers after they inspect the supporting evidence.

**First live handoff:** an authorized staging owner must confirm the isolated Firebase and Atlas resources, approved HTTPS API origin, fictional account roster, and immutable candidate. Then run the [Milestone 26 staging preflight and opt-in smoke](STAGING_PILOT_RUNBOOK.md) and capture the first real evidence. CI here exercises fixtures only.
