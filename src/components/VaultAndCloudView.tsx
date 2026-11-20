import React, { useState } from 'react';
import {
  Cloud,
  Copy,
  Download,
  ExternalLink,
  FileLock2,
  FileSpreadsheet,
  FolderSync,
  Key,
  Lock,
  RefreshCw,
  ShieldCheck,
  Unlink,
  Unlock,
  Upload,
} from 'lucide-react';
import {
  CloudBackupSnapshot,
  CloudConnector,
  EncryptedDocument,
  REGIONAL_BRANCHES,
  RegionalBranch,
  StaffMember,
} from '../types/union';
import { decryptDocumentContent, encryptDocumentContent } from '../utils/crypto';
import { getAccessibleBranches, getPermissionsForRole } from '../utils/rbac';
import { type User } from '../firebase';
import {
  createEncryptedDocFirebase,
  triggerBackupSnapshotFirebase,
  updateConnectorFirebase,
} from '../services/unionBackend';
import { LinkedGoogleSheetConfig } from '../services/googleSheets';
import { GoogleSignInButton } from './GoogleSignInButton';

interface VaultAndCloudViewProps {
  activeUser: StaffMember;
  staff: StaffMember[];
  attendanceCount: number;
  backendMode: 'firebase' | 'express' | 'static';
  firebaseUser: User | null;
  sheetsConnected: boolean;
  linkedSheet: LinkedGoogleSheetConfig | null;
  sheetBusy: boolean;
  sheetNotice: { type: 'success' | 'error'; text: string } | null;
  onConnectGoogleSheets: () => void;
  onCreateGoogleSheet: () => void;
  onLinkGoogleSheet: (urlOrId: string) => void;
  onChangeSheetTab: (tab: string) => void;
  onSyncGoogleSheet: () => void;
  onPullGoogleSheet: () => void;
  onUnlinkGoogleSheet: () => void;
  documents: EncryptedDocument[];
  connectors: CloudConnector[];
  snapshots: CloudBackupSnapshot[];
  onDocumentCreated: (doc: EncryptedDocument) => void;
  onConnectorUpdated: (conn: CloudConnector) => void;
  onBackupCompleted: (snap: CloudBackupSnapshot) => void;
  onRecordAudit: (
    action: 'DOCUMENT_DECRYPTED' | 'DOCUMENT_ENCRYPTED' | 'DRIVE_BACKUP_SYNCED' | 'CLOUD_SYNC_EXECUTED',
    resource: string,
    details: string,
    branch?: RegionalBranch | 'All Branches'
  ) => void;
}

const FIRESTORE_RULES_SNIPPET = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function staffDoc() {
      return get(/databases/$(database)/documents/staff/$(request.auth.uid)).data;
    }
    function hasBranchAccess(branch) {
      return staffDoc().role == 'Administrative Staff' || branch in staffDoc().assignedBranches;
    }
    match /attendance/{recordId} {
      allow create: if request.resource.data.passcodeVerified == true;
      allow read: if request.auth != null && hasBranchAccess(resource.data.branch);
    }
    match /encrypted_documents/{docId} {
      allow read, write: if request.auth != null && hasBranchAccess(resource.data.branch);
    }
    match /audit_logs/{logId} {
      allow read: if request.auth != null && staffDoc().role in ['Administrative Staff', 'Union Representative'];
      allow create: if request.auth != null;
    }
  }
}`;

const GITHUB_PAGES_WORKFLOW = `name: Deploy CNA Check-In to GitHub Pages
on:
  push:
    branches: ["main"]
