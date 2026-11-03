# Milestone 12 — Academic Resources (Faculty PDF library)

CampusConnect now includes a **real PDF resource workflow** using the existing Firebase-authenticated Node.js/Express API, MongoDB metadata, React campus portal, and Flutter student app. Faculty publish resources; students search and download notes. This feature is on a **draft, unmerged branch**.

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

### Storage — important limitation

For **local single-server development**, uploaded PDF bytes are stored privately under `backend/private_uploads/` (ignored by Git). MongoDB stores metadata and a randomly generated private storage key. The folder is **not** mounted as an Express static directory. Set `RESOURCE_UPLOAD_DIR` in your backend environment to override the path to a securely writable nonpublic directory.

**Do not use this local disk architecture for production on Vercel or another ephemeral/multi-instance server.** Before production, replace the file store with a managed private object storage service (e.g. S3/R2/Azure), implement controlled signed retrieval or authenticated proxy streaming, malware scanning, quotas, retention/backup and documented privacy policy.

PDF magic/header validation is not antivirus scanning. University approval for sharing course material remains the uploader's responsibility.

### React

Open **Academic Resources** from the sidebar. Active users can filter and download. After a real university administrator verifies a Faculty user, that account also sees a PDF upload form and its own archive controls. All downloads use the Firebase token in an HTTP header, never in a public URL.

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
