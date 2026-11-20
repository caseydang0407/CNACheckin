import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAccessBranch,
  computeBranchCompliance,
  filterAttendanceForUser,
  formatPhoneDisplay,
  generateDailyPasscode,
  getAccessibleBranches,
  getPermissionsForRole,
  validatePasscodeFormat,
} from './rbac';
import { AttendanceRecord, StaffMember } from '../types/union';

const adminUser: StaffMember = {
  id: 'u1',
  name: 'Elena Vance',
  email: 'elena@calnurses.org',
  role: 'Administrative Staff',
  assignedBranches: ['San Francisco'],
  facility: 'CNA State Headquarters',
  active: true,
  lastActiveAt: '2026-11-20T08:00:00Z',
  canReceivePasscode: true,
};

const irvineUnitRep: StaffMember = {
  id: 'u2',
  name: 'Marcus Chen',
  email: 'mchen@calnurses.org',
  role: 'Unit Representative',
  assignedBranches: ['Irvine'],
  facility: 'UCI Medical Center',
  active: true,
  lastActiveAt: '2026-11-20T08:15:00Z',
  canReceivePasscode: false,
};

const sampleRecords: AttendanceRecord[] = [
  {
    id: 'a1',
    name: 'Sofia Alvarez, RN',
    phone: '4155550101',
    email: 'sofia@nurse.org',
    branch: 'San Francisco',
    unit: 'ICU',
    meetingTitle: 'Union Rep Meeting',
    memberRole: 'Union Member (RN)',
    checkedInAt: '2026-11-20T08:10:00Z',
    dateKey: '2026-11-20',
    verificationHash: 'hash-1',
    rememberedDevice: true,
  },
  {
    id: 'a2',
    name: 'Devon Brooks, RN',
    phone: '9495550199',
    email: 'devon@nurse.org',
    branch: 'Irvine',
    unit: 'Emergency',
    meetingTitle: 'PPC Members Meeting',
    memberRole: 'Unit Representative',
    checkedInAt: '2026-11-20T08:25:00Z',
    dateKey: '2026-11-20',
    verificationHash: 'hash-2',
    rememberedDevice: false,
  },
];

test('Administrative Staff can access all 5 branches and manage RBAC', () => {
  const perms = getPermissionsForRole('Administrative Staff');
  assert.equal(perms.canViewAllBranches, true);
  assert.equal(perms.canManageRbac, true);
  assert.equal(getAccessibleBranches(adminUser).length, 5);
  assert.equal(canAccessBranch(adminUser, 'San Diego'), true);
});

test('Unit Representative is segregated to assigned branch only', () => {
  const perms = getPermissionsForRole('Unit Representative');
  assert.equal(perms.canViewAllBranches, false);
  assert.equal(perms.canManageRbac, false);
  assert.deepEqual(getAccessibleBranches(irvineUnitRep), ['Irvine']);
  assert.equal(canAccessBranch(irvineUnitRep, 'San Francisco'), false);
  assert.equal(canAccessBranch(irvineUnitRep, 'Irvine'), true);

  const visible = filterAttendanceForUser(sampleRecords, irvineUnitRep, {
    branch: 'All Branches',
    dateKey: '2026-11-20',
  });
  assert.equal(visible.length, 1);
  assert.equal(visible[0].branch, 'Irvine');
});

test('Daily passcode generation is deterministic 6-digit code per date', () => {
  const codeA = generateDailyPasscode('2026-11-20');
  const codeB = generateDailyPasscode('2026-11-20');
  const codeNext = generateDailyPasscode('2026-11-21');
  assert.equal(codeA, codeB);
  assert.notEqual(codeA, codeNext);
  assert.equal(validatePasscodeFormat(codeA), true);
  assert.equal(validatePasscodeFormat('12ab'), false);
});

test('Compliance computation aggregates branch totals accurately', () => {
  const summary = computeBranchCompliance(sampleRecords, '2026-11-20', ['San Francisco', 'Irvine']);
  assert.equal(summary[0].branch, 'San Francisco');
  assert.equal(summary[0].checkedInToday, 1);
  assert.equal(summary[1].branch, 'Irvine');
  assert.equal(summary[1].checkedInToday, 1);
  assert.equal(summary[1].compliancePercent, 5);
});

test('Phone formatter normalizes 10-digit US numbers', () => {
  assert.equal(formatPhoneDisplay('4155550101'), '(415) 555-0101');
});
