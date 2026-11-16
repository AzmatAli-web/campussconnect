const objectId = /^[a-f0-9]{24}$/;
export const MAX_SAVED_NOTES = 50;

export function savedNotesKey(profile) {
  const {_id, universityId} = profile ?? {};
  if (profile?.status !== 'active' || !Array.isArray(profile.activeRoles) ||
      !profile.activeRoles.includes('student') || typeof _id !== 'string' ||
      typeof universityId !== 'string' || !objectId.test(_id) || !objectId.test(universityId)) return null;
  return 'campusconnect:saved-notes:v1:' + universityId + ':' + _id;
}

export function readSavedNotes(key, storage) {
  if (!key) return [];
  try {
    const value = JSON.parse((storage ?? globalThis.localStorage)?.getItem(key) ?? '[]');
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter(id => typeof id === 'string' && objectId.test(id)))].slice(0, MAX_SAVED_NOTES);
  } catch { return []; }
}

export function writeSavedNotes(key, ids, storage) {
  if (!key) return false;
  try {
    const target = storage ?? globalThis.localStorage;
    if (!target) return false;
    target.setItem(key, JSON.stringify(ids));
    return true;
  } catch { return false; }
}

export function toggleSavedNote(ids, id) {
  if (typeof id !== 'string' || !objectId.test(id)) return ids;
  if (ids.includes(id)) return ids.filter(saved => saved !== id);
  return ids.length < MAX_SAVED_NOTES ? [id, ...ids] : ids;
}
