# Private conversations (M125–126)

In the web workspace open **Messages**. In Flutter open **Profile → Messages**. Enter another active member's campus email. The recipient can accept or decline from their inbox. Repeated or reciprocal requests return the existing conversation; a declined request stays closed.

After acceptance, open the conversation to read or send text (up to 2,000 characters). Refresh to receive new messages. History and inbox pages hold 30 records and support loading older records. Both clients use the same API. Sending the same message again after a failed network response uses the same client identifier while the draft remains open.

## Backend setup

Run `npm run db:ensure-indexes` from the backend before enabling the feature on an existing production-mode database. The unique campus/pair and conversation/sender/client-ID indexes enforce deduplication across replicas. Participant and cursor indexes support inbox and history queries.

The API requires an active campus session. Requests, decisions and history are scoped to the authenticated university. Only the named recipient can decide, and only participants in accepted conversations can read or post. Names are captured when a request is made. Messages persist in the application database. Web and Flutter receive authenticated Socket.IO updates while Messages is open. A signal carries no message text. Clients fetch authorized history, merge by message ID and recover missed pages on reconnect. A foreground refresh every minute also covers missed signals across server replicas. Opening a thread marks the fetched incoming messages as read across devices. Earlier messages without a read timestamp count as unread until opened.

Either participant can block a pending request or an existing conversation. Both participants retain access to their accepted history. Sending and invitations stay paused until each person who blocked chooses Unblock.

On web and Flutter, choose Report conversation or Report message. A message report includes only the selected incoming message as evidence. The campus admin can open Administration → Private messaging reports, review the reason and evidence, and mark the report reviewed. The database records the reviewer and review time. Existing account moderation remains a separate decision.

Next milestone: M129 — approved campus knowledge sources for the AI assistant.
