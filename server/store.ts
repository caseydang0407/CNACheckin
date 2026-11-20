import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  ApiKeyRecord,
  AttendanceRecord,
  AuditLogEntry,
  CHECKIN_ROLES,
  CheckInRole,
  CloudBackupSnapshot,
  CloudConnector,
  EncryptedDocument,
  MEETING_TYPES,
  PasscodeDispatch,
  REGIONAL_BRANCHES,
  RegionalBranch,
  StaffMember,
  UnionRole,
  WebhookConfig,
} from '../src/types/union';
import { generateDailyPasscode } from '../src/utils/rbac';

export interface StoreState {
  staff: StaffMember[];
  attendance: AttendanceRecord[];
  passcodeDispatches: PasscodeDispatch[];
  auditLogs: AuditLogEntry[];
  documents: EncryptedDocument[];
  cloudConnectors: CloudConnector[];
  backupSnapshots: CloudBackupSnapshot[];
  apiKeys: ApiKeyRecord[];
  webhooks: WebhookConfig[];
}

export function getTodayDateKey(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function makeHash(seed: string): string {
  return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16);
}

function createPreEncryptedDoc(params: {
  id: string;
  title: string;
  category: EncryptedDocument['category'];
  branch: RegionalBranch;
  uploadedBy: string;
  uploadedAt: string;
  plaintext: string;
  passphrase: string;
}): EncryptedDocument {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(params.passphrase, salt, 100000, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(params.plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Web Crypto AES-GCM concatenates ciphertext + 16-byte authTag
  const combined = Buffer.concat([encrypted, authTag]);
  const ciphertextB64 = combined.toString('base64');
  const checksumSha256 = crypto.createHash('sha256').update(ciphertextB64).digest('hex');

  return {
    id: params.id,
    title: params.title,
    category: params.category,
    branch: params.branch,
    uploadedBy: params.uploadedBy,
    uploadedAt: params.uploadedAt,
    sizeBytes: Buffer.byteLength(params.plaintext, 'utf8'),
    algorithm: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    saltB64: salt.toString('base64'),
    ivB64: iv.toString('base64'),
    ciphertextB64,
    checksumSha256,
  };
}

function createInitialState(): StoreState {
  const today = getTodayDateKey();
  const yesterdayDate = new Date(Date.now() - 86400000);
  const yesterday = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, '0')}-${String(yesterdayDate.getDate()).padStart(2, '0')}`;
  const todayPasscode = generateDailyPasscode(today);

  const staff: StaffMember[] = [
    {
      id: 'staff-1',
      name: 'Elena Vance, RN',
      email: 'caseydang0407@gmail.com',
      role: 'Administrative Staff',
      assignedBranches: [...REGIONAL_BRANCHES],
      facility: 'CNA Statewide Operations',
      active: true,
      lastActiveAt: new Date(Date.now() - 12 * 60000).toISOString(),
      canReceivePasscode: true,
    },
    {
      id: 'staff-2',
      name: 'Sandra Morales, RN',
      email: 'organizer@calnurses.org',
      role: 'Administrative Staff',
      assignedBranches: [...REGIONAL_BRANCHES],
      facility: 'CNA Oakland HQ',
      active: true,
      lastActiveAt: new Date(Date.now() - 25 * 60000).toISOString(),
      canReceivePasscode: true,
    },
    {
      id: 'staff-3',
      name: 'David Park, RN',
      email: 'dpark@calnurses.org',
      role: 'Union Representative',
      assignedBranches: ['San Francisco', 'Sacramento'],
      facility: 'UCSF Parnassus & UC Davis',
      active: true,
      lastActiveAt: new Date(Date.now() - 40 * 60000).toISOString(),
      canReceivePasscode: true,
    },
    {
      id: 'staff-4',
      name: 'Camila Reyes, RN',
      email: 'creyes@calnurses.org',
      role: 'Union Representative',
      assignedBranches: ['Los Angeles', 'San Diego'],
      facility: 'Kaiser Sunset & UCSD',
      active: true,
      lastActiveAt: new Date(Date.now() - 55 * 60000).toISOString(),
      canReceivePasscode: true,
    },
    {
      id: 'staff-5',
      name: 'Marcus Chen, RN',
      email: 'mchen@calnurses.org',
      role: 'Unit Representative',
      assignedBranches: ['Irvine'],
      facility: 'UCI Medical Center Orange',
      active: true,
      lastActiveAt: new Date(Date.now() - 90 * 60000).toISOString(),
      canReceivePasscode: false,
    },
    {
      id: 'staff-6',
      name: 'Dr. Priya Nair, MSN, RN',
      email: 'pnair@calnurses.org',
      role: 'PPC Member',
      assignedBranches: ['San Francisco', 'Los Angeles'],
      facility: 'Professional Practice Committee',
      active: true,
      lastActiveAt: new Date(Date.now() - 110 * 60000).toISOString(),
      canReceivePasscode: false,
    },
  ];

  const seedMembers: Array<{
    name: string;
    phone: string;
    email: string;
    branch: RegionalBranch;
    unit: string;
    minutesAgo: number;
    dateKey?: string;
  }> = [
    { name: 'Sofia Alvarez, RN', phone: '4155550142', email: 'salvarez.rn@ucsf.edu', branch: 'San Francisco', unit: 'Adult ICU', minutesAgo: 18 },
    { name: 'Liam O’Connor, RN', phone: '4155550188', email: 'loconnor@sfgh.org', branch: 'San Francisco', unit: 'Emergency Dept', minutesAgo: 32 },
    { name: 'Mei-Ling Zhou, RN', phone: '4155550174', email: 'mzhou@cpmc.org', branch: 'San Francisco', unit: 'Labor & Delivery', minutesAgo: 47 },
    { name: 'Jordan Washington, RN', phone: '4155550119', email: 'jwashington@kaiser-sf.org', branch: 'San Francisco', unit: 'Telemetry', minutesAgo: 61 },
    { name: 'Hannah Kim, RN', phone: '9165550134', email: 'hkim@ucdavis.edu', branch: 'Sacramento', unit: 'Pediatric ICU', minutesAgo: 22 },
    { name: 'Carlos Mendoza, RN', phone: '9165550165', email: 'cmendoza@sutter-sac.org', branch: 'Sacramento', unit: 'Cardiology', minutesAgo: 51 },
    { name: 'Tessa Patel, RN', phone: '9165550192', email: 'tpatel@dignity-sac.org', branch: 'Sacramento', unit: 'Med-Surg 4N', minutesAgo: 74 },
    { name: 'Mateo Rivera, RN', phone: '2135550120', email: 'mrivera@lacusc.org', branch: 'Los Angeles', unit: 'Trauma ICU', minutesAgo: 14 },
    { name: 'Amara Okafor, RN', phone: '3105550155', email: 'aokafor@uclahealth.org', branch: 'Los Angeles', unit: 'Oncology', minutesAgo: 29 },
    { name: 'Rachel Goldstein, RN', phone: '3235550183', email: 'rgoldstein@cedars.org', branch: 'Los Angeles', unit: 'NICU', minutesAgo: 44 },
    { name: 'Kevin Nguyen, RN', phone: '2135550177', email: 'knguyen@kaiser-la.org', branch: 'Los Angeles', unit: 'OR / Perioperative', minutesAgo: 68 },
    { name: 'Natalie Brooks, RN', phone: '9495550111', email: 'nbrooks@uci.edu', branch: 'Irvine', unit: 'Emergency Dept', minutesAgo: 26 },
    { name: 'Trevor Jenkins, RN', phone: '9495550148', email: 'tjenkins@hoag-irvine.org', branch: 'Irvine', unit: 'Orthopedics', minutesAgo: 53 },
    { name: 'Brianna Torres, RN', phone: '6195550160', email: 'btorres@ucsd.edu', branch: 'San Diego', unit: 'Surgical ICU', minutesAgo: 19 },
    { name: 'Samuel Adeyemi, RN', phone: '8585550190', email: 'sadeyemi@scripps.org', branch: 'San Diego', unit: 'Emergency Dept', minutesAgo: 41 },
    { name: 'Grace Gallagher, RN', phone: '6195550127', email: 'ggallagher@sharp.com', branch: 'San Diego', unit: 'Rehabilitation', minutesAgo: 85 },
    { name: 'Victor Morales, RN', phone: '4155550109', email: 'vmorales@ucsf.edu', branch: 'San Francisco', unit: 'Oncology', minutesAgo: 1440, dateKey: yesterday },
    { name: 'Chloe Bennett, RN', phone: '2135550144', email: 'cbennett@uclahealth.org', branch: 'Los Angeles', unit: 'Med-Surg', minutesAgo: 1480, dateKey: yesterday },
  ];

  const attendance: AttendanceRecord[] = seedMembers.map((m, idx) => {
    const ts = new Date(Date.now() - m.minutesAgo * 60000).toISOString();
    const dateKey = m.dateKey ?? today;
    const roleOptions: CheckInRole[] = [
      'Union Member (RN)',
      'Union Member (RN)',
      'Unit Representative',
      'PPC Member',
      'Union Representative',
    ];
    return {
      id: `att-${idx + 1}`,
      name: m.name,
      phone: m.phone,
      email: m.email,
      branch: m.branch,
      unit: m.unit,
      meetingTitle: MEETING_TYPES[idx % MEETING_TYPES.length],
      memberRole: roleOptions[idx % roleOptions.length],
      checkedInAt: ts,
      dateKey,
      verificationHash: makeHash(`${m.email}:${dateKey}:${idx}`),
      rememberedDevice: idx % 2 === 0,
    };
  });

  const passcodeDispatches: PasscodeDispatch[] = [
    {
      id: 'pc-1',
      requestedByEmail: 'caseydang0407@gmail.com',
      recipientName: 'Elena Vance, RN',
      recipientRole: 'Administrative Staff',
      branch: 'All Branches',
      passcode: todayPasscode,
      dateKey: today,
      dispatchedAt: new Date(Date.now() - 95 * 60000).toISOString(),
      status: 'Dispatched',
    },
  ];

  const auditLogs: AuditLogEntry[] = [
    {
      id: 'aud-1',
      timestamp: new Date(Date.now() - 95 * 60000).toISOString(),
      actorName: 'Elena Vance, RN',
      actorEmail: 'caseydang0407@gmail.com',
      actorRole: 'Administrative Staff',
      branch: 'All Branches',
      action: 'PASSCODE_REQUESTED',
      resource: `Daily Passcode (${today})`,
      details: 'Authorized email verified; 6-digit meeting passcode dispatched via encrypted mail relay.',
      integrityHash: makeHash(`aud-1:${today}`),
    },
    {
      id: 'aud-2',
      timestamp: new Date(Date.now() - 48 * 60000).toISOString(),
      actorName: 'David Park, RN',
      actorEmail: 'dpark@calnurses.org',
      actorRole: 'Union Representative',
      branch: 'San Francisco',
      action: 'DOCUMENT_ENCRYPTED',
      resource: 'SF Bay Area Safe Staffing Ratios Brief',
      details: 'Client-side AES-256-GCM encryption completed with PBKDF2-SHA256 key derivation.',
      integrityHash: makeHash(`aud-2:${today}`),
    },
    {
      id: 'aud-3',
      timestamp: new Date(Date.now() - 30 * 60000).toISOString(),
      actorName: 'Elena Vance, RN',
      actorEmail: 'caseydang0407@gmail.com',
      actorRole: 'Administrative Staff',
      branch: 'All Branches',
      action: 'DRIVE_BACKUP_SYNCED',
      resource: '/CNA-Union-Backups/Statewide-Snapshot',
      details: 'Automated encrypted archive pushed to Google Drive (caseydang0407@gmail.com).',
      integrityHash: makeHash(`aud-3:${today}`),
    },
    {
      id: 'aud-4',
      timestamp: new Date(Date.now() - 14 * 60000).toISOString(),
      actorName: 'Mateo Rivera, RN',
      actorEmail: 'mrivera@lacusc.org',
      actorRole: 'Member',
      branch: 'Los Angeles',
      action: 'MEMBER_CHECKIN',
      resource: 'Los Angeles Chapter Assembly',
      details: 'In-person meeting check-in logged with verified daily passcode (no check-out required).',
      integrityHash: makeHash(`aud-4:${today}`),
    },
  ];

  const documents: EncryptedDocument[] = [
    createPreEncryptedDoc({
      id: 'doc-1',
      title: 'SF Bay Area Safe Staffing Ratios Brief (Q4)',
      category: 'PPC Staffing Log',
      branch: 'San Francisco',
      uploadedBy: 'David Park, RN',
      uploadedAt: new Date(Date.now() - 48 * 60000).toISOString(),
      plaintext:
        'CALIFORNIA NURSES ASSOCIATION — PPC STAFFING COMPLIANCE BRIEF\nBranch: San Francisco\nSummary: Title 22 nurse-to-patient ratio verification across Adult ICU (1:2), Telemetry (1:4), and Emergency Dept triage bays. All unit reps confirmed active break relief coverage for November.',
      passphrase: 'cna-vault-2026',
    }),
    createPreEncryptedDoc({
      id: 'doc-2',
      title: 'Los Angeles Bargaining Caucus Minutes',
      category: 'Bargaining Minutes',
      branch: 'Los Angeles',
      uploadedBy: 'Camila Reyes, RN',
      uploadedAt: new Date(Date.now() - 120 * 60000).toISOString(),
      plaintext:
        'CNA LOS ANGELES BARGAINING COMMITTEE — EXECUTIVE SESSION\nAgenda: Workplace Violence Prevention Protocols & Shift Differential Parity.\nAction Item: Collect signed petitions at next general membership assembly; store roster PDFs in encrypted Drive vault.',
      passphrase: 'cna-vault-2026',
    }),
  ];

  const cloudConnectors: CloudConnector[] = [
    {
      id: 'conn-gdrive',
      provider: 'Google Drive',
      accountLabel: 'caseydang0407@gmail.com',
      targetPath: '/CNA-Union-Backups/All-Branches',
      connected: true,
      autoSync: true,
      lastSyncedAt: new Date(Date.now() - 30 * 60000).toISOString(),
      encryptedAtRest: true,
      filesSynced: 18,
    },
    {
      id: 'conn-dropbox',
      provider: 'Dropbox Enterprise',
      accountLabel: 'cna-compliance-vault@calnurses.org',
      targetPath: '/Union-Compliance/Regional-Rosters',
      connected: true,
      autoSync: false,
      lastSyncedAt: new Date(Date.now() - 240 * 60000).toISOString(),
      encryptedAtRest: true,
      filesSynced: 12,
    },
    {
      id: 'conn-box',
      provider: 'Box Healthcare',
      accountLabel: 'ppc-records@calnurses.org',
      targetPath: '/PPC-Confidential/Staffing-Logs',
      connected: false,
      autoSync: false,
      lastSyncedAt: null,
      encryptedAtRest: true,
      filesSynced: 0,
    },
    {
      id: 'conn-onedrive',
      provider: 'Microsoft OneDrive',
      accountLabel: 'chapter-ops@calnurses.org',
      targetPath: '/SharePoint/CNA-Chapters',
      connected: false,
      autoSync: false,
      lastSyncedAt: null,
      encryptedAtRest: true,
      filesSynced: 0,
    },
  ];

  const backupSnapshots: CloudBackupSnapshot[] = [
    {
      id: 'snap-1',
      provider: 'Google Drive',
      triggeredBy: 'Elena Vance, RN',
      branchScope: 'All Branches',
      recordCount: attendance.length,
      encryptedDocCount: 2,
      sizeKb: 148,
      createdAt: new Date(Date.now() - 30 * 60000).toISOString(),
      checksum: makeHash(`snap-1:${today}`),
      status: 'Verified',
    },
  ];

  const apiKeys: ApiKeyRecord[] = [
    {
      id: 'key-1',
      label: 'Statewide Payroll & Membership Sync',
      prefix: 'cna_live_84f2',
      tokenPreview: 'cna_live_84f2••••••••••••••••9a1c',
      scopes: ['attendance:read', 'reports:read', 'audit:read'],
      branchScope: 'All Branches',
      createdBy: 'Elena Vance, RN',
      createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
      lastUsedAt: new Date(Date.now() - 35 * 60000).toISOString(),
      active: true,
    },
    {
      id: 'key-2',
      label: 'Google Apps Script Backup Runner',
      prefix: 'cna_sync_31d9',
      tokenPreview: 'cna_sync_31d9••••••••••••••••4e0b',
      scopes: ['attendance:read', 'backups:sync'],
      branchScope: 'All Branches',
      createdBy: 'Sandra Morales, RN',
      createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      lastUsedAt: new Date(Date.now() - 30 * 60000).toISOString(),
      active: true,
    },
  ];

  const webhooks: WebhookConfig[] = [
    {
      id: 'wh-1',
      name: 'Slack #chapter-quorum-alerts',
      url: 'https://hooks.calnurses.internal/services/quorum-notify',
      events: ['attendance.checkin', 'compliance.quorum_met'],
      active: true,
      lastTriggeredAt: new Date(Date.now() - 18 * 60000).toISOString(),
    },
    {
      id: 'wh-2',
      name: 'Google Drive Nightly Compliance Mirror',
      url: 'https://sync.calnurses.internal/webhooks/drive-backup',
      events: ['backup.completed', 'document.encrypted'],
      active: true,
      lastTriggeredAt: new Date(Date.now() - 30 * 60000).toISOString(),
    },
  ];

  return {
    staff,
    attendance,
    passcodeDispatches,
    auditLogs,
    documents,
    cloudConnectors,
    backupSnapshots,
    apiKeys,
    webhooks,
  };
}

const STORE_FILE = path.join(process.cwd(), '.cna-store.json');

class UnionStore {
  private state: StoreState;
  private listeners: Set<(event: { type: string; payload: unknown }) => void> = new Set();

  constructor() {
    this.state = this.loadFromDisk();
  }

  private loadFromDisk(): StoreState {
    try {
      if (fs.existsSync(STORE_FILE)) {
        const raw = fs.readFileSync(STORE_FILE, 'utf8');
        const parsed = JSON.parse(raw) as StoreState;
        if (parsed && Array.isArray(parsed.staff) && Array.isArray(parsed.attendance)) {
          parsed.attendance = parsed.attendance.map((rec, idx) => ({
            ...rec,
            meetingTitle: (MEETING_TYPES as readonly string[]).includes(rec.meetingTitle)
              ? rec.meetingTitle
              : MEETING_TYPES[idx % MEETING_TYPES.length],
          }));
          return parsed;
        }
      }
    } catch {
      // fall through to fresh seed
    }
    const fresh = createInitialState();
    this.saveToDisk(fresh);
    return fresh;
  }

  private saveToDisk(state: StoreState): void {
    try {
      fs.writeFileSync(STORE_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch {
      // non-fatal if disk is read-only
    }
  }

  public subscribe(fn: (event: { type: string; payload: unknown }) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private broadcast(type: string, payload: unknown): void {
    for (const fn of this.listeners) {
      fn({ type, payload });
    }
  }

  public getState(): StoreState {
    return this.state;
  }

  public appendAudit(entry: Omit<AuditLogEntry, 'id' | 'timestamp' | 'integrityHash'>): AuditLogEntry {
    const timestamp = new Date().toISOString();
    const record: AuditLogEntry = {
      ...entry,
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp,
      integrityHash: makeHash(`${entry.actorEmail}:${entry.action}:${timestamp}`),
    };
    this.state.auditLogs.unshift(record);
    this.saveToDisk(this.state);
    this.broadcast('audit:new', record);
    return record;
  }

  public requestDailyPasscode(emailInput: string, branch: RegionalBranch | 'All Branches'): PasscodeDispatch {
    const normalized = emailInput.trim().toLowerCase();
    const today = getTodayDateKey();
    const staffMatch = this.state.staff.find(
      (s) => s.email.toLowerCase() === normalized && s.active
    );

    if (!staffMatch || !staffMatch.canReceivePasscode) {
      const rejected: PasscodeDispatch = {
        id: `pc-${Date.now()}`,
        requestedByEmail: emailInput.trim(),
        recipientName: staffMatch?.name ?? 'Unrecognized Recipient',
        recipientRole: staffMatch?.role ?? 'Unit Representative',
        branch,
        passcode: '',
        dateKey: today,
        dispatchedAt: new Date().toISOString(),
        status: 'Rejected',
        reason: staffMatch
          ? `Role "${staffMatch.role}" is not authorized to receive the daily passcode.`
          : 'Email address not found in authorized CNA chapter organizer database.',
      };
      this.state.passcodeDispatches.unshift(rejected);
      this.appendAudit({
        actorName: staffMatch?.name ?? 'Unknown Requester',
        actorEmail: emailInput.trim(),
        actorRole: staffMatch?.role ?? 'Member',
        branch,
        action: 'PASSCODE_REJECTED',
        resource: `Daily Passcode (${today})`,
        details: rejected.reason ?? 'Unauthorized passcode request rejected.',
      });
      this.saveToDisk(this.state);
      return rejected;
    }

    const passcode = generateDailyPasscode(today);
    const dispatch: PasscodeDispatch = {
      id: `pc-${Date.now()}`,
      requestedByEmail: staffMatch.email,
      recipientName: staffMatch.name,
      recipientRole: staffMatch.role,
      branch,
      passcode,
      dateKey: today,
      dispatchedAt: new Date().toISOString(),
      status: 'Dispatched',
    };
    this.state.passcodeDispatches.unshift(dispatch);
    this.appendAudit({
      actorName: staffMatch.name,
      actorEmail: staffMatch.email,
      actorRole: staffMatch.role,
      branch,
      action: 'PASSCODE_REQUESTED',
      resource: `Daily Passcode (${today})`,
      details: `Passcode of the day verified and emailed to ${staffMatch.email}.`,
    });
    this.saveToDisk(this.state);
    this.broadcast('passcode:dispatched', dispatch);
    return dispatch;
  }

  public recordCheckIn(input: {
    passcode: string;
    name: string;
    phone: string;
    email: string;
    branch: RegionalBranch;
    unit?: string;
    meetingTitle?: string;
    memberRole?: CheckInRole;
    rememberedDevice?: boolean;
  }): { ok: true; record: AttendanceRecord } | { ok: false; error: string } {
    const today = getTodayDateKey();
    const expectedPasscode = generateDailyPasscode(today);

    if (input.passcode.trim() !== expectedPasscode) {
      return {
        ok: false,
        error:
          'Invalid protection passcode for today. Please ask an on-site organizer to request today’s passcode.',
      };
    }

    const name = input.name.trim();
    const phone = input.phone.trim();
    const email = input.email.trim();
    if (!name || !phone || !email) {
      return { ok: false, error: 'Full name, phone number, and email are required.' };
    }

    const validRole: CheckInRole = CHECKIN_ROLES.includes(input.memberRole as CheckInRole)
      ? (input.memberRole as CheckInRole)
      : 'Union Member (RN)';
    const rawMeeting = (input.meetingTitle ?? '').trim();
    const meetingTitle = (MEETING_TYPES as readonly string[]).includes(rawMeeting)
      ? rawMeeting
      : MEETING_TYPES[0];

    const now = new Date().toISOString();
    const record: AttendanceRecord = {
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      phone,
      email,
      branch: input.branch,
      unit: (input.unit ?? '').trim() || 'General Nursing',
      meetingTitle,
      memberRole: validRole,
      checkedInAt: now,
      dateKey: today,
      verificationHash: makeHash(`${email}:${today}:${now}`),
      rememberedDevice: Boolean(input.rememberedDevice),
    };

    this.state.attendance.unshift(record);
    this.appendAudit({
      actorName: record.name,
      actorEmail: record.email,
      actorRole: validRole === 'Union Member (RN)' ? 'Member' : validRole,
      branch: record.branch,
      action: 'MEMBER_CHECKIN',
      resource: `${record.meetingTitle} (${record.branch})`,
      details: `Check-in recorded as ${record.memberRole} in ${record.unit} (no check-out required).`,
    });
    this.saveToDisk(this.state);
    this.broadcast('attendance:new', record);
    return { ok: true, record };
  }

  public updateStaffMember(
    actor: StaffMember,
    memberId: string,
    updates: Partial<Pick<StaffMember, 'role' | 'assignedBranches' | 'active' | 'canReceivePasscode'>>
  ): StaffMember | null {
    const target = this.state.staff.find((s) => s.id === memberId);
    if (!target) return null;
    Object.assign(target, updates);
    this.appendAudit({
      actorName: actor.name,
      actorEmail: actor.email,
      actorRole: actor.role,
      branch: 'All Branches',
      action: 'RBAC_UPDATED',
      resource: `${target.name} (${target.email})`,
      details: `Updated role=${target.role}, branches=[${target.assignedBranches.join(', ')}], active=${target.active}, passcodeAccess=${target.canReceivePasscode}`,
    });
    this.saveToDisk(this.state);
    this.broadcast('staff:updated', target);
    return target;
  }

  public addStaffMember(
    actor: StaffMember,
    input: {
      name: string;
      email: string;
      role: UnionRole;
      assignedBranches: RegionalBranch[];
      facility: string;
      canReceivePasscode: boolean;
    }
  ): StaffMember {
    const created: StaffMember = {
      id: `staff-${Date.now()}`,
      name: input.name.trim(),
      email: input.email.trim(),
      role: input.role,
      assignedBranches: input.assignedBranches.length > 0 ? input.assignedBranches : ['San Francisco'],
      facility: input.facility.trim() || 'CNA Regional Chapter',
      active: true,
      lastActiveAt: new Date().toISOString(),
      canReceivePasscode: input.canReceivePasscode,
    };
    this.state.staff.push(created);
    this.appendAudit({
      actorName: actor.name,
      actorEmail: actor.email,
      actorRole: actor.role,
      branch: 'All Branches',
      action: 'RBAC_UPDATED',
      resource: `${created.name} (${created.email})`,
      details: `Provisioned new ${created.role} across [${created.assignedBranches.join(', ')}].`,
    });
    this.saveToDisk(this.state);
    this.broadcast('staff:updated', created);
    return created;
  }

  public addEncryptedDocument(
    actor: StaffMember,
    doc: Omit<EncryptedDocument, 'id' | 'uploadedAt'>
  ): EncryptedDocument {
    const created: EncryptedDocument = {
      ...doc,
      id: `doc-${Date.now()}`,
      uploadedAt: new Date().toISOString(),
    };
    this.state.documents.unshift(created);
    this.appendAudit({
      actorName: actor.name,
      actorEmail: actor.email,
      actorRole: actor.role,
      branch: created.branch,
      action: 'DOCUMENT_ENCRYPTED',
      resource: created.title,
      details: `Stored AES-256-GCM encrypted ${created.category} (${created.sizeBytes} bytes, SHA-256 ${created.checksumSha256.slice(0, 12)}...).`,
    });
    this.saveToDisk(this.state);
    this.broadcast('document:new', created);
    return created;
  }

  public updateCloudConnector(
    actor: StaffMember,
    connectorId: string,
    updates: Partial<Pick<CloudConnector, 'connected' | 'autoSync' | 'accountLabel' | 'targetPath'>>
  ): CloudConnector | null {
    const conn = this.state.cloudConnectors.find((c) => c.id === connectorId);
    if (!conn) return null;
    Object.assign(conn, updates);
    this.appendAudit({
      actorName: actor.name,
      actorEmail: actor.email,
      actorRole: actor.role,
      branch: 'All Branches',
      action: 'CLOUD_SYNC_EXECUTED',
      resource: `${conn.provider} (${conn.accountLabel})`,
      details: `Updated cloud integration: connected=${conn.connected}, autoSync=${conn.autoSync}.`,
    });
    this.saveToDisk(this.state);
    return conn;
  }

  public triggerCloudBackup(
    actor: StaffMember,
    provider: CloudConnector['provider'],
    branchScope: RegionalBranch | 'All Branches'
  ): CloudBackupSnapshot {
    const conn = this.state.cloudConnectors.find((c) => c.provider === provider);
    const now = new Date().toISOString();
    if (conn) {
      conn.connected = true;
      conn.lastSyncedAt = now;
      conn.filesSynced += 1;
    }

    const scopedRecords =
      branchScope === 'All Branches'
        ? this.state.attendance
        : this.state.attendance.filter((a) => a.branch === branchScope);
    const scopedDocs =
      branchScope === 'All Branches'
        ? this.state.documents
        : this.state.documents.filter((d) => d.branch === branchScope);

    const snapshot: CloudBackupSnapshot = {
      id: `snap-${Date.now()}`,
      provider,
      triggeredBy: actor.name,
      branchScope,
      recordCount: scopedRecords.length,
      encryptedDocCount: scopedDocs.length,
      sizeKb: Math.max(24, scopedRecords.length * 4 + scopedDocs.length * 18),
      createdAt: now,
      checksum: makeHash(`${provider}:${branchScope}:${now}`),
      status: 'Verified',
    };

    this.state.backupSnapshots.unshift(snapshot);
    this.appendAudit({
      actorName: actor.name,
      actorEmail: actor.email,
      actorRole: actor.role,
      branch: branchScope,
      action: provider === 'Google Drive' ? 'DRIVE_BACKUP_SYNCED' : 'CLOUD_SYNC_EXECUTED',
      resource: `${provider} Backup (${snapshot.checksum.slice(0, 8)})`,
      details: `Synced ${snapshot.recordCount} attendance logs and ${snapshot.encryptedDocCount} E2EE documents (${snapshot.sizeKb} KB).`,
    });
    this.saveToDisk(this.state);
    this.broadcast('backup:new', snapshot);
    return snapshot;
  }

  public createApiKey(
    actor: StaffMember,
    input: {
      label: string;
      scopes: ApiKeyRecord['scopes'];
      branchScope: RegionalBranch | 'All Branches';
    }
  ): { record: ApiKeyRecord; rawSecret: string } {
    const prefix = `cna_${crypto.randomBytes(3).toString('hex')}`;
    const secretTail = crypto.randomBytes(12).toString('hex');
    const rawSecret = `${prefix}_${secretTail}`;
    const record: ApiKeyRecord = {
      id: `key-${Date.now()}`,
      label: input.label.trim() || 'Custom Enterprise Integration',
      prefix,
      tokenPreview: `${prefix}••••••••••••${secretTail.slice(-4)}`,
      scopes: input.scopes,
      branchScope: input.branchScope,
      createdBy: actor.name,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      active: true,
    };
    this.state.apiKeys.unshift(record);
    this.appendAudit({
      actorName: actor.name,
      actorEmail: actor.email,
      actorRole: actor.role,
      branch: input.branchScope,
      action: 'API_KEY_CREATED',
      resource: `${record.label} (${record.prefix})`,
      details: `Issued API token with scopes [${record.scopes.join(', ')}].`,
    });
    this.saveToDisk(this.state);
    return { record, rawSecret };
  }

  public revokeApiKey(actor: StaffMember, keyId: string): ApiKeyRecord | null {
    const key = this.state.apiKeys.find((k) => k.id === keyId);
    if (!key) return null;
    key.active = false;
    this.appendAudit({
      actorName: actor.name,
      actorEmail: actor.email,
      actorRole: actor.role,
      branch: key.branchScope,
      action: 'API_KEY_REVOKED',
      resource: `${key.label} (${key.prefix})`,
      details: 'API integration key revoked.',
    });
    this.saveToDisk(this.state);
    return key;
  }

  public addWebhook(name: string, url: string, events: string[]): WebhookConfig {
    const wh: WebhookConfig = {
      id: `wh-${Date.now()}`,
      name: name.trim(),
      url: url.trim(),
      events,
      active: true,
      lastTriggeredAt: null,
    };
    this.state.webhooks.unshift(wh);
    this.saveToDisk(this.state);
    return wh;
  }
}

export const unionStore = new UnionStore();
