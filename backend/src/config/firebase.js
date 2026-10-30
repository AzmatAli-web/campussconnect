import {applicationDefault,getApps,initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
export function configureFirebase(config) {
  if (!config.firebaseProjectId) return null;
  if (!getApps().length) initializeApp({credential:applicationDefault(),projectId:config.firebaseProjectId});
  return getAuth();
}
