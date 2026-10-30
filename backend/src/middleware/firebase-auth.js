import {HttpError,asyncHandler} from '../lib/http-error.js';
export function requireFirebaseAuth(firebaseAuth) {
 return asyncHandler(async(req,_res,next)=>{
  if (!firebaseAuth) throw new HttpError(503,'FIREBASE_NOT_CONFIGURED','Identity service not configured');
  const match=/^Bearer ([^\s]+)$/i.exec(req.get('authorization')??'');
  if (!match) throw new HttpError(401,'AUTH_REQUIRED','Firebase bearer token required');
  try { req.firebaseClaims=await firebaseAuth.verifyIdToken(match[1],true); }
  catch { throw new HttpError(401,'INVALID_TOKEN','Firebase token invalid or revoked'); }
  next();
 });
}
