const objectId = /^[a-f0-9]{24}$/;

export const groupId = group => JSON.stringify([group.term, group.program, group.semester, group.section]);

export function timetablePreferenceKey(profile) {
  const {universityId, _id} = profile ?? {};
  if (profile?.status !== 'active' || !Array.isArray(profile.activeRoles) || !profile.activeRoles.includes('student') ||
      typeof universityId !== 'string' || typeof _id !== 'string' ||
      !objectId.test(universityId) || !objectId.test(_id)) return null;
  return 'campusconnect:timetable:v1:' + universityId + ':' + _id;
}

export function readTimetablePreference(key, storage) {
  if (!key) return '';
  try {
    return (storage ?? globalThis.localStorage)?.getItem(key) ?? '';
  } catch {
    return '';
  }
}

export function saveTimetablePreference(key, group, storage) {
  if (!key) return;
  try {
    (storage ?? globalThis.localStorage)?.setItem(key, groupId(group));
  } catch {
    // The picker still works in this session if browser storage is unavailable.
  }
}

export function chooseTimetableGroup(groups, preferred) {
  return groups.find(group => groupId(group) === preferred) ?? groups[0] ?? null;
}