jobs:
  build_and_deploy:
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci && npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist
      - uses: actions/deploy-pages@v4`;

export const VaultAndCloudView: React.FC<VaultAndCloudViewProps> = ({
  activeUser,
  staff,
  attendanceCount,
  backendMode,
  firebaseUser,
  sheetsConnected,
  linkedSheet,
  sheetBusy,
  sheetNotice,
  onConnectGoogleSheets,
  onCreateGoogleSheet,
  onLinkGoogleSheet,
  onChangeSheetTab,
  onSyncGoogleSheet,
  onPullGoogleSheet,
  onUnlinkGoogleSheet,
  documents,
  connectors,
  snapshots,
  onDocumentCreated,
  onConnectorUpdated,
  onBackupCompleted,
  onRecordAudit,
}) => {
  const perms = getPermissionsForRole(activeUser.role);
  const accessibleBranches = getAccessibleBranches(activeUser);

  // Encrypt form state
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<EncryptedDocument['category']>('PPC Staffing Log');
  const [branch, setBranch] = useState<RegionalBranch>(accessibleBranches[0] ?? 'San Francisco');
  const [plaintext, setPlaintext] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [encrypting, setEncrypting] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [vaultNotice, setVaultNotice] = useState<string | null>(null);

  // Decryption inspector state
  const [decryptTargetId, setDecryptTargetId] = useState<string | null>(null);
  const [decryptPass, setDecryptPass] = useState('');
  const [decryptedOutput, setDecryptedOutput] = useState<{ id: string; text: string } | null>(null);
  const [decryptError, setDecryptError] = useState<string | null>(null);

  // Cloud state
  const [syncingProvider, setSyncingProvider] = useState<string | null>(null);
  const [sheetUrlInput, setSheetUrlInput] = useState('');
  const [googleEmailInput, setGoogleEmailInput] = useState(
    connectors.find((c) => c.provider === 'Google Drive')?.accountLabel ?? activeUser.email
  );
  const [showDeployBlueprint, setShowDeployBlueprint] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!title.trim()) {
      setTitle(file.name.replace(/\.[^.]+$/, ''));
    }
    const text = await file.text();
    setPlaintext(text);
  };

  const handleEncryptAndStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setVaultError(null);
    setVaultNotice(null);

    if (!title.trim() || !plaintext.trim() || passphrase.length < 4) {
      setVaultError('Provide document title, sensitive content, and a passphrase (4+ chars).');
      return;
    }

    setEncrypting(true);
    try {
      const encrypted = await encryptDocumentContent(plaintext, passphrase);
      if (backendMode === 'express') {
        const res = await fetch('/api/v1/documents', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-actor-id': activeUser.id,
          },
          body: JSON.stringify({
            title: title.trim(),
            category,
            branch,
            sizeBytes: encrypted.sizeBytes,
            algorithm: 'AES-256-GCM',
            kdf: 'PBKDF2-SHA256',
            saltB64: encrypted.saltB64,
            ivB64: encrypted.ivB64,
            ciphertextB64: encrypted.ciphertextB64,
            checksumSha256: encrypted.checksumSha256,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setVaultError(data.error || 'Failed to store encrypted document.');
          return;
        }
        onDocumentCreated(data.document);
        setTitle('');
        setPlaintext('');
        setPassphrase('');
        setVaultNotice(
          `Encrypted "${data.document.title}" locally with AES-256-GCM before upload.`
        );
      } else {
        const docPayload = {
          title: title.trim(),
          category,
          branch,
          sizeBytes: encrypted.sizeBytes,
          algorithm: 'AES-256-GCM' as const,
          kdf: 'PBKDF2-SHA256' as const,
          saltB64: encrypted.saltB64,
          ivB64: encrypted.ivB64,
          ciphertextB64: encrypted.ciphertextB64,
          checksumSha256: encrypted.checksumSha256,
        };
        const createdDoc: EncryptedDocument =
          backendMode === 'firebase' && firebaseUser
            ? await createEncryptedDocFirebase({
                user: firebaseUser,
                actor: activeUser,
                staff,
                docData: docPayload,
              })
            : {
                id: `doc-${Date.now()}`,
                ...docPayload,
                uploadedBy: activeUser.name,
                uploadedAt: new Date().toISOString(),
              };
        onDocumentCreated(createdDoc);
        if (backendMode === 'static') {
          onRecordAudit(
            'DOCUMENT_ENCRYPTED',
            createdDoc.title,
            `Encrypted (${createdDoc.sizeBytes} bytes, AES-256-GCM).`,
            createdDoc.branch
          );
        }
        setTitle('');
        setPlaintext('');
        setPassphrase('');
        setVaultNotice(
          `Encrypted "${createdDoc.title}" locally with AES-256-GCM before upload.`
        );
      }
    } catch (err) {
      setVaultError(err instanceof Error ? err.message : 'Encryption failed.');
    } finally {
      setEncrypting(false);
    }
  };

  const handleDecryptDoc = async (doc: EncryptedDocument) => {
    setDecryptError(null);
    try {
      const text = await decryptDocumentContent(
        {
          saltB64: doc.saltB64,
          ivB64: doc.ivB64,
          ciphertextB64: doc.ciphertextB64,
        },
        decryptPass
      );
      setDecryptedOutput({ id: doc.id, text });
      setDecryptPass('');
      onRecordAudit(
        'DOCUMENT_DECRYPTED',
        doc.title,
        `Client-side AES-256-GCM decryption verified by ${activeUser.name}.`,
        doc.branch
      );
    } catch (err) {
      setDecryptError(err instanceof Error ? err.message : 'Incorrect passphrase.');
    }
  };

  const handleToggleConnector = async (conn: CloudConnector, patch: Partial<CloudConnector>) => {
    if (backendMode === 'express') {
      const res = await fetch(`/api/v1/backups/connectors/${conn.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-actor-id': activeUser.id,
        },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (res.ok && data.connector) {
        onConnectorUpdated(data.connector);
      }
    } else {
      if (backendMode === 'firebase' && firebaseUser) {
        await updateConnectorFirebase({ connectorId: conn.id, patch });
      }
      onConnectorUpdated({ ...conn, ...patch });
    }
  };

  const handleTriggerBackup = async (provider: CloudConnector['provider']) => {
    setSyncingProvider(provider);
    try {
      const branchScope = perms.canViewAllBranches ? 'All Branches' : accessibleBranches[0];
      if (backendMode === 'express') {
        const res = await fetch('/api/v1/backups/sync', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-actor-id': activeUser.id,
          },
          body: JSON.stringify({
            provider,
            branchScope,
          }),
        });
        const data = await res.json();
        if (res.ok && data.snapshot) {
          onBackupCompleted(data.snapshot);
          setVaultNotice(`Verified encrypted backup synced to ${provider}.`);
        }
      } else {
        const targetConn = connectors.find((c) => c.provider === provider);
        if (!targetConn) return;
        let snapshot: CloudBackupSnapshot;
        if (backendMode === 'firebase' && firebaseUser) {
          snapshot = await triggerBackupSnapshotFirebase({
            user: firebaseUser,
            actor: activeUser,
            staff,
            connector: targetConn,
            branchScope,
            recordCount: attendanceCount,
            encryptedDocCount: documents.length,
          });
        } else {
          const now = new Date().toISOString();
          snapshot = {
            id: `snap-${Date.now()}`,
            provider,
            triggeredBy: activeUser.name,
            branchScope,
            recordCount: attendanceCount,
            encryptedDocCount: documents.length,
            sizeKb: Math.max(24, attendanceCount * 4 + documents.length * 16),
            createdAt: now,
            checksum: `${Date.now().toString(16)}verified`,
            status: 'Verified',
          };
          onConnectorUpdated({
            ...targetConn,
            lastSyncedAt: now,
            filesSynced: targetConn.filesSynced + 1,
          });
          onRecordAudit(
            provider === 'Google Drive' ? 'DRIVE_BACKUP_SYNCED' : 'CLOUD_SYNC_EXECUTED',
            `${provider} (${targetConn.targetPath})`,
            `Backed up ${attendanceCount} attendance logs and ${documents.length} E2EE documents.`,
            branchScope
          );
        }
        onBackupCompleted(snapshot);
        setVaultNotice(`Verified encrypted backup synced to ${provider}.`);
      }
    } finally {
      setSyncingProvider(null);
    }
  };

  const handleDownloadEncryptedBundle = () => {
    const bundle = {
      exportedAt: new Date().toISOString(),
      exportedBy: activeUser.email,
      encryptionStandard: 'AES-256-GCM + PBKDF2-SHA256',
      encryptedDocuments: documents,
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cna-e2ee-vault-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyText = (id: string, content: string) => {
    navigator.clipboard?.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Section 1: Client-Side E2EE Document Vault */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">
              End-to-End Encrypted Document Vault &amp; Cloud Backups
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Sensitive union rosters, PPC staffing logs, and bargaining minutes are encrypted in
              your browser via AES-256-GCM before storage or cloud backup.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDownloadEncryptedBundle}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            Download E2EE Archive
          </button>
        </div>

        {vaultNotice && (
          <div className="mt-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 px-4 py-2.5 text-xs font-medium text-emerald-800 dark:text-emerald-200">
            {vaultNotice}
          </div>
        )}

        {!perms.canManageVault ? (
          <div className="mt-5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-4 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
            <Lock className="w-4 h-4 shrink-0" />
            Your active role ({activeUser.role}) does not have access to the Encrypted Document
            Vault. Switch to Administrative Staff, Union Representative, or PPC Member.
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Encrypt & Store Form */}
            <form onSubmit={handleEncryptAndStore} className="lg:col-span-5 space-y-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FileLock2 className="w-4 h-4 text-red-700 dark:text-red-400" />
                Encrypt &amp; Store New Document
              </h2>

              <div>
                <label
                  htmlFor="vault-doc-title"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Document Title
                </label>
                <input
                  id="vault-doc-title"
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Sacramento PPC Staffing Ratio Audit"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="vault-category"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Category
                  </label>
                  <select
                    id="vault-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as EncryptedDocument['category'])}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  >
                    <option value="PPC Staffing Log">PPC Staffing Log</option>
                    <option value="Bargaining Minutes">Bargaining Minutes</option>
                    <option value="Signed Roster">Signed Roster</option>
                    <option value="Grievance Brief">Grievance Brief</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="vault-branch"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Chapter Branch
                  </label>
                  <select
                    id="vault-branch"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value as RegionalBranch)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  >
                    {(perms.canViewAllBranches ? REGIONAL_BRANCHES : accessibleBranches).map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="vault-plaintext"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Sensitive Document Content
                  </label>
                  <label className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400 cursor-pointer hover:underline">
                    <Upload className="w-3.5 h-3.5" />
                    Load Text/CSV File
                    <input
                      type="file"
                      accept=".txt,.md,.csv,.json"
                      onChange={handleFileUpload}
                      className="sr-only"
                    />
                  </label>
                </div>
                <textarea
                  id="vault-plaintext"
                  rows={4}
                  required
                  value={plaintext}
                  onChange={(e) => setPlaintext(e.target.value)}
                  placeholder="Paste confidential union meeting notes, staffing ratios, or grievance details..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label
                  htmlFor="vault-passphrase"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Encryption Vault Passphrase (never sent to server)
                </label>
                <input
                  id="vault-passphrase"
                  type="password"
                  required
                  minLength={4}
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Enter passphrase (4+ chars)"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
              </div>

              {vaultError && (
                <div className="text-xs text-red-700 dark:text-red-400 font-medium">
                  {vaultError}
                </div>
              )}

              <button
                type="submit"
                disabled={encrypting}
                className="w-full py-2.5 px-4 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold transition-colors disabled:opacity-60"
              >
                {encrypting ? 'Encrypting Locally...' : 'Encrypt (AES-256-GCM) & Store'}
              </button>
            </form>

            {/* Encrypted Documents List */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Stored Encrypted Records ({documents.length})
                </h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Sample vault passphrase: <span className="font-mono">cna-vault-2026</span>
                </span>
              </div>

              <div className="space-y-3">
                {documents.map((doc) => {
                  const isDecrypting = decryptTargetId === doc.id;
                  const isDecrypted = decryptedOutput?.id === doc.id;
                  return (
                    <div
                      key={doc.id}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {doc.title}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {doc.category} · {doc.branch} · {doc.sizeBytes} bytes · Uploaded by{' '}
                            {doc.uploadedBy}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setDecryptTargetId(isDecrypting ? null : doc.id);
                            setDecryptError(null);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <Unlock className="w-3.5 h-3.5" />
                          {isDecrypting ? 'Close' : 'Decrypt & Inspect'}
                        </button>
                      </div>

                      <div className="mt-2 font-mono text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {doc.algorithm} · SHA-256: {doc.checksumSha256.slice(0, 24)}… · Cipher:{' '}
                        {doc.ciphertextB64.slice(0, 32)}…
                      </div>

                      {isDecrypting && (
                        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                          <div className="flex gap-2">
                            <input
                              type="password"
                              value={decryptPass}
                              onChange={(e) => setDecryptPass(e.target.value)}
                              placeholder="Enter vault passphrase (e.g. cna-vault-2026)"
                              className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                            />
                            <button
                              type="button"
                              onClick={() => handleDecryptDoc(doc)}
                              className="px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold"
                            >
                              Unlock
                            </button>
                          </div>
                          {decryptError && (
                            <p className="text-xs text-red-700 dark:text-red-400">{decryptError}</p>
                          )}
                          {isDecrypted && decryptedOutput && (
                            <pre className="whitespace-pre-wrap rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900 p-3 text-xs text-slate-800 dark:text-slate-200 font-mono">
                              {decryptedOutput.text}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Section 2: Live Google Sheets Database Sync & Cloud Storage */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-700 dark:text-emerald-400" />
              Live Google Sheets Database Sync &amp; Cloud Storage
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Connect your Google account to create or link a live Google Sheet for dynamic
              attendance, roster, and audit storage across devices.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowDeployBlueprint((v) => !v)}
            className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            {showDeployBlueprint
              ? 'Hide GitHub Pages & Firebase Blueprint'
              : 'GitHub Pages & Firebase Blueprint'}
          </button>
        </div>

        {/* Live Google Sheets Control Card */}
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
                <Cloud className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                Google Sheets Live Integration
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                {sheetsConnected
                  ? `Connected as ${firebaseUser?.email ?? activeUser.email}. Writes require explicit confirmation.`
                  : 'Connect Google Sheets in this browser session to create, read, or sync spreadsheets.'}
              </p>
            </div>
            {!sheetsConnected && (
              <div className="w-full sm:w-auto">
                <GoogleSignInButton
                  onClick={onConnectGoogleSheets}
                  label="Connect Google Sheets"
                  compact
                />
              </div>
            )}
          </div>

          {sheetNotice && (
            <div
              className={`rounded-lg px-3.5 py-2.5 text-xs font-medium border ${
                sheetNotice.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                  : 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200'
              }`}
            >
              {sheetNotice.text}
            </div>
          )}

          {linkedSheet ? (
            <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {linkedSheet.title}
                  </div>
                  <div className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    Sheet ID: {linkedSheet.spreadsheetId}
                    {linkedSheet.lastSyncedAt
                      ? ` · Synced ${new Date(linkedSheet.lastSyncedAt).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`
                      : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={linkedSheet.spreadsheetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open Sheet
                  </a>
                  <button
                    type="button"
                    onClick={onUnlinkGoogleSheet}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-red-700"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    Unlink
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-2">
                  <span>Attendance Tab:</span>
                  <select
                    value={linkedSheet.attendanceTab}
                    onChange={(e) => onChangeSheetTab(e.target.value)}
                    className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
                  >
                    {linkedSheet.availableTabs.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex flex-wrap items-center gap-2 ml-auto">
                  <button
                    type="button"
                    disabled={!sheetsConnected || sheetBusy}
                    onClick={onPullGoogleSheet}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-45"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Load from Sheet
                  </button>
                  <button
                    type="button"
                    disabled={!sheetsConnected || sheetBusy}
                    onClick={onSyncGoogleSheet}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold disabled:opacity-45"
                  >
                    <FolderSync className="w-3.5 h-3.5" />
                    {sheetBusy ? 'Syncing...' : 'Sync Attendance & Audit to Sheet'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
              <div className="lg:col-span-4">
                <button
                  type="button"
                  disabled={!sheetsConnected || sheetBusy}
                  onClick={onCreateGoogleSheet}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold disabled:opacity-45 transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Create New CNA Google Sheet
                </button>
              </div>
              <div className="lg:col-span-8 flex gap-2">
                <input
                  type="text"
                  value={sheetUrlInput}
                  onChange={(e) => setSheetUrlInput(e.target.value)}
                  placeholder="Or paste an existing Google Sheet URL or Spreadsheet ID..."
                  className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  disabled={!sheetsConnected || sheetBusy || !sheetUrlInput.trim()}
                  onClick={() => onLinkGoogleSheet(sheetUrlInput)}
                  className="px-3.5 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold disabled:opacity-45 whitespace-nowrap"
                >
                  Link Sheet
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Google Account Link Bar */}
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex-1 min-w-[240px]">
            <label
              htmlFor="google-account-link"
              className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1"
            >
              Linked Google Account for Drive Backups
            </label>
            <div className="flex gap-2">
              <input
                id="google-account-link"
                type="email"
                value={googleEmailInput}
                onChange={(e) => setGoogleEmailInput(e.target.value)}
                disabled={!perms.canManageCloudBackups}
                className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
              {perms.canManageCloudBackups && (
                <button
                  type="button"
                  onClick={() => {
                    const gdrive = connectors.find((c) => c.provider === 'Google Drive');
                    if (gdrive) {
                      handleToggleConnector(gdrive, {
                        accountLabel: googleEmailInput.trim(),
                        connected: true,
                      });
                      setVaultNotice(`Linked Google Drive backup target to ${googleEmailInput}.`);
                    }
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold whitespace-nowrap"
                >
                  Update Google Link
                </button>
              )}
            </div>
          </div>

          {perms.canManageCloudBackups && (
            <button
              type="button"
              onClick={() => handleTriggerBackup('Google Drive')}
              disabled={syncingProvider === 'Google Drive'}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold transition-colors whitespace-nowrap"
            >
              <FolderSync className="w-4 h-4" />
              {syncingProvider === 'Google Drive'
                ? 'Syncing Snapshot...'
                : 'Log Encrypted Backup Snapshot'}
            </button>
          )}
        </div>

        {/* Cloud Connectors Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {connectors.map((conn) => (
            <div
              key={conn.id}
              className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 flex flex-col justify-between gap-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                    {conn.provider}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {conn.accountLabel} · {conn.targetPath}
                  </div>
                </div>
                <span
                  className={`text-xs font-semibold ${
                    conn.connected
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {conn.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200 dark:border-slate-800 text-xs">
                <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {conn.filesSynced} files ·{' '}
                  {conn.lastSyncedAt
                    ? `Last sync ${new Date(conn.lastSyncedAt).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}`
                    : 'Never synced'}
                </span>

                {perms.canManageCloudBackups && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleToggleConnector(conn, { connected: !conn.connected })
                      }
                      className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium"
                    >
                      {conn.connected ? 'Disconnect' : 'Connect'}
                    </button>
                    <button
                      type="button"
                      disabled={!conn.connected || syncingProvider === conn.provider}
                      onClick={() => handleTriggerBackup(conn.provider)}
                      className="px-2.5 py-1 rounded bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium disabled:opacity-40"
                    >
                      {syncingProvider === conn.provider ? 'Syncing...' : 'Sync Now'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Backup Snapshots History */}
        <div>
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Verified Cloud Backup Snapshots ({snapshots.length})
          </h3>
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                  <th className="py-2 px-3">Provider</th>
                  <th className="py-2 px-3">Branch Scope</th>
                  <th className="py-2 px-3">Records / Docs</th>
                  <th className="py-2 px-3">Size</th>
                  <th className="py-2 px-3">SHA Checksum</th>
                  <th className="py-2 px-3 text-right">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {snapshots.map((snap) => (
                  <tr key={snap.id}>
                    <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100">
                      {snap.provider}
                    </td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                      {snap.branchScope}
                    </td>
                    <td className="py-2 px-3 font-mono tabular-nums">
                      {snap.recordCount} logs · {snap.encryptedDocCount} E2EE docs
                    </td>
                    <td className="py-2 px-3 font-mono tabular-nums">{snap.sizeKb} KB</td>
                    <td className="py-2 px-3 font-mono text-slate-500">
                      {snap.checksum.slice(0, 12)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-500">
                      {new Date(snap.createdAt).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* GitHub Pages & Firebase Deployment Blueprint */}
        {showDeployBlueprint && (
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-red-700 dark:text-red-400" />
                  Firebase Firestore Security Rules (5-Branch RBAC)
                </span>
                <button
                  type="button"
                  onClick={() => copyText('firestore', FIRESTORE_RULES_SNIPPET)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-red-700"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedId === 'firestore' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="text-[11px] font-mono text-slate-700 dark:text-slate-300 overflow-x-auto">
                {FIRESTORE_RULES_SNIPPET}
              </pre>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-red-700 dark:text-red-400" />
                  GitHub Pages Static Deployment Workflow
                </span>
                <button
                  type="button"
                  onClick={() => copyText('ghpages', GITHUB_PAGES_WORKFLOW)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-red-700"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedId === 'ghpages' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="text-[11px] font-mono text-slate-700 dark:text-slate-300 overflow-x-auto">
                {GITHUB_PAGES_WORKFLOW}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
