export type RegionalBranch =
  | 'San Francisco'
  | 'Sacramento'
  | 'Los Angeles'
  | 'Irvine'
  | 'San Diego';

export const REGIONAL_BRANCHES: RegionalBranch[] = [
  'San Francisco',
  'Sacramento',
  'Los Angeles',
  'Irvine',
  'San Diego',
];

export type UnionRole =
  | 'Administrative Staff'
  | 'Union Representative'
  | 'Unit Representative'
  | 'PPC Member';

export const UNION_ROLES: UnionRole[] = [
  'Administrative Staff',
  'Union Representative',
  'Unit Representative',
  'PPC Member',
];

export const CHECKIN_ROLES = [
  'Union Member (RN)',
  'Union Representative',
  'Unit Representative',
  'PPC Member',
  'Administrative Staff',
] as const;

export type CheckInRole = (typeof CHECKIN_ROLES)[number];

export const MEETING_TYPES = [
  'Union Rep Meeting',
  'PPC Members Meeting',
] as const;

export type MeetingType = (typeof MEETING_TYPES)[number];

export interface RolePermissions {
  canViewAllBranches: boolean;
  canExportPdf: boolean;
  canExportCsv: boolean;
  canRequestPasscode: boolean;
  canManageRbac: boolean;
  canManageVault: boolean;
  canViewAuditLog: boolean;
  canManageCloudBackups: boolean;
  canManageApiKeys: boolean;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: UnionRole;
  assignedBranches: RegionalBranch[];
  facility: string;
  active: boolean;
  lastActiveAt: string;
  canReceivePasscode: boolean;
}

export interface AttendanceRecord {
  id: string;
  name: string;
  phone: string;
  email: string;
  branch: RegionalBranch;
  unit: string;
  meetingTitle: string;
  memberRole: CheckInRole;
  checkedInAt: string; // ISO timestamp
  dateKey: string; // YYYY-MM-DD
  verificationHash: string;
  rememberedDevice: boolean;
}

export interface PasscodeDispatch {
  id: string;
  requestedByEmail: string;
  recipientName: string;
  recipientRole: UnionRole;
  branch: RegionalBranch | 'All Branches';
  passcode: string;
  dateKey: string;
  dispatchedAt: string;
  status: 'Dispatched' | 'Rejected';
  reason?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorName: string;
  actorEmail: string;
  actorRole: UnionRole | 'Member';
  branch: RegionalBranch | 'All Branches';
  action:
    | 'MEMBER_CHECKIN'
    | 'PASSCODE_REQUESTED'
    | 'PASSCODE_REJECTED'
    | 'REPORT_EXPORTED'
    | 'RBAC_UPDATED'
    | 'DOCUMENT_ENCRYPTED'
    | 'DOCUMENT_DECRYPTED'
    | 'DRIVE_BACKUP_SYNCED'
    | 'CLOUD_SYNC_EXECUTED'
    | 'API_KEY_CREATED'
    | 'API_KEY_REVOKED';
  resource: string;
  details: string;
  integrityHash: string;
}

export interface EncryptedDocument {
  id: string;
  title: string;
  category: 'Bargaining Minutes' | 'PPC Staffing Log' | 'Signed Roster' | 'Grievance Brief';
  branch: RegionalBranch;
  uploadedBy: string;
  uploadedAt: string;
  sizeBytes: number;
  algorithm: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256';
  saltB64: string;
  ivB64: string;
  ciphertextB64: string;
  checksumSha256: string;
}

export interface CloudConnector {
  id: string;
  provider: 'Google Drive' | 'Dropbox Enterprise' | 'Box Healthcare' | 'Microsoft OneDrive';
  accountLabel: string;
  targetPath: string;
  connected: boolean;
  autoSync: boolean;
  lastSyncedAt: string | null;
  encryptedAtRest: boolean;
  filesSynced: number;
}

export interface CloudBackupSnapshot {
  id: string;
  provider: CloudConnector['provider'];
  triggeredBy: string;
  branchScope: RegionalBranch | 'All Branches';
  recordCount: number;
  encryptedDocCount: number;
  sizeKb: number;
  createdAt: string;
  checksum: string;
  status: 'Completed' | 'Verified';
}

export interface ApiKeyRecord {
  id: string;
  label: string;
  prefix: string;
  tokenPreview: string;
  scopes: ('attendance:read' | 'attendance:write' | 'reports:read' | 'audit:read' | 'backups:sync')[];
  branchScope: RegionalBranch | 'All Branches';
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
  active: boolean;
}

export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  lastTriggeredAt: string | null;
}

export interface MemberCookieProfile {
  name: string;
  phone: string;
  email: string;
  branch: RegionalBranch;
  unit: string;
  meetingTitle: MeetingType;
  memberRole: CheckInRole;
  savedAt: string;
}

export interface ComplianceSummary {
  branch: RegionalBranch;
  checkedInToday: number;
  quorumTarget: number;
  quorumMet: boolean;
  compliancePercent: number;
  lastCheckInAt: string | null;
}
