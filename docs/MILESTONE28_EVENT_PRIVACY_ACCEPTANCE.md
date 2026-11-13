# Milestone 28 — Event Privacy Acceptance

Students can see published campus events, including the time, venue, and total seats taken. They can register and see their own confirmation. They cannot see the attendee list, anyone else's registration, or identifying information about other registrants. A student registering for an event does not gain roster access. The existing roster permission is unchanged for the event's authorized organizer and campus administrators.

The API integration test exercises two fixture students registered for the same event. It also checks that registration responses, their replays, and roster responses are marked `Cache-Control: no-store`. The public-to-campus event projection remains unchanged. Fixture results do not count as live staging evidence.

## Authorized staging walkthrough

Before running this check, confirm the reviewed commit, staging HTTPS origin, isolated Firebase and Atlas resources, and fictional test accounts. Start with the [staging preflight and read-only smoke](STAGING_PILOT_RUNBOOK.md). Do not run the registration exercise on real campus events or with real student accounts.

| Actor | Action | Expected result |
| --- | --- | --- |
| Authorized organizer | Publish one fictional event with at least three seats and open registration | Both test students can see the event |
| Student A and Student B | Use separate sessions to open the event and each register once. Cover the React and Android clients | Both see the same event and aggregate count. Each sees their own confirmation in My registrations |
| Student A and Student B | After both registrations, check their event list, event details, My registrations and attendee UI | No names, emails, student numbers, or other people's registration records. No student-facing roster |
| Student A and Student B | With an approved test client, request the test event's roster as each student | Both get HTTP 403 with no attendee data. The response is marked `no-store` |
| Authorized organizer or campus Admin | Open the private roster | Both fictional attendees are visible only in the authorized roster |
| Unrelated Faculty account | Open the roster for the same event | HTTP 403 and no attendee data |

Use the [Milestone 27 evidence checker](MILESTONE27_STAGING_ACCEPTANCE.md) and record `event-roster-privacy` with source `staging` only after this check is actually performed. If you started with the Milestone 27 blank record, add the missing gate with `{"id":"event-roster-privacy","status":"not-run"}` and reassess evidence against the current candidate. Keep identities and private screenshots out of GitHub and the evidence JSON.

**Current state:** automated regression only. No live staging exercise has been performed. The pilot remains NO-GO.
