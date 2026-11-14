import React from 'react';
import {createRoot} from 'react-dom/client';
import CampusWorkspace from '../../src/CampusWorkspace.jsx';

const actor = new URLSearchParams(location.search).get('actor');
const profiles = {
  a: {fullName: 'Fixture Student A', emailNormalized: 'student-a@campus.example', activeRoles: ['student']},
  b: {fullName: 'Fixture Student B', emailNormalized: 'student-b@campus.example', activeRoles: ['student']},
  organizer: {
    fullName: 'Fixture Organizer', emailNormalized: 'organizer@campus.example',
    activeRoles: ['faculty'], facultyVerificationStatus: 'verified',
  },
};
if (!Object.hasOwn(profiles, actor)) throw new Error('Unknown test persona');
const profile = {status: 'active', ...profiles[actor]};

createRoot(document.getElementById('root')).render(
  <CampusWorkspace user={{getIdToken: async () => 'fixture-' + actor}} profile={profile} />,
);
