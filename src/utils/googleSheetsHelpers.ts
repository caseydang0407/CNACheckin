import {
  AttendanceRecord,
  AuditLogEntry,
  CHECKIN_ROLES,
  CheckInRole,
  MEETING_TYPES,
  REGIONAL_BRANCHES,
  RegionalBranch,
  StaffMember,
} from '../types/union';

export const ATTENDANCE_SHEET_HEADERS = [
  'ID',
  'Date',
  'Checked In At',
  'Full Name',
  'Phone',
  'Email',
  'Regional Branch',
  'Nursing Unit',
  'Meeting Session',
  'Union Role',
  'Verification Hash',
] as const;

export function extractSpreadsheetId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }
  const cleanId = trimmed.replace(/[^a-zA-Z0-9-_]/g, '');
  return cleanId.length >= 16 ? cleanId : '';
}

export function formatAttendanceSheetRows(records: AttendanceRecord[]): string[][] {
  const rows: string[][] = [[...ATTENDANCE_SHEET_HEADERS]];
  for (const r of records) {
    rows.push([
      r.id,
      r.dateKey,
      r.checkedInAt,
      r.name,
      r.phone,
      r.email,
      r.branch,
      r.unit,
      r.meetingTitle,
      r.memberRole,
      r.verificationHash,
    ]);
  }
  return rows;
}

export function formatSingleAttendanceRow(r: AttendanceRecord): string[] {
  return [
    r.id,
    r.dateKey,
    r.checkedInAt,
    r.name,
    r.phone,
    r.email,
    r.branch,
    r.unit,
    r.meetingTitle,
    r.memberRole,
    r.verificationHash,
  ];
}

export function parseAttendanceSheetRows(values: string[][]): AttendanceRecord[] {
  if (!Array.isArray(values) || values.length === 0) return [];

  const firstRow = values[0].map((c) => String(c ?? '').trim().toLowerCase());
  const startIndex =
    firstRow.includes('full name') || firstRow.includes('email') || firstRow.includes('id') ? 1 : 0;

  const parsed: AttendanceRecord[] = [];
  for (let i = startIndex; i < values.length; i++) {
    const row = values[i];
    if (!row || row.length < 6) continue;
    const id = String(row[0] ?? '').trim() || `gs-${i}-${Date.now()}`;
    const dateKey = String(row[1] ?? '').trim() || new Date().toISOString().slice(0, 10);
    const checkedInAt = String(row[2] ?? '').trim() || `${dateKey}T12:00:00.000Z`;
    const name = String(row[3] ?? '').trim();
    const phone = String(row[4] ?? '').trim();
    const email = String(row[5] ?? '').trim();
    if (!name || !email) continue;

    const rawBranch = String(row[6] ?? '').trim() as RegionalBranch;
    const branch: RegionalBranch = REGIONAL_BRANCHES.includes(rawBranch)
      ? rawBranch
      : 'San Francisco';
    const unit = String(row[7] ?? '').trim() || 'General Nursing';
    const rawMeeting = String(row[8] ?? '').trim();
    const meetingTitle = (MEETING_TYPES as readonly string[]).includes(rawMeeting)
      ? rawMeeting
      : MEETING_TYPES[0];
    const rawRole = String(row[9] ?? '').trim() as CheckInRole;
    const memberRole: CheckInRole = CHECKIN_ROLES.includes(rawRole)
      ? rawRole
      : 'Union Member (RN)';
    const verificationHash = String(row[10] ?? '').trim() || `gs-${id}`;

    parsed.push({
      id,
      dateKey,
      checkedInAt,
      name,
      phone,
      email,
      branch,
      unit,
      meetingTitle,
      memberRole,
      verificationHash,
      rememberedDevice: false,
    });
  }
  return parsed;
}

export function formatStaffSheetRows(staff: StaffMember[]): string[][] {
  return [
    ['ID', 'Name', 'Email', 'Role', 'Assigned Branches', 'Facility', 'Active', 'Can Request Passcode'],
    ...staff.map((s) => [
      s.id,
      s.name,
      s.email,
      s.role,
      s.assignedBranches.join(', '),
      s.facility,
      s.active ? 'Yes' : 'No',
      s.canReceivePasscode ? 'Yes' : 'No',
    ]),
  ];
}

export function formatAuditSheetRows(logs: AuditLogEntry[]): string[][] {
  return [
    ['ID', 'Timestamp', 'Actor Name', 'Actor Email', 'Actor Role', 'Branch', 'Action', 'Resource', 'Details', 'Integrity Hash'],
    ...logs.map((l) => [
      l.id,
      l.timestamp,
      l.actorName,
      l.actorEmail,
      l.actorRole,
      l.branch,
      l.action,
      l.resource,
      l.details,
      l.integrityHash,
    ]),
  ];
}

export interface EffectiveIdentity {
  staffMember: StaffMember | null;
  actualStaffMember: StaffMember | null;
  isSignedIn: boolean;
  isAuthorizedStaff: boolean;
  isAdmin: boolean;
  isGuestMember: boolean;
  displayName: string;
  displayEmail: string;
  roleLabel: string;
}

export function resolveAuthenticatedStaff(params: {
  firebaseUser: {
    email?: string | null;
    emailVerified?: boolean | null;
    displayName?: string | null;
  } | null;
  staff: StaffMember[];
  previewStaffId?: string | null;
}): EffectiveIdentity {
  const { firebaseUser, staff, previewStaffId } = params;

  if (!firebaseUser || !firebaseUser.email || !firebaseUser.emailVerified) {
    return {
      staffMember: null,
      actualStaffMember: null,
      isSignedIn: false,
      isAuthorizedStaff: false,
      isAdmin: false,
      isGuestMember: true,
      displayName: 'Meeting Attendee',
      displayEmail: '',
      roleLabel: 'Check-In Kiosk',
    };
  }

  const normalizedEmail = firebaseUser.email.trim().toLowerCase();
  const matched =
    staff.find((s) => s.active && s.email.trim().toLowerCase() === normalizedEmail) ?? null;

  if (!matched) {
    return {
      staffMember: null,
      actualStaffMember: null,
      isSignedIn: true,
      isAuthorizedStaff: false,
      isAdmin: false,
      isGuestMember: true,
      displayName: firebaseUser.displayName || firebaseUser.email,
      displayEmail: firebaseUser.email,
      roleLabel: 'Union Member (Check-In Only)',
    };
  }

  const isAdmin = matched.role === 'Administrative Staff';
  const previewTarget =
    isAdmin && previewStaffId ? staff.find((s) => s.id === previewStaffId) ?? matched : matched;

  return {
    staffMember: previewTarget,
    actualStaffMember: matched,
    isSignedIn: true,
    isAuthorizedStaff: true,
    isAdmin,
    isGuestMember: false,
    displayName:
      previewTarget.id === matched.id
        ? firebaseUser.displayName || matched.name
        : previewTarget.name,
    displayEmail: previewTarget.email,
    roleLabel: previewTarget.role,
  };
}
