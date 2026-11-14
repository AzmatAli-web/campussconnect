# CampusConnect — Milestone 20 backup/recovery & accessibility QA (draft)

This is optional developer tooling built on the **Milestone 19** full-stack branch. It is **not** part of the live CampusConnect API, does not run automatically, and is **not evidence of a successful restore or a production-ready release**. All tests and configuration remain to be executed/reviewed.

## 1. MongoDB backup (read source, write local archive)

Prerequisites: Node.js 22+, MongoDB Database Tools 100.3+ in PATH. The MongoDB tools support `--config` YAML files so database passwords do **not** appear in command-line arguments. Create a YAML file **outside the Git repository**, with restricted file permissions, containing:

```yaml
uri: mongodb://username:password@127.0.0.1:27017/?authSource=admin
```

Use your own properly scoped development database credentials; the above is an illustrative placeholder, not a working URI. Never commit or paste credentials. Backups can contain private campus/user information; use an encrypted, access-controlled destination.

In PowerShell, **from the repository root**:

```powershell
$env:CAMPUS_BACKUP_CONFIG = "C:\\secure\\mongo-tools-source.yml"
$env:CAMPUS_BACKUP_SOURCE_DB = "campusconnect_dev"
$env:CAMPUS_BACKUP_DIR = "D:\\private-backups\\campusconnect"
node qa\\backup.mjs
```

Set those example paths and database name to match **your actual development environment**. The script backs up exactly one specified application database (not the entire MongoDB deployment), writes a compressed archive outside the repo, and deletes an incomplete output on failure. **No automatic retention, offsite copy, encryption or scheduler is configured.** Files under local private PDF storage are NOT covered by the MongoDB dump.

## 2. Restore verification (disposable server only)

Use a **different** MongoDB tools YAML config pointing to an isolated/disposable MongoDB instance. Do **not** use the live application or production Atlas database for a restore test.

```powershell
$env:CAMPUS_RESTORE_CONFIG = "C:\\secure\\mongo-tools-disposable.yml"
$env:CAMPUS_BACKUP_SOURCE_DB = "campusconnect_dev"
$env:CAMPUS_BACKUP_FILE = "D:\\private-backups\\campusconnect\\YOUR_FILE.archive.gz"
node qa\\verify-restore.mjs   # safe dry run: no data writes
```

To perform an **actual** restore on the disposable target, after verifying the target configuration:

```powershell
$env:CAMPUS_RESTORE_WRITE = "YES_DISPOSABLE"
node qa\\verify-restore.mjs
Remove-Item Env:CAMPUS_RESTORE_WRITE
```

The script remaps collections into a unique `campusconnect_restore_...` database. It never uses `--drop` and **does not delete that database automatically**. Inspect record counts and indexes, then manually delete the test database once you have verified the results. A successful command is not proof of recoverability without inspecting data, indexes, attachments, permissions, and recovery time.

## 3. Responsive/accessibility smoke checks (public React entry only)

First run your existing web app from `web` using `npm.cmd run dev`. In another PowerShell terminal:

```powershell
cd qa
npm.cmd install
npm.cmd run install:browser
npm.cmd run test:ui
```

By default Playwright opens `http://localhost:5173`; set `$env:QA_BASE_URL` for another local/test URL. The tests cover mobile, tablet and desktop Chromium viewports, horizontal overflow, common WCAG A/AA violations via axe, and basic keyboard navigation. **They do not test authenticated roles, real mobile hardware, all pages, screen readers or production accessibility.** A keyboard test is reported as skipped when the unauthenticated screen has no focusable controls (for example, missing Firebase config).

Playwright reports/screenshots/traces can contain private page data; keep them local and review before sharing. Browser/mobile acceptance testing remains pending. No code has been deployed.

## Relationship to milestone 19

The existing `scripts/verify-all.ps1` and `.github/workflows/full-stack-qa.yml` remain unchanged. Milestone 20 adds **opt-in** verification tooling only. Do not merge this draft until its commands have been executed against a safe development environment and reviewed.
