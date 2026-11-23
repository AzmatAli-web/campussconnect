# Milestone 15 — Finance Officer authorization and transactional audit

## Permission model

Financial records use a new `financeOfficer` role. Ordinary `staff` and `admin` roles cannot read or modify the finance ledger. Active students can still read **only their own** invoices and recorded payments.

An authenticated Admin can grant Finance Officer access only to an **active, verified campus Staff** user after confirming current Firebase identity and submitting an approval reference, written reason, and explicit attestation. The Admin cannot grant the role to themself or another Admin. Admins can revoke finance permissions with a written reason. Neither action happens automatically or creates new Firebase users.

* POST `/api/v1/admin/finance-officers/:id/grant` — Admin only, body `{attested:true,evidenceReference,reason}`
* POST `/api/v1/admin/finance-officers/:id/revoke` — Admin only, body `{reason}`

All finance queries, invoices, and receipt-entry operations have moved from `/staff/fees` to `/finance/fees`. Existing Student routes `/me/fees` and `/me/fees/:id/payments` are unchanged.

The React Admin page includes an approval/revocation form. The React finance ledger is visible only to a Student or a Finance Officer. Admins retain access to the campus-wide privileged audit log, but **not** the finance ledger.

## Transactional audit

Finance Officer approvals, revocations, invoice issuance, and entry of already verified offline receipts write to the existing `AuditLog` collection. For financial mutations, the invoice/payment write and corresponding audit entry are committed in **one MongoDB transaction**. If the audit write fails, the financial mutation rolls back. Duplicate receipt references and attempted overpayments cannot change the recorded balance or create a successful audit entry.

The audit log contains actor ID, action, invoice target ID, amount and recorded receipt reference. The Admin's existing Audit Trail shows finance events. The application does not expose audit data to students.

**Important:** MongoDB application audit logs are NOT independently tamper-evident. A database administrator could still modify them. Production requires append-only storage, off-system replication, finance reconciliation and approved correction/reversal rules.

## Automated tests and release

Backend integration uses an isolated MongoDB replica set with fixture Firebase claims. Tests check: unprivileged Staff denial; Admin attestation; grant/regrant/revoke constraints; safe student data views; recorded payment atomicity; receipt uniqueness; and correct audit entries. React navigation checks finance role visibility. Flutter maintains read-only student access and requires no new privileged screens.

No real campus accounts are promoted, no real invoices are issued, and no payments are processed by CI.

The draft branch is stacked on Milestone 14. Before use with genuine financial data, the university must approve who may hold Finance Officer access, establish an independent payment verification workflow, and approve data protection, audit retention and financial dispute procedures.
