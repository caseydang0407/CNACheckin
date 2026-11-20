import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractSpreadsheetId,
  formatAttendanceSheetRows,
  parseAttendanceSheetRows,
  resolveAuthenticatedStaff,
} from './googleSheetsHelpers';
import { AttendanceRecord, StaffMember } from '../types/union';

const SAMPLE_STAFF: StaffMember[] = [
  {
    id: 'staff-1',
    name: 'Elena Vance, RN',
    email: 'caseydang0407@gmail.com',
    role: 'Administrative Staff',
    assignedBranches: ['San Francisco', 'Sacramento', 'Los Angeles', 'Irvine', 'San Diego'],
    facility: 'CNA Statewide Operations',
    active: true,
    lastActiveAt: '2026-11-20T10:00:00.000Z',
    canReceivePasscode: true,
  },
  {
    id: 'staff-3',
    name: 'David Park, RN',
    email: 'dpark@calnurses.org',
    role: 'Union Representative',
    assignedBranches: ['San Francisco', 'Sacramento'],
    facility: 'UCSF Parnassus',
    active: true,
    lastActiveAt: '2026-11-20T10:00:00.000Z',
    canReceivePasscode: true,
  },
  {
    id: 'staff-5',
    name: 'Marcus Chen, RN',
    email: 'mchen@calnurses.org',
    role: 'Unit Representative',
    assignedBranches: ['Irvine'],
    facility: 'UCI Medical Center',
    active: true,
    lastActiveAt: '2026-11-20T10:00:00.000Z',
    canReceivePasscode: false,
  },
];

test('extractSpreadsheetId parses both full Google Sheets URLs and raw IDs', () => {
  assert.equal(
    extractSpreadsheetId(
      'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0'
    ),
    '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
  );
  assert.equal(
    extractSpreadsheetId('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'),
    '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
  );
  assert.equal(extractSpreadsheetId('short'), '');
});

test('formatAttendanceSheetRows and parseAttendanceSheetRows roundtrip attendance cleanly', () => {
  const sample: AttendanceRecord[] = [
    {
      id: 'att-99',
      dateKey: '2026-11-20',
      checkedInAt: '2026-11-20T17:15:00.000Z',
      name: 'Sofia Alvarez, RN',
      phone: '4155550142',
      email: 'salvarez.rn@ucsf.edu',
      branch: 'San Francisco',
      unit: 'Adult ICU',
      meetingTitle: 'PPC Members Meeting',
      memberRole: 'PPC Member',
      verificationHash: 'abc12345def67890',
      rememberedDevice: true,
    },
  ];
  const rows = formatAttendanceSheetRows(sample);
  assert.equal(rows.length, 2);
  const parsed = parseAttendanceSheetRows(rows);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].name, 'Sofia Alvarez, RN');
  assert.equal(parsed[0].meetingTitle, 'PPC Members Meeting');
  assert.equal(parsed[0].branch, 'San Francisco');
  assert.equal(parsed[0].memberRole, 'PPC Member');
});

test('resolveAuthenticatedStaff never falls back to Elena Vance for visitors or non-staff members', () => {
  const unauth = resolveAuthenticatedStaff({ firebaseUser: null, staff: SAMPLE_STAFF });
  assert.equal(unauth.isSignedIn, false);
  assert.equal(unauth.isAuthorizedStaff, false);
  assert.equal(unauth.staffMember, null);
  assert.equal(unauth.roleLabel, 'Check-In Kiosk');

  const nurseMember = resolveAuthenticatedStaff({
    firebaseUser: {
      email: 'nurse.member@hospital.org',
      emailVerified: true,
      displayName: 'Nurse Member',
    },
    staff: SAMPLE_STAFF,
  });
  assert.equal(nurseMember.isSignedIn, true);
  assert.equal(nurseMember.isAuthorizedStaff, false);
  assert.equal(nurseMember.isAdmin, false);
  assert.equal(nurseMember.staffMember, null);
  assert.equal(nurseMember.roleLabel, 'Union Member (Check-In Only)');
});

test('resolveAuthenticatedStaff enforces exact role for staff and isolates preview to admins', () => {
  const unitRep = resolveAuthenticatedStaff({
    firebaseUser: {
      email: 'mchen@calnurses.org',
      emailVerified: true,
      displayName: 'Marcus Chen, RN',
    },
    staff: SAMPLE_STAFF,
    previewStaffId: 'staff-1', // Non-admin must NOT be allowed to preview Admin
  });
  assert.equal(unitRep.isAuthorizedStaff, true);
  assert.equal(unitRep.isAdmin, false);
  assert.equal(unitRep.staffMember?.id, 'staff-5');
  assert.equal(unitRep.roleLabel, 'Unit Representative');

  const adminPreviewing = resolveAuthenticatedStaff({
    firebaseUser: {
      email: 'caseydang0407@gmail.com',
      emailVerified: true,
      displayName: 'Casey Dang',
    },
    staff: SAMPLE_STAFF,
    previewStaffId: 'staff-3',
  });
  assert.equal(adminPreviewing.isAdmin, true);
  assert.equal(adminPreviewing.actualStaffMember?.id, 'staff-1');
  assert.equal(adminPreviewing.staffMember?.id, 'staff-3');
  assert.equal(adminPreviewing.roleLabel, 'Union Representative');
});
