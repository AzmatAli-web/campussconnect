# CampusConnect QA scripts
These are opt-in developer tools, not production-ready backup infrastructure.

## Requirements
Node.js 20+, MongoDB Database Tools (mongodump/mongorestore), and a MongoDB test database.
Do not commit .env files or backup archives. Set MONGO_URI and BACKUP_SOURCE_DB in your shell.

## Backup and restore
Run from repository root:
```bash
node qa/backup.mjs
npm install --no-save mongodb
node qa/verify-restore.mjs
```
Restore verification uses a temporary database and drops it afterward. Run ONLY against a disposable test MongoDB server/user with permissions for creating and dropping test databases. Check BACKUP_SOURCE_DB matches the source database. Never run recovery testing against production.

For scheduled backups, configure an external scheduler to run `node qa/backup.mjs` and send archives to encrypted offsite storage. The script itself does not schedule or upload backups. Test restore periodically.

## Responsive and accessibility tests
Start your existing frontend on http://127.0.0.1:5173 or set QA_BASE_URL.
```bash
npm install --no-save @playwright/test @axe-core/playwright
npx playwright install chromium webkit
npx playwright test --config qa/playwright.config.mjs
npx playwright show-report
```
Tests require a running frontend; the current repository may not yet have one. Adjust the URL and route to your app. Accessibility automation does not replace manual keyboard and screen reader testing.
