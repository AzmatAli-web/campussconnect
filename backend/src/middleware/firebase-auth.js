import {HttpError,asyncHandler} from '../lib/http-error.js';

const TOKEN_FAILURE_CODES = new Set([
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/invalid-id-token',
  'auth/argument-error',
  'auth/user-disabled',
]);

const CONFIG_FAILURE_CODES = new Set([
  'auth/insufficient-permission',
  'auth/invalid-credential',
  'app/invalid-credential',
  'auth/internal-error',
  'ENOENT',
  'EACCES',
]);

export function classifyFirebaseVerificationError(error) {
  const code = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
  if (code === 'auth/user-disabled') {
    return new HttpError(403,'ACCOUNT_DISABLED','Firebase account is disabled');
  }
  if (TOKEN_FAILURE_CODES.has(code)) {
    return new HttpError(401,'INVALID_TOKEN','Sign in again to refresh your session');
  }
  if (CONFIG_FAILURE_CODES.has(code) || code === 'UNKNOWN') {
    return new HttpError(503,'FIREBASE_VERIFICATION_UNAVAILABLE','Firebase server verification is unavailable. Check backend configuration.');
  }
  return new HttpError(503,'FIREBASE_VERIFICATION_UNAVAILABLE','Firebase server verification is unavailable. Check backend configuration.');
}

export function requireFirebaseAuth(firebaseAuth) {
  return asyncHandler(async (req,_res,next) => {
    if (!firebaseAuth) throw new HttpError(503,'FIREBASE_NOT_CONFIGURED','Identity service not configured');
    const match = /^Bearer ([^\s]+)$/i.exec(req.get('authorization') ?? '');
    if (!match) throw new HttpError(401,'AUTH_REQUIRED','Firebase bearer token required');
    try {
      req.firebaseClaims = await firebaseAuth.verifyIdToken(match[1],true);
    } catch (error) {
      const code = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
      console.error('[CampusConnect Firebase Auth] verification failed; code:',code);
      throw classifyFirebaseVerificationError(error);
    }
    next();
  });
}
