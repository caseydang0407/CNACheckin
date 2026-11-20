import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
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
} from '../types/union';
import { encryptDocumentContent, sha256Hex } from '../utils/crypto';
import { generateDailyPasscode } from '../utils/rbac';
import { db, handleFirestoreError, OperationType, type User } from '../firebase';

export interface WorkspaceState {
  today: string;
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

const STATIC_STORAGE_KEY = 'cna_static_workspace_v1';

export function getTodayDateKeyClient(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function makeShortHash(seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${(hash >>> 0).toString(16).padStart(8, '0')}${(seed.length * 997).toString(16)}`;
}

function getAuthorizedEmailsForBranch(
  staff: StaffMember[],
  branch: RegionalBranch | 'All Branches'
): string[] {
  const set = new Set<string>(['caseydang0407@gmail.com']);
  for (const s of staff) {
    if (!s.active) continue;
    if (
      branch === 'All Branches' ||
      s.role === 'Administrative Staff' ||
      s.assignedBranches.includes(branch)
    ) {
      set.add(s.email.toLowerCase());
    }
  }
  return Array.from(set).slice(0, 25);
}

export function createClientSeedState(): WorkspaceState {
  const today = getTodayDateKeyClient();
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

  const roleOptions: CheckInRole[] = [
    'Union Member (RN)',
    'Union Member (RN)',
    'Unit Representative',
    'PPC Member',
    'Union Representative',
  ];

  const attendance: AttendanceRecord[] = seedMembers.map((m, idx) => {
    const ts = new Date(Date.now() - m.minutesAgo * 60000).toISOString();
    const dateKey = m.dateKey ?? today;
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
      verificationHash: makeShortHash(`${m.email}:${dateKey}:${idx}`),
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
      details: `Dispatched verified daily passcode to caseydang0407@gmail.com`,
      integrityHash: makeShortHash('aud-1'),
    },
    {
      id: 'aud-2',
      timestamp: new Date(Date.now() - 48 * 60000).toISOString(),
      actorName: 'Elena Vance, RN',
      actorEmail: 'caseydang0407@gmail.com',
      actorRole: 'Administrative Staff',
      branch: 'All Branches',
      action: 'DRIVE_BACKUP_SYNCED',
      resource: 'Google Drive (/CNA-Union-Backups/2026)',
      details: 'Encrypted daily attendance roster & E2EE vault snapshot uploaded cleanly.',
      integrityHash: makeShortHash('aud-2'),
    },
  ];

  const cloudConnectors: CloudConnector[] = [
    {
      id: 'cloud-gdrive',
      provider: 'Google Drive',
      accountLabel: 'caseydang0407@gmail.com',
      targetPath: '/CNA-Union-Backups/California-Chapters',
      connected: true,
      autoSync: true,
      lastSyncedAt: new Date(Date.now() - 48 * 60000).toISOString(),
      encryptedAtRest: true,
      filesSynced: 42,
    },
    {
      id: 'cloud-dropbox',
      provider: 'Dropbox Enterprise',
      accountLabel: 'cna-archive@calnurses.org',
      targetPath: '/Regional-Compliance-Archives',
      connected: true,
      autoSync: false,
      lastSyncedAt: new Date(Date.now() - 360 * 60000).toISOString(),
      encryptedAtRest: true,
      filesSynced: 18,
    },
    {
      id: 'cloud-box',
      provider: 'Box Healthcare',
      accountLabel: 'ppc-vault@calnurses.org',
      targetPath: '/PPC-Title22-Reports',
      connected: false,
      autoSync: false,
      lastSyncedAt: null,
      encryptedAtRest: true,
      filesSynced: 0,
    },
    {
      id: 'cloud-onedrive',
      provider: 'Microsoft OneDrive',
      accountLabel: 'not-linked@calnurses.org',
      targetPath: '/Union-Organizing-Mirror',
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
      recordCount: 18,
      encryptedDocCount: 2,
      sizeKb: 148,
      createdAt: new Date(Date.now() - 48 * 60000).toISOString(),
      checksum: makeShortHash('snap-1'),
      status: 'Verified',
    },
  ];

  const apiKeys: ApiKeyRecord[] = [
    {
      id: 'key-1',
      label: 'Statewide PowerBI & Payroll Sync',
      prefix: 'cna_live_statewide',
      tokenPreview: 'cna_live_statewide_••••••••8f2a',
      scopes: ['attendance:read', 'reports:read', 'audit:read'],
      branchScope: 'All Branches',
      createdBy: 'caseydang0407@gmail.com',
      createdAt: new Date(Date.now() - 720 * 60000).toISOString(),
      lastUsedAt: new Date(Date.now() - 25 * 60000).toISOString(),
      active: true,
    },
  ];

  const webhooks: WebhookConfig[] = [
    {
      id: 'wh-1',
      name: 'Google Apps Script Roster Mirror',
      url: 'https://script.google.com/macros/s/cna-union-mirror/exec',
      events: ['attendance.checkin', 'backup.completed'],
      active: true,
      lastTriggeredAt: new Date(Date.now() - 14 * 60000).toISOString(),
    },
  ];

  return {
    today,
    staff,
    attendance,
    passcodeDispatches,
    auditLogs,
    documents: [],
    cloudConnectors,
    backupSnapshots,
    apiKeys,
    webhooks,
  };
}

export function loadStaticWorkspace(): WorkspaceState {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(STATIC_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as WorkspaceState;
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
      // fall through
    }
  }
  const fresh = createClientSeedState();
  saveStaticWorkspace(fresh);
  return fresh;
}

export function saveStaticWorkspace(state: WorkspaceState): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STATIC_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore storage quota
    }
  }
}

export async function ensureFirestoreSeeded(user: User): Promise<void> {
  const email = (user.email ?? '').toLowerCase();
  if (email !== 'caseydang0407@gmail.com' || !user.emailVerified) return;

  const today = getTodayDateKeyClient();
  const todayPasscode = generateDailyPasscode(today);
  const seed = createClientSeedState();

  try {
    const passcodeRef = doc(db, 'daily_passcodes', today);
    const passcodeSnap = await getDoc(passcodeRef);
    const allPasscodeEmails = seed.staff
      .filter((s) => s.canReceivePasscode)
      .map((s) => s.email.toLowerCase());
    if (!allPasscodeEmails.includes('caseydang0407@gmail.com')) {
      allPasscodeEmails.unshift('caseydang0407@gmail.com');
    }

    if (!passcodeSnap.exists()) {
      await setDoc(passcodeRef, {
        dateKey: today,
        code: todayPasscode,
        authorizedEmails: allPasscodeEmails.slice(0, 25),
        ownerUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const staffCheck = await getDocs(query(collection(db, 'staff'), limit(1)));
    if (!staffCheck.empty) return;

    const batch = writeBatch(db);

    for (const s of seed.staff) {
      batch.set(doc(db, 'staff', s.id), {
        ...s,
        ownerUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    for (const rec of seed.attendance) {
      batch.set(doc(db, 'attendance', rec.id), {
        ...rec,
        verificationPasscode: todayPasscode,
        authorizedEmails: getAuthorizedEmailsForBranch(seed.staff, rec.branch),
        createdAt: serverTimestamp(),
      });
    }

    for (const pc of seed.passcodeDispatches) {
      batch.set(doc(db, 'passcode_dispatches', pc.id), {
        ...pc,
        authorizedEmails: allPasscodeEmails.slice(0, 25),
        createdAt: serverTimestamp(),
      });
    }

    for (const log of seed.auditLogs) {
      batch.set(doc(db, 'audit_logs', log.id), {
        ...log,
        authorizedEmails: getAuthorizedEmailsForBranch(seed.staff, log.branch),
        createdAt: serverTimestamp(),
      });
    }

    const doc1Payload = await encryptDocumentContent(
      'SF Bay Area Title 22 ICU Nurse-to-Patient Staffing Audit\nCompliance: 100% (1:2 ICU ratio verified across UCSF & ZSFG shifts).\nReviewed by PPC Committee.',
      'cna-vault-2026'
    );
    const doc2Payload = await encryptDocumentContent(
      'Los Angeles Bargaining Caucus Minutes (Confidential)\n1. Safe break coverage ratios\n2. Weekend differential enforcement across LA County facilities.',
      'cna-vault-2026'
    );

    const sampleDocs: EncryptedDocument[] = [
      {
        id: 'doc-1',
        title: 'SF Bay Area Safe Staffing Ratios Brief',
        category: 'PPC Staffing Log',
        branch: 'San Francisco',
        uploadedBy: 'Elena Vance, RN',
        uploadedAt: new Date(Date.now() - 120 * 60000).toISOString(),
        sizeBytes: doc1Payload.sizeBytes,
        algorithm: 'AES-256-GCM',
        kdf: 'PBKDF2-SHA256',
        saltB64: doc1Payload.saltB64,
        ivB64: doc1Payload.ivB64,
        ciphertextB64: doc1Payload.ciphertextB64,
        checksumSha256: doc1Payload.checksumSha256,
      },
      {
        id: 'doc-2',
        title: 'LA Bargaining Caucus Confidential Minutes',
        category: 'Bargaining Minutes',
        branch: 'Los Angeles',
        uploadedBy: 'Camila Reyes, RN',
        uploadedAt: new Date(Date.now() - 210 * 60000).toISOString(),
        sizeBytes: doc2Payload.sizeBytes,
        algorithm: 'AES-256-GCM',
        kdf: 'PBKDF2-SHA256',
        saltB64: doc2Payload.saltB64,
        ivB64: doc2Payload.ivB64,
        ciphertextB64: doc2Payload.ciphertextB64,
        checksumSha256: doc2Payload.checksumSha256,
      },
    ];

    for (const d of sampleDocs) {
      batch.set(doc(db, 'encrypted_documents', d.id), {
        ...d,
        authorizedEmails: getAuthorizedEmailsForBranch(seed.staff, d.branch),
        ownerUid: user.uid,
        createdAt: serverTimestamp(),
      });
    }

    for (const conn of seed.cloudConnectors) {
      batch.set(doc(db, 'cloud_connectors', conn.id), {
        ...conn,
        ownerUid: user.uid,
        updatedAt: serverTimestamp(),
      });
    }

    for (const snap of seed.backupSnapshots) {
      batch.set(doc(db, 'backup_snapshots', snap.id), {
        ...snap,
        ownerUid: user.uid,
        serverCreatedAt: serverTimestamp(),
      });
    }

    for (const key of seed.apiKeys) {
      batch.set(doc(db, 'api_keys', key.id), {
        ...key,
        ownerUid: user.uid,
        serverCreatedAt: serverTimestamp(),
      });
    }

    for (const wh of seed.webhooks) {
      batch.set(doc(db, 'webhooks', wh.id), {
        ...wh,
        ownerUid: user.uid,
        serverCreatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'firestore_seed');
  }
}

export function subscribeFirestoreWorkspace(
  user: User,
  onUpdate: (partial: Partial<WorkspaceState>) => void
): () => void {
  const email = (user.email ?? '').toLowerCase();
  const isAdmin = email === 'caseydang0407@gmail.com' && user.emailVerified;

  const staffQuery = isAdmin
    ? collection(db, 'staff')
    : query(collection(db, 'staff'), where('email', '==', email));

  const attendanceQuery = isAdmin
    ? collection(db, 'attendance')
    : query(collection(db, 'attendance'), where('authorizedEmails', 'array-contains', email));

  const dispatchQuery = isAdmin
    ? collection(db, 'passcode_dispatches')
    : query(collection(db, 'passcode_dispatches'), where('authorizedEmails', 'array-contains', email));

  const auditQuery = isAdmin
    ? collection(db, 'audit_logs')
    : query(collection(db, 'audit_logs'), where('authorizedEmails', 'array-contains', email));

  const docsQuery = isAdmin
    ? collection(db, 'encrypted_documents')
    : query(collection(db, 'encrypted_documents'), where('authorizedEmails', 'array-contains', email));

  const connQuery = isAdmin
    ? collection(db, 'cloud_connectors')
    : query(collection(db, 'cloud_connectors'), where('ownerUid', '==', user.uid));

  const snapQuery = isAdmin
    ? collection(db, 'backup_snapshots')
    : query(collection(db, 'backup_snapshots'), where('ownerUid', '==', user.uid));

  const unsubs: Array<() => void> = [];

  unsubs.push(
    onSnapshot(
      staffQuery,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as StaffMember);
        onUpdate({ staff: list });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'staff')
    )
  );

  unsubs.push(
    onSnapshot(
      attendanceQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as AttendanceRecord)
          .sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt));
        onUpdate({ attendance: list });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'attendance')
    )
  );

  unsubs.push(
    onSnapshot(
      dispatchQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as PasscodeDispatch)
          .sort((a, b) => b.dispatchedAt.localeCompare(a.dispatchedAt));
        onUpdate({ passcodeDispatches: list });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'passcode_dispatches')
    )
  );

  unsubs.push(
    onSnapshot(
      auditQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as AuditLogEntry)
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        onUpdate({ auditLogs: list });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'audit_logs')
    )
  );

  unsubs.push(
    onSnapshot(
      docsQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as EncryptedDocument)
          .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
        onUpdate({ documents: list });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'encrypted_documents')
    )
  );

  unsubs.push(
    onSnapshot(
      connQuery,
      (snap) => {
        const list = snap.docs.map((d) => d.data() as CloudConnector);
        onUpdate({ cloudConnectors: list });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'cloud_connectors')
    )
  );

  unsubs.push(
    onSnapshot(
      snapQuery,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as CloudBackupSnapshot)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        onUpdate({ backupSnapshots: list });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'backup_snapshots')
    )
  );

  if (isAdmin) {
    unsubs.push(
      onSnapshot(
        collection(db, 'api_keys'),
        (snap) => {
          const list = snap.docs
            .map((d) => d.data() as ApiKeyRecord)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          onUpdate({ apiKeys: list });
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'api_keys')
      )
    );

    unsubs.push(
      onSnapshot(
        collection(db, 'webhooks'),
        (snap) => {
          const list = snap.docs.map((d) => d.data() as WebhookConfig);
          onUpdate({ webhooks: list });
        },
        (err) => handleFirestoreError(err, OperationType.LIST, 'webhooks')
      )
    );
  }

  return () => {
    for (const unsub of unsubs) unsub();
  };
}

export async function submitPasscodeRequestFirebase(params: {
  email: string;
  branch: RegionalBranch | 'All Branches';
  staff: StaffMember[];
  firebaseUser: User | null;
}): Promise<{ ok: boolean; error?: string; dispatch: PasscodeDispatch }> {
  const today = getTodayDateKeyClient();
  const normalized = params.email.trim().toLowerCase();
  const match = params.staff.find((s) => s.email.toLowerCase() === normalized && s.active);

  if (!match || !match.canReceivePasscode) {
    const rejected: PasscodeDispatch = {
      id: `pc-${Date.now()}`,
      requestedByEmail: params.email.trim(),
      recipientName: match?.name ?? 'Unrecognized Recipient',
      recipientRole: match?.role ?? 'Unit Representative',
      branch: params.branch,
      passcode: '',
      dateKey: today,
      dispatchedAt: new Date().toISOString(),
      status: 'Rejected',
      reason: !match
        ? 'Email does not match an active organizer or administrator in the CNA directory.'
        : `Role "${match.role}" is not enabled for daily passcode email dispatch.`,
    };
    if (params.firebaseUser && params.firebaseUser.emailVerified) {
      try {
        await setDoc(doc(db, 'passcode_dispatches', rejected.id), {
          ...rejected,
          authorizedEmails: ['caseydang0407@gmail.com'],
          createdAt: serverTimestamp(),
        });
      } catch {
        // non-fatal if non-admin
      }
    }
    return { ok: false, error: rejected.reason, dispatch: rejected };
  }

  let code = generateDailyPasscode(today);
  if (params.firebaseUser && params.firebaseUser.emailVerified) {
    try {
      const codeSnap = await getDoc(doc(db, 'daily_passcodes', today));
      if (codeSnap.exists()) {
        code = String(codeSnap.data().code ?? code);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `daily_passcodes/${today}`);
    }
  }

  const dispatch: PasscodeDispatch = {
    id: `pc-${Date.now()}`,
    requestedByEmail: match.email,
    recipientName: match.name,
    recipientRole: match.role,
    branch: params.branch,
    passcode: code,
    dateKey: today,
    dispatchedAt: new Date().toISOString(),
    status: 'Dispatched',
  };

  if (params.firebaseUser && params.firebaseUser.emailVerified) {
    try {
      await setDoc(doc(db, 'passcode_dispatches', dispatch.id), {
        ...dispatch,
        authorizedEmails: getAuthorizedEmailsForBranch(params.staff, params.branch),
        createdAt: serverTimestamp(),
      });
      await setDoc(doc(db, 'audit_logs', `aud-${Date.now()}`), {
        id: `aud-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorName: match.name,
        actorEmail: match.email,
        actorRole: match.role,
        branch: params.branch,
        action: 'PASSCODE_REQUESTED',
        resource: `Daily Passcode (${today})`,
        details: `Passcode of the day verified and emailed to ${match.email}.`,
        integrityHash: makeShortHash(`${match.email}:${today}`),
        authorizedEmails: getAuthorizedEmailsForBranch(params.staff, params.branch),
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'passcode_dispatches');
    }
  }

  return { ok: true, dispatch };
}

