# Backend Milestone 1

Node.js 22+ / Express / Mongoose / Firebase Admin.

## Run
```bash
cp .env.example .env
npm install
npm test
npm run dev
```

## Implemented API foundation

| Method | Path | Description |
|---|---|---|
| GET | /api/v1/health/live | Liveness |
| GET | /api/v1/health/ready | Cloud readiness |
| POST | /api/v1/auth/bootstrap-profile | Verified campus user bootstrap; faculty pending |
| GET | /api/v1/me | Read own profile |
| PATCH | /api/v1/me | Edit safe profile fields |
| GET | /api/v1/me/roles | Server-authorized roles |

Firebase verifies identity. MongoDB grants permissions. No self-assignment of privileged roles. Until University/Department provisioning is built, departmentId is rejected. The initial automated tests cover configuration, validators and role security, not cloud integration.
