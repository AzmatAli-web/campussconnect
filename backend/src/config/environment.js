const OBJECT_ID = /^[0-9a-f]{24}$/i;
const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export function parseEnvironment(source = process.env) {
  const port = Number(source.PORT ?? '4000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const nodeEnv = source.NODE_ENV ?? 'development';
  if (!['development','test','production'].includes(nodeEnv)) throw new Error('Invalid NODE_ENV');
  const corsOrigin = (source.CORS_ORIGIN ?? 'http://localhost:5173').trim();
  if (!/^https?:\/\/[^/\s]+$/.test(corsOrigin)) throw new Error('CORS_ORIGIN must be a single explicit origin');
  if (nodeEnv === 'production' && !corsOrigin.startsWith('https://')) throw new Error('Production CORS_ORIGIN must use HTTPS');
  if (nodeEnv === 'production' && source.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Firebase emulator forbidden in production');
  const mongoUri = (source.MONGODB_URI ?? '').trim();
  if (mongoUri && !/^mongodb(\+srv)?:\/\//.test(mongoUri)) throw new Error('Invalid MONGODB_URI');
  const firebaseProjectId = (source.FIREBASE_PROJECT_ID ?? '').trim();
  const universityId = (source.UNIVERSITY_ID ?? '').trim();
  if (universityId && !OBJECT_ID.test(universityId)) throw new Error('Invalid UNIVERSITY_ID');
  const domains = [...new Set((source.UNIVERSITY_EMAIL_DOMAINS ?? '').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean))];
  if (!domains.every(x=>DOMAIN.test(x))) throw new Error('Invalid UNIVERSITY_EMAIL_DOMAINS');
  if (nodeEnv === 'production' && (!mongoUri || !firebaseProjectId || !universityId || domains.length===0)) throw new Error('Production requires MongoDB, Firebase, university ID and email domains');
  return Object.freeze({port,nodeEnv,corsOrigin,mongoUri,firebaseProjectId,universityId,domains:Object.freeze(domains)});
}
