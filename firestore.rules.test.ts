import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CHECKIN_ROLES, MEETING_TYPES, REGIONAL_BRANCHES } from './src/types/union';

const rulesSource = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');
const blueprint = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-blueprint.json'), 'utf8'));

function validateAttendancePayload(
  payload: Record<string, unknown>,
  serverPasscode: string
): { allowed: boolean; reason?: string } {
  const required = blueprint.entities.AttendanceRecord.required as string[];
  const keys = Object.keys(payload);
  if (!required.every((k) => keys.includes(k))) {
    return { allowed: false, reason: 'Missing required fields' };
  }
  if (!keys.every((k) => required.includes(k))) {
    return { allowed: false, reason: 'Shadow/ghost field rejected' };
  }
  if (typeof payload.id !== 'string' || !/^[a-zA-Z0-9_-]{2,128}$/.test(payload.id)) {
    return { allowed: false, reason: 'Invalid document ID' };
  }
  if (typeof payload.name !== 'string' || payload.name.length < 2 || payload.name.length > 120) {
    return { allowed: false, reason: 'Invalid name length' };
  }
  if (!REGIONAL_BRANCHES.includes(payload.branch as (typeof REGIONAL_BRANCHES)[number])) {
    return { allowed: false, reason: 'Invalid branch' };
  }
  if (!MEETING_TYPES.includes(payload.meetingTitle as (typeof MEETING_TYPES)[number])) {
    return { allowed: false, reason: 'Invalid meetingTitle' };
  }
  if (!CHECKIN_ROLES.includes(payload.memberRole as (typeof CHECKIN_ROLES)[number])) {
    return { allowed: false, reason: 'Invalid memberRole' };
  }
  if (
    !Array.isArray(payload.authorizedEmails) ||
    payload.authorizedEmails.length < 1 ||
    payload.authorizedEmails.length > 25 ||
    typeof payload.authorizedEmails[0] !== 'string'
  ) {
    return { allowed: false, reason: 'Invalid authorizedEmails array' };
  }
  if (payload.verificationPasscode !== serverPasscode) {
    return { allowed: false, reason: 'Daily passcode mismatch' };
  }
  return { allowed: true };
}

test('firestore.rules includes default-deny net, verified email gate, and all blueprint collections', () => {
  assert.ok(rulesSource.includes('allow read, write: if false;'));
  assert.ok(rulesSource.includes('request.auth.token.email_verified == true'));
  const collectionNames = [
    'staff',
    'daily_passcodes',
    'attendance',
    'passcode_dispatches',
    'audit_logs',
    'encrypted_documents',
    'cloud_connectors',
    'backup_snapshots',
    'api_keys',
    'webhooks',
  ];
  for (const name of collectionNames) {
    assert.ok(rulesSource.includes(`match /${name}/`), `Missing match block for ${name}`);
  }
  assert.ok(
    rulesSource.includes("'name', 'email', 'facility', 'role', 'assignedBranches'"),
    'Staff update rule must permit editing name, email, facility, role, and assignedBranches'
  );
  assert.ok(
    rulesSource.includes('allow delete: if isValidId(staffId) && isBootstrappedAdmin();'),
    'Staff delete rule must be gated by bootstrapped admin'
  );
  assert.ok(
    rulesSource.includes('allow delete: if isValidId(recordId) && isBootstrappedAdmin();'),
    'Attendance delete rule must be gated by bootstrapped admin'
  );
});

test('Dirty Dozen adversarial attendance payloads are rejected', () => {
  const validPayload = {
    id: 'att-valid-1',
    name: 'Sofia Alvarez, RN',
    phone: '4155550142',
    email: 'salvarez@ucsf.edu',
    branch: 'San Francisco',
    unit: 'Adult ICU',
    meetingTitle: 'Union Rep Meeting',
    memberRole: 'Union Member (RN)',
    checkedInAt: '2026-11-20T10:00:00Z',
    dateKey: '2026-11-20',
    verificationHash: 'abc123456789',
    rememberedDevice: true,
    verificationPasscode: '482910',
    authorizedEmails: ['caseydang0407@gmail.com'],
    createdAt: { serverTimestamp: true },
  };

  assert.equal(validateAttendancePayload(validPayload, '482910').allowed, true);
  assert.equal(
    validateAttendancePayload({ ...validPayload, verificationPasscode: '000000' }, '482910').allowed,
    false
  );
  assert.equal(
    validateAttendancePayload({ ...validPayload, isVerifiedAdmin: true }, '482910').allowed,
    false
  );
  assert.equal(
    validateAttendancePayload({ ...validPayload, meetingTitle: 'Unauthorized Session' }, '482910')
      .allowed,
    false
  );
  assert.equal(
    validateAttendancePayload({ ...validPayload, id: '../admin' }, '482910').allowed,
    false
  );
  assert.equal(
    validateAttendancePayload({ ...validPayload, name: 'x'.repeat(200) }, '482910').allowed,
    false
  );
  assert.equal(
    validateAttendancePayload({ ...validPayload, authorizedEmails: [] }, '482910').allowed,
    false
  );
});
