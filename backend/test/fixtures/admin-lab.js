// Test-only dependencies. Never import this module from the normal server.
import mongoose from 'mongoose';
import {MongoMemoryReplSet} from 'mongodb-memory-server';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createApp} from '../../src/app.js';
import {User} from '../../src/models/user.js';
import {Event, EventRegistration} from '../../src/models/campus-content.js';

const domain = 'campus.example.test';
const people = {
  admin: ['Test Admin', ['admin'], 'student', 'active', 'unverified'],
  student: ['Test Student', ['student'], 'student', 'active', 'unverified'],
  faculty: ['Test Faculty', ['faculty'], 'faculty', 'active', 'verified'],
  applicant: ['Test Faculty Applicant', [], 'faculty', 'pending', 'pending'],
};

export async function createAdminLab() {
  if (mongoose.connection.readyState !== 0) throw new Error('Admin Lab needs its own process.');
  const storage = await mkdtemp(path.join(tmpdir(), 'campusconnect-admin-lab-'));
  let db;
  const close = async () => {
    try {await mongoose.disconnect();}
    finally {
      try {await db?.stop();}
      finally {await rm(storage, {recursive: true, force: true});}
    }
  };

  try {
    // The fixture's port, database, and storage never come from the real app configuration.
    db = await MongoMemoryReplSet.create({
      binary: {version: '7.0.24'},
      replSet: {count: 1, ip: '127.0.0.1', storageEngine: 'wiredTiger'},
      instanceOpts: process.platform === 'win32' ? [] : [{args: ['--nounixsocket']}],
    });
    await mongoose.connect(db.getUri('campusconnect_admin_lab'), {autoIndex: true});
    await Promise.all(Object.values(mongoose.models).map(model => model.init()));

    const universityId = new mongoose.Types.ObjectId();
    const profiles = await User.create(Object.entries(people).map(([actor, p]) => ({
      universityId, firebaseUid: 'lab-' + actor, emailNormalized: actor + '@' + domain,
      emailVerifiedAt: new Date(), fullName: p[0], activeRoles: p[1], requestedRole: p[2],
      status: p[3], facultyVerificationStatus: p[4],
    })));
    const student = profiles.find(p => p.firebaseUid === 'lab-student');
    const faculty = profiles.find(p => p.firebaseUid === 'lab-faculty');
    const now = new Date();
    const event = await Event.create({
      universityId, organizerId: faculty._id, organizerType: 'faculty', title: 'Fictional campus workshop',
      description: 'Disposable example for testing the private event roster.', venue: 'Fictional auditorium',
      startsAt: new Date(+now + 172800000), endsAt: new Date(+now + 176400000),
      registrationOpensAt: new Date(+now - 3600000), registrationClosesAt: new Date(+now + 86400000),
      capacity: 5, confirmedCount: 1, status: 'published',
    });
    await EventRegistration.create({
      universityId, eventId: event._id, studentId: student._id,
      universityEmailNormalized: student.emailNormalized, studentNameSnapshot: student.fullName,
      status: 'confirmed', confirmedAt: now,
    });
    const claims = new Map(profiles.map(p => [p.firebaseUid, {
      uid: p.firebaseUid, email: p.emailNormalized, email_verified: true, emailVerified: true,
    }]));
    const firebaseAuth = {
      async verifyIdToken(token) {
        if (claims.has(token)) return claims.get(token);
        throw Object.assign(new Error('Unknown lab token'), {code: 'auth/invalid-id-token'});
      },
      async getUser(uid) {
        if (claims.has(uid)) return claims.get(uid);
        throw new Error('Unknown lab user');
      },
    };
    return {
      app: createApp({
        config: {nodeEnv: 'test', universityId: String(universityId), domains: [domain], corsOrigin: false,
          resourceUploadDir: path.join(storage, 'notes'), marketplaceUploadDir: path.join(storage, 'marketplace')},
        firebaseAuth,
      }),
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
