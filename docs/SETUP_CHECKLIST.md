# Cloud setup checklist

No Firebase project or MongoDB Atlas cluster has been provisioned. Do not commit secrets.

## Firebase
1. Create a dedicated Firebase development project at https://console.firebase.google.com/.
2. Enable Authentication -> Email/Password; enforce email verification.
3. Set FIREBASE_PROJECT_ID in backend/.env.
4. For local service credentials, use Application Default Credentials with GOOGLE_APPLICATION_CREDENTIALS pointing to a file **outside the repo**. Prefer workload identity in production.
5. Send Firebase ID tokens in Authorization Bearer header; backend verifies revocation. Firebase custom claims do not grant campus roles.

## MongoDB Atlas
1. Create a development cluster at https://cloud.mongodb.com/.
2. Create a least-privilege application database user.
3. Restrict Atlas network access to developer/deployment IPs; avoid unrestricted 0.0.0.0/0.
4. Store MONGODB_URI only in backend/.env / deployment secrets.
5. Provision University document by an audited admin-only procedure after university is verified. Set UNIVERSITY_ID to its ObjectId.
6. Set UNIVERSITY_EMAIL_DOMAINS only after official verification. Until then, user bootstrap fails closed.

## Security boundary
- Student: active only with verified approved university email.
- Faculty: selecting Faculty does NOT prove employment; account remains pending until faculty-only roster/email evidence or Admin document review is implemented.
- Society Manager, Staff, Admin: granted by authenticated server-side privileged workflow, not via registration.
- Bootstrap the first Admin using one-time audited setup; no public Admin signup.

## Validate
```bash
cd backend
npm install
npm test
npm run dev
curl http://localhost:4000/api/v1/health/live
curl http://localhost:4000/api/v1/health/ready
```
Expect 503 readiness until configured. Cloud integration, provisioning, role management and remaining business modules are not implemented.