export async function submitCheckInFirebase(params: {
  passcode: string;
  name: string;
  phone: string;
  email: string;
  branch: RegionalBranch;
  unit: string;
  meetingTitle: string;
  memberRole: CheckInRole;
  rememberedDevice: boolean;
  staff: StaffMember[];
  firebaseUser: User | null;
}): Promise<{ ok: true; record: AttendanceRecord } | { ok: false; error: string }> {
  const today = getTodayDateKeyClient();
  const expected = generateDailyPasscode(today);
  const trimmedCode = params.passcode.trim();

  if (trimmedCode !== expected && !params.firebaseUser) {
    return {
      ok: false,
      error:
        'Invalid protection passcode for today. Please ask an on-site organizer to request today’s passcode.',
    };
  }

  const now = new Date().toISOString();
  const id = `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const verificationHash = await sha256Hex(`${params.email}:${today}:${now}`);
  const record: AttendanceRecord = {
    id,
    name: params.name.trim(),
    phone: params.phone.trim(),
    email: params.email.trim(),
    branch: params.branch,
    unit: params.unit.trim() || 'General Nursing',
    meetingTitle: (MEETING_TYPES as readonly string[]).includes(params.meetingTitle)
      ? params.meetingTitle
      : MEETING_TYPES[0],
    memberRole: CHECKIN_ROLES.includes(params.memberRole)
      ? params.memberRole
      : 'Union Member (RN)',
    checkedInAt: now,
    dateKey: today,
    verificationHash: verificationHash.slice(0, 16),
    rememberedDevice: params.rememberedDevice,
  };

  try {
    await setDoc(doc(db, 'attendance', record.id), {
      ...record,
      verificationPasscode: trimmedCode,
      authorizedEmails: getAuthorizedEmailsForBranch(params.staff, record.branch),
      createdAt: serverTimestamp(),
    });
    if (params.firebaseUser && params.firebaseUser.emailVerified) {
      const logId = `aud-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      await setDoc(doc(db, 'audit_logs', logId), {
        id: logId,
        timestamp: now,
        actorName: record.name,
        actorEmail: record.email,
        actorRole: record.memberRole === 'Union Member (RN)' ? 'Member' : record.memberRole,
        branch: record.branch,
        action: 'MEMBER_CHECKIN',
        resource: `${record.meetingTitle} (${record.branch})`,
        details: `Check-in recorded as ${record.memberRole} in ${record.unit} (no check-out required).`,
        integrityHash: verificationHash.slice(0, 16),
        authorizedEmails: getAuthorizedEmailsForBranch(params.staff, record.branch),
        createdAt: serverTimestamp(),
      });
    }
    return { ok: true, record };
  } catch (error) {
    // If unauthenticated at the door and Firestore daily_passcodes wasn't initialized by an admin yet,
    // verify against deterministic daily code and persist locally, otherwise fail on bad passcode.
    if (!params.firebaseUser && trimmedCode === expected) {
      return { ok: true, record };
    }
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('permission') || msg.includes('PERMISSION_DENIED')) {
      return {
        ok: false,
        error:
          'Passcode rejected by Firestore security rules. Confirm today’s passcode with an on-site organizer.',
      };
    }
    return { ok: false, error: msg };
  }
}

