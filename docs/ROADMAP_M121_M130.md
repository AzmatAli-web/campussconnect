# CampusConnect milestones 121–130

These ten milestones extend the M120 handover. Each is planned. The staging sign-in, role checks, physical Android checks and release decision in the [handover](FYP_HANDOVER.md) remain open. Continue to use the [requirements matrix](FYP_REQUIREMENTS_TRACEABILITY.md) for earlier capabilities.

| Milestone | Deliverable | Completion criteria |
|---|---|---|
| M121 · Society profile management | Let an actively assigned manager edit their society description and contact details in the web portal. Show published updates in both directories. | Changes survive a reload. A revoked manager and a manager of a different society cannot edit the record. |
| M122 · Profile editing across web and mobile | Connect both profile screens to the existing profile update API for the fields each role can edit. | An edit on either client appears on the other. Email verification, roles and campus identity remain server-controlled. |
| M123 · Durable private academic files | Store faculty PDF uploads in private persistent storage and preserve access to existing resources during migration. | An authorized student can download the same file after a service restart. Archiving revokes access and a failed upload leaves no published broken link. |
| M124 · Upload scanning and retention | Add quarantine, scanning, cleanup and a documented retention period to M123. | Only cleared files become downloadable. Failed scans stay quarantined. Cleanup handles retries without deleting active files. |
| M125 · Private conversation requests | Let campus users request, accept or decline a one-to-one conversation. | Only the intended recipient can respond. Cross-campus requests fail, and repeated requests cannot create duplicate active conversations. |
| M126 · Messaging inbox and history | Add private messaging to accepted conversations in React and Flutter, with paginated history and retry-safe sends. | Both participants can exchange messages across clients. Reload preserves history, resending one request stores one message, and a third account cannot read the thread. |
| M127 · Live messages and unread counts | Add authenticated Socket.IO delivery and synchronize read state across sessions. | A disconnected client retrieves missed messages once on reconnect. Opening a thread updates its unread count on the user's other device. |
| M128 · Blocking and message reports | Let users block unwanted contact and report a specific message for authorized review. | A block stops new requests and sends, including through an existing socket. Reviewers can see the reported evidence within their permitted scope. |
| M129 · Approved campus knowledge collection | Let authorized staff review, version and withdraw official sources for the campus assistant. Preserve campus and audience restrictions during indexing. | Approved sources are searchable by the intended audience. Withdrawn, superseded and unauthorized material drops out of retrieval. |
| M130 · Campus assistant with citations | Answer campus questions from the M129 collection and link answers to the supporting source. | A reviewed question set covers supported, ambiguous and unanswered questions. Answers cite accessible sources, request clarification when needed and acknowledge missing evidence. |

## Order of work

Start with M121. M121–122 close gaps in existing workflows. M123–124 establish the file lifecycle. M125–128 deliver messaging from consent through moderation. Complete M129 before building answers in M130. Review the combined messaging features internally before enabling them for a pilot group.
