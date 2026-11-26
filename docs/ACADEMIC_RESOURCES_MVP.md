# Milestone 12 — Academic Resources (Faculty PDF library)

CampusConnect now includes a **real PDF resource workflow** using the existing Firebase-authenticated Node.js/Express API, MongoDB metadata, React campus portal, and Flutter student app. Faculty publish resources; students search and download notes.

## Actors and permissions

- **Student and other active verified campus members:** browse published PDFs by program, semester and course code; download only through their authenticated Firebase token.
- **Verified Faculty:** upload up to 8 MB PDF per resource, inspect own uploads, archive their own published resources. Faculty approval must happen in the existing protected governance workflow.
- **Admin:** can archive any published resource. An Admin account is **not created or granted** automatically.
- **Unverified Faculty, suspended accounts, anonymous visitors, and Student roles:** cannot upload or archive a PDF.
- **Archived resources:** disappear from the campus listing and downloads return 404. Authors can still see archived metadata in their own history.

## REST API

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/v1/resources?program=BSE&semester=7&courseCode=CSC494&limit=50` | Authenticated active campus member |
| GET | `/api/v1/me/resources` | Verified Faculty (own upload history) |
| POST | `/api/v1/resources` | Verified Faculty multipart PDF (field name `file`, metadata `title`, `description`, `program`, `semester`, `courseCode`) |
| GET | `/api/v1/resources/:id/file` | Authenticated active campus member, published PDF only |
| POST | `/api/v1/resources/:id/archive` | Uploading verified Faculty or Admin, empty JSON body |

PDF uploads validate extension, claimed MIME, 8 MB limit and PDF magic header. All resource responses avoid exposing storage paths, uploader identities, or other private operational data. Downloads are attachment responses with `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.

### M123–124 · Private storage, scanning and retention

The API stores the PDF bytes and metadata together in one MongoDB document. The existing upload limit is 8 MiB. Database backup capacity must include the PDF bytes. Downloads recheck current campus membership and publication status.

Configure a private ClamAV daemon with current signatures. Set `RESOURCE_CLAMD_HOST` on the API and, if needed, `RESOURCE_CLAMD_PORT` (default 3310). Restrict the scanner to the trusted service network; it receives the original document. Enable PDF parsing and configure stream and scan limits above the upload limit. Before enabling uploads, verify signature updates and run a clean-PDF scan with the deployed daemon.

Run `npm run db:ensure-indexes` in the backend to install the retention index. New files remain in quarantine until the scanner returns a clean result. Detection returns HTTP 422. A missing or unavailable scanner returns HTTP 503 and the faculty member can retry. Both cases keep the file inaccessible. Quarantined records expire after 24 hours. Archiving revokes access immediately and schedules the database record and its bytes for deletion after 30 days. MongoDB performs expiry asynchronously. Published records have no expiry. Separately managed backups follow their own retention period.

For legacy files, run `node scripts/migrate-resource-pdfs.js` from the backend on a host that still has the original private upload directory and database access. Set `RESOURCE_UPLOAD_DIR` to the original path and use the same scanner configuration. The migration scans each published PDF and atomically moves its contents into its existing record, preserving bookmarks. A request for a legacy PDF also attempts migration before serving it. Review reported IDs and rerun after resolving missing files or service issues. Preserve the legacy disk until migrated downloads and backups have been verified. The utility leaves original disk copies in place for operator-managed disposal. Previously archived records retain their existing retention settings.

### React

Open **Academic Resources** from the sidebar. Active users can filter and download. After a real university administrator verifies a Faculty user, that account also sees a PDF upload form and its own archive controls. All downloads use the Firebase token in an HTTP header, never in a public URL.

### Saved notes on the web

Students can use **Save note** in Academic Resources, then open **Saved notes** to revisit bookmarks. Up to 50 resource IDs are stored in this browser for this campus account. Bookmarks are not synced to other devices and do not store PDF files.

The authenticated `GET /api/v1/me/saved-resources?ids=…` lookup returns only currently published resources from the student's campus. Old bookmarks can be removed if a note is no longer available. Downloads still use the existing authenticated PDF route.

### Flutter

Open the **Notes** tab to browse/filter Faculty material. Select **Open PDF** to fetch it privately using the Firebase ID token, save a short-lived copy in the app's temporary directory and open it in a compatible installed PDF viewer. This does **not** copy PDFs into the user's persistent public Downloads folder.

The **offline Preview** shows one clearly labeled fictional resource and disables downloads.

### Automated tests

Backend unit tests check metadata, PDFs, file names and query filters. Isolated integration tests use fake Firebase users, an in-memory MongoDB replica set and a disposable temporary upload directory. They validate forbidden uploads, PDF content checks, authorized downloads, archive and collection visibility without touching Atlas or real user accounts.

Flutter widget-free tests cover authenticated resource lists and PDF bytes with fake HTTP; they do not require the phone to be connected. React tests/build and Flutter analysis/tests run in CI.

### Later whole-app acceptance

The phone can remain disconnected while we build. Once all modules are ready:

1. Run `npm.cmd run db:ensure-indexes` from `backend` before starting Express (indexes for resource filters).
2. Run the backend, React web and `mobile/scripts/run-phone-live.ps1` after reconnecting USB.
3. Verify the same Firebase Student can view the resource list in both React and Flutter.
4. If a legitimately approved Faculty account is available, upload a harmless PDF in a **staging** environment, verify download from Student on both clients, then archive and confirm access is revoked.
5. If no real Faculty exists, rely on isolated automated fixture tests instead. Do not grant fake privileged roles.

This draft branch depends on the earlier draft PRs and has not been merged or released.