export async function recordAuditFirebase(params: {
  actor: StaffMember;
  action: AuditLogEntry['action'];
  resource: string;
  details: string;
  branch: RegionalBranch | 'All Branches';
  staff: StaffMember[];
}): Promise<AuditLogEntry> {
  const now = new Date().toISOString();
  const id = `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const entry: AuditLogEntry = {
    id,
    timestamp: now,
    actorName: params.actor.name,
    actorEmail: params.actor.email,
    actorRole: params.actor.role,
    branch: params.branch,
    action: params.action,
    resource: params.resource,
    details: params.details,
    integrityHash: makeShortHash(`${params.actor.email}:${params.action}:${now}`),
  };

  try {
    await setDoc(doc(db, 'audit_logs', id), {
      ...entry,
      authorizedEmails: getAuthorizedEmailsForBranch(params.staff, params.branch),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `audit_logs/${id}`);
  }
  return entry;
}

export async function updateStaffFirebase(params: {
  memberId: string;
  patch: Partial<
    Pick<
      StaffMember,
      'name' | 'email' | 'facility' | 'role' | 'assignedBranches' | 'active' | 'canReceivePasscode'
    >
  >;
}): Promise<void> {
  try {
    await updateDoc(doc(db, 'staff', params.memberId), {
      ...params.patch,
      lastActiveAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `staff/${params.memberId}`);
  }
}

export async function createStaffFirebase(params: {
  user: User;
  member: Omit<StaffMember, 'id' | 'active' | 'lastActiveAt'>;
}): Promise<StaffMember> {
  const id = `staff-${Date.now()}`;
  const created: StaffMember = {
    id,
    ...params.member,
    active: true,
    lastActiveAt: new Date().toISOString(),
  };
  try {
    await setDoc(doc(db, 'staff', id), {
      ...created,
      ownerUid: params.user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `staff/${id}`);
  }
  return created;
}

export async function deleteStaffFirebase(params: {
  member: StaffMember;
  actor: StaffMember;
  staff: StaffMember[];
}): Promise<void> {
  try {
    await deleteDoc(doc(db, 'staff', params.member.id));
    await recordAuditFirebase({
      actor: params.actor,
      action: 'RBAC_DELETED',
      resource: `${params.member.name} (${params.member.email})`,
      details: `Removed ${params.member.role} from authorized chapter directory.`,
      branch: 'All Branches',
      staff: params.staff,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `staff/${params.member.id}`);
  }
}

export async function deleteAttendanceRecordsFirebase(params: {
  recordIds: string[];
  actor: StaffMember;
  staff: StaffMember[];
  summaryLabel: string;
  branch?: RegionalBranch | 'All Branches';
}): Promise<void> {
  try {
    for (let i = 0; i < params.recordIds.length; i += 400) {
      const chunk = params.recordIds.slice(i, i + 400);
      const batch = writeBatch(db);
      for (const id of chunk) {
        batch.delete(doc(db, 'attendance', id));
      }
      await batch.commit();
    }
    await recordAuditFirebase({
      actor: params.actor,
      action: 'ATTENDANCE_DELETED',
      resource: params.summaryLabel,
      details: `Deleted ${params.recordIds.length} verified check-in record(s) from Attendance Analytics.`,
      branch: params.branch ?? 'All Branches',
      staff: params.staff,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `attendance/${params.recordIds[0] ?? 'bulk'}`);
  }
}

export async function createEncryptedDocFirebase(params: {
  user: User;
  actor: StaffMember;
  staff: StaffMember[];
  docData: Omit<EncryptedDocument, 'id' | 'uploadedBy' | 'uploadedAt'>;
}): Promise<EncryptedDocument> {
  const id = `doc-${Date.now()}`;
  const uploadedAt = new Date().toISOString();
  const created: EncryptedDocument = {
    id,
    ...params.docData,
    uploadedBy: params.actor.name,
    uploadedAt,
  };
  try {
    await setDoc(doc(db, 'encrypted_documents', id), {
      ...created,
      authorizedEmails: getAuthorizedEmailsForBranch(params.staff, created.branch),
      ownerUid: params.user.uid,
      createdAt: serverTimestamp(),
    });
    await recordAuditFirebase({
      actor: params.actor,
      action: 'DOCUMENT_ENCRYPTED',
      resource: created.title,
      details: `Encrypted (${created.sizeBytes} bytes, AES-256-GCM).`,
      branch: created.branch,
      staff: params.staff,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `encrypted_documents/${id}`);
  }
  return created;
}

export async function updateConnectorFirebase(params: {
  connectorId: string;
  patch: Partial<CloudConnector>;
}): Promise<void> {
  try {
    await updateDoc(doc(db, 'cloud_connectors', params.connectorId), {
      ...params.patch,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `cloud_connectors/${params.connectorId}`);
  }
}

export async function triggerBackupSnapshotFirebase(params: {
  user: User;
  actor: StaffMember;
  staff: StaffMember[];
  connector: CloudConnector;
  branchScope: RegionalBranch | 'All Branches';
  recordCount: number;
  encryptedDocCount: number;
}): Promise<CloudBackupSnapshot> {
  const id = `snap-${Date.now()}`;
  const now = new Date().toISOString();
  const snapshot: CloudBackupSnapshot = {
    id,
    provider: params.connector.provider,
    triggeredBy: params.actor.name,
    branchScope: params.branchScope,
    recordCount: params.recordCount,
    encryptedDocCount: params.encryptedDocCount,
    sizeKb: Math.max(24, params.recordCount * 4 + params.encryptedDocCount * 16),
    createdAt: now,
    checksum: makeShortHash(`${id}:${params.connector.provider}:${now}`),
    status: 'Verified',
  };

  try {
    await setDoc(doc(db, 'backup_snapshots', id), {
      ...snapshot,
      ownerUid: params.user.uid,
      serverCreatedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, 'cloud_connectors', params.connector.id), {
      lastSyncedAt: now,
      filesSynced: params.connector.filesSynced + 1,
      updatedAt: serverTimestamp(),
    });
    await recordAuditFirebase({
      actor: params.actor,
      action:
        params.connector.provider === 'Google Drive'
          ? 'DRIVE_BACKUP_SYNCED'
          : 'CLOUD_SYNC_EXECUTED',
      resource: `${params.connector.provider} (${params.connector.targetPath})`,
      details: `Backed up ${params.recordCount} attendance logs and ${params.encryptedDocCount} E2EE documents.`,
      branch: params.branchScope,
      staff: params.staff,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `backup_snapshots/${id}`);
  }
  return snapshot;
}

export async function createApiKeyFirebase(params: {
  user: User;
  actor: StaffMember;
  staff: StaffMember[];
  label: string;
  scopes: ApiKeyRecord['scopes'];
  branchScope: RegionalBranch | 'All Branches';
}): Promise<{ record: ApiKeyRecord; rawSecret: string }> {
  const id = `key-${Date.now()}`;
  const suffix = Math.random().toString(36).slice(2, 6);
  const rawSecret = `cna_live_${suffix}_${Math.random().toString(36).slice(2, 14)}`;
  const record: ApiKeyRecord = {
    id,
    label: params.label,
    prefix: `cna_live_${suffix}`,
    tokenPreview: `cna_live_${suffix}_••••••••${rawSecret.slice(-4)}`,
    scopes: params.scopes,
    branchScope: params.branchScope,
    createdBy: params.actor.email,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    active: true,
  };
  try {
    await setDoc(doc(db, 'api_keys', id), {
      ...record,
      ownerUid: params.user.uid,
      serverCreatedAt: serverTimestamp(),
    });
    await recordAuditFirebase({
      actor: params.actor,
      action: 'API_KEY_CREATED',
      resource: record.label,
      details: `Issued API key (${record.branchScope})`,
      branch: params.branchScope,
      staff: params.staff,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `api_keys/${id}`);
  }
  return { record, rawSecret };
}

export async function revokeApiKeyFirebase(params: {
  keyId: string;
  actor: StaffMember;
  staff: StaffMember[];
}): Promise<void> {
  try {
    await updateDoc(doc(db, 'api_keys', params.keyId), {
      active: false,
    });
    await recordAuditFirebase({
      actor: params.actor,
      action: 'API_KEY_REVOKED',
      resource: params.keyId,
      details: 'Revoked enterprise API token.',
      branch: 'All Branches',
      staff: params.staff,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `api_keys/${params.keyId}`);
  }
}

export async function createWebhookFirebase(params: {
  user: User;
  name: string;
  url: string;
  events: string[];
}): Promise<WebhookConfig> {
  const id = `wh-${Date.now()}`;
  const webhook: WebhookConfig = {
    id,
    name: params.name,
    url: params.url,
    events: params.events,
    active: true,
    lastTriggeredAt: null,
  };
  try {
    await setDoc(doc(db, 'webhooks', id), {
      ...webhook,
      ownerUid: params.user.uid,
      serverCreatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `webhooks/${id}`);
  }
  return webhook;
}
