# CampusConnect Milestone 21 — Student Marketplace (development draft)

**Base:** Milestone 20 branch `feature/milestone20-backup-accessibility`. **Feature:** `feature/milestone21-student-marketplace`.

This implements the original SRS Marketplace rules **FR-M01–FR-M04 / BR-09**: Student-owned immediately published listings; browse/search/filter; owner edit/archive; any authenticated campus user may report; Admin reviews and moderates. It does **not** implement payments, escrow, parcel delivery, buyer messaging, or a seller verification program.

## Contract and data

All endpoints are prefixed with `/api/v1`, require verified Firebase campus authentication and an active university profile, and return `{data}` (lists also return `meta`). Express derives `universityId`, `sellerId`, `reporterId` and role permissions. Client-supplied owner/role IDs are rejected.

| Method | Path | Permission / behavior |
| --- | --- | --- |
| GET | `/marketplace?page=1&limit=20&q=...&category=books&minPrice=0&maxPrice=10000` | Any authenticated campus account; **published items in own university only** |
| GET | `/marketplace/:id` | Any campus account; currently published item only |
| GET | `/me/marketplace?page=1&limit=20` | Student; own published/sold/archived/moderated history |
| POST | `/marketplace` | Student; publish immediately |
| PATCH | `/marketplace/:id` | Student owner; edit while published only |
| POST | `/marketplace/:id/status` | Student owner; `{status:"sold"}` or `{status:"archived"}` |
| POST | `/marketplace/:id/image` | Student owner; one private JPEG/PNG/WebP photo, at most 2 MB, multipart field `file` |
| GET | `/marketplace/:id/image` | Any campus account; authenticated fetch, published listings only |
| GET | `/marketplace/:id/contact` | Any campus account; returns verified seller campus email **only if seller opted in and listing is published** |
| POST | `/marketplace/:id/reports` | Any authenticated campus account except seller; one report per user/listing |
| GET | `/admin/marketplace/reports?status=open` | Admin only; review queue |
| POST | `/admin/marketplace/reports/:id/resolve` | Admin only; `{action:"dismiss"|"archive",note:"..."}` |

Example publication:
```json
{
  "title": "Used programming textbook",
  "description": "Gently used book for the software engineering semester.",
  "category": "books",
  "condition": "good",
  "pricePkr": 1200,
  "contactConsent": true
}
```
Required fields: title 5–160 chars, description 20–3000, category `books|electronics|furniture|clothing|other`, condition `new|like_new|good|fair`, integer `pricePkr` 0–5,000,000, boolean `contactConsent`. 0 means free. Search query is escaped to prevent regex operators. Category and price filters are optional. Report reasons: `spam|scam|prohibited|misleading|other`.

The MongoDB collections are `marketplace_listings` and `marketplace_reports`. Both are university-scoped; owner and status indexes support browsing and personal management. A compound unique report index prevents duplicate reports by the same user. Data returned to ordinary clients **never contains** MongoDB seller IDs, reporter IDs, storage keys, Firebase UIDs or moderation identities. Audit events record Admin report resolution.

## Client surfaces

- **React:** lazy-loaded `Marketplace` workspace tab; Student publication, browsing, category/search filters, authenticated photo transfer, optional seller-email request, reporting and own editing/status. Admin sees the restricted report queue and may dismiss or archive.
- **Flutter Android:** Home/Profile entry opens `MarketplaceScreen`; browse/search/filter, publish, pick optional photo, edit, sold/archive, contact request, report. `image_picker` requires resolving the updated Flutter dependency before building.
- **Offline preview:** fictional seeded listing and local-only lifecycle; never contacts Firebase/MongoDB, reveals real email, or submits a real report.

## Security, limitations and release gates

1. **Campus email consent:** seller opts in explicitly. Buyers must be signed in; the email is retrieved with a separate authenticated request. This is still identity disclosure and needs campus policy/consent wording approval before production.
2. **Images:** private local disk only. Image type, extension, magic bytes and size are checked, and bytes are served only to active authenticated users on published listings. **No malware scanning, EXIF stripping, moderation of images, durable cloud object storage, CDN, lifecycle or storage backup is implemented.** No images are exposed via public static URLs.
3. **Moderation:** posts publish immediately and reports do not automatically hide items. Only Admin resolves reports; archive and audit entry use a MongoDB transaction. Broader prohibited-item rules, scam response process, takedown/appeal policy, automated abuse prevention and seller safety education still require formal review.
4. **Payments:** there is **no transaction, order, escrow, bank payment, delivery or buyer protection** feature. Students arrange any exchange themselves; production must include a campus safety warning.
5. **Backups:** MongoDB dumps in Milestone 20 do not include private image files. A separate storage backup/restore and retention policy is needed.
6. **Testing pending:** unit/integration and Flutter test sources have been added but have **not been executed for Milestone 21**. Physical-phone, browser role acceptance, image-picker compatibility and Firebase/Atlas integration are explicitly deferred.
7. **Draft chain:** Milestone 21 is stacked on unmerged Milestone 20 and the earlier drafts. No merge to `main`, deployment, real campus role creation or database mutation is part of this PR.

### Later local verification (not executed)

```powershell
# From project root, on feature/milestone21-student-marketplace:
cd backend
npm.cmd install
npm.cmd test
npm.cmd run test:integration

cd ..\web
npm.cmd install
npm.cmd test
npm.cmd run build

cd ..\mobile
flutter pub get
flutter analyze
flutter test
```

Use disposable fixtures and fake Firebase in integration tests. Manually validate a real Student and authorized Admin in staging; do not send secrets, tokens, personal records or connection strings in test logs.
