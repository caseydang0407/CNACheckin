import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BookOpen,
  ClipboardCheck,
  Code2,
  FileLock2,
  LogOut,
  Menu,
  Moon,
  ShieldCheck,
  Sun,
  Users,
  X,
} from 'lucide-react';
import {
  ApiKeyRecord,
  AttendanceRecord,
  AuditLogEntry,
  CloudBackupSnapshot,
  CloudConnector,
  EncryptedDocument,
  PasscodeDispatch,
  REGIONAL_BRANCHES,
  RegionalBranch,
  StaffMember,
  WebhookConfig,
} from './types/union';
import { computeBranchCompliance, getPermissionsForRole } from './utils/rbac';
import { loadThemePreference, saveThemePreference } from './utils/cookies';
import {
  extractSpreadsheetId,
  resolveAuthenticatedStaff,
} from './utils/googleSheetsHelpers';
import { CheckInPortal } from './components/CheckInPortal';
import { DashboardView } from './components/DashboardView';
import { RbacAccessView } from './components/RbacAccessView';
import { VaultAndCloudView } from './components/VaultAndCloudView';
import { AuditComplianceView } from './components/AuditComplianceView';
import { ApiIntegrationsView } from './components/ApiIntegrationsView';
import { OnboardingTour } from './components/OnboardingTour';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { ConfirmSheetModal } from './components/ConfirmSheetModal';
import {
  auth,
  onAuthStateChanged,
  signInWithGoogle,
  signOutFirebase,
  subscribeGoogleAccessToken,
  type User,
} from './firebase';
import {
  ensureFirestoreSeeded,
  getTodayDateKeyClient,
  loadStaticWorkspace,
  recordAuditFirebase,
  saveStaticWorkspace,
  subscribeFirestoreWorkspace,
} from './services/unionBackend';
import {
  clearLinkedSheetConfig,
  createCnaGoogleSheet,
  inspectGoogleSheet,
  LinkedGoogleSheetConfig,
  loadLinkedSheetConfig,
  pullAttendanceFromGoogleSheet,
  saveLinkedSheetConfig,
  syncWorkspaceToGoogleSheet,
} from './services/googleSheets';

type NavTab = 'checkin' | 'dashboard' | 'rbac' | 'vault' | 'audit' | 'api';
type BackendMode = 'firebase' | 'express' | 'static';

const ALL_NAV_ITEMS: Array<{
  id: NavTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'checkin', label: 'Member Check-In', icon: ClipboardCheck },
  { id: 'dashboard', label: 'Attendance Analytics', icon: Activity },
  { id: 'rbac', label: 'Roles & Branches', icon: Users },
  { id: 'vault', label: 'Vault & Cloud Sync', icon: FileLock2 },
  { id: 'audit', label: 'Audit & Compliance', icon: ShieldCheck },
  { id: 'api', label: 'API & Webhooks', icon: Code2 },
];

export function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('checkin');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => loadThemePreference());
  const [tourOpen, setTourOpen] = useState(false);

  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [backendMode, setBackendMode] = useState<BackendMode>('static');
  const [previewStaffId, setPreviewStaffId] = useState<string | null>(null);

  const [sheetsAccessToken, setSheetsAccessToken] = useState<string | null>(null);
  const [linkedSheet, setLinkedSheet] = useState<LinkedGoogleSheetConfig | null>(() =>
    loadLinkedSheetConfig()
  );
  const [sheetBusy, setSheetBusy] = useState(false);
  const [sheetNotice, setSheetNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [pendingSheetAction, setPendingSheetAction] = useState<'create' | 'sync' | null>(null);

  const [today, setToday] = useState(() => getTodayDateKeyClient());
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [dispatches, setDispatches] = useState<PasscodeDispatch[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [documents, setDocuments] = useState<EncryptedDocument[]>([]);
  const [connectors, setConnectors] = useState<CloudConnector[]>([]);
  const [snapshots, setSnapshots] = useState<CloudBackupSnapshot[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [avatarFailed, setAvatarFailed] = useState(false);

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    saveThemePreference(theme);
  }, [theme]);

  // Listen to Firebase Auth state & in-memory Google access token
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (!user) {
        setPreviewStaffId(null);
      }
      setAuthReady(true);
    });
    const unsubToken = subscribeGoogleAccessToken((token) => {
      setSheetsAccessToken(token);
    });
    return () => {
      unsubAuth();
      unsubToken();
    };
  }, []);

  const fetchExpressBootstrap = useCallback(async (): Promise<boolean> => {
    try {
      if (
        import.meta.env.VITE_STATIC_ONLY === 'true' ||
        (typeof window !== 'undefined' && window.location.hostname.endsWith('github.io'))
      ) {
        return false;
      }
      const res = await fetch('/api/v1/bootstrap');
      const ct = res.headers.get('content-type') ?? '';
      if (!res.ok || !ct.includes('application/json')) {
        return false;
      }
      const data = await res.json();
      setToday(data.today);
      setStaff(data.staff ?? []);
      setAttendance(data.attendance ?? []);
      setDispatches(data.passcodeDispatches ?? []);
      setAuditLogs(data.auditLogs ?? []);
      setDocuments(data.documents ?? []);
      setConnectors(data.cloudConnectors ?? []);
      setSnapshots(data.backupSnapshots ?? []);
      setApiKeys(data.apiKeys ?? []);
      setWebhooks(data.webhooks ?? []);
      return true;
    } catch {
      return false;
    }
  }, []);

  // Load workspace from Firebase (when signed in), Express (dev/Node host), or static browser store
  useEffect(() => {
    if (!authReady) return;

    if (firebaseUser && firebaseUser.emailVerified) {
      let unsubFirestore: (() => void) | undefined;
      let cancelled = false;
      setBackendMode('firebase');
      setToday(getTodayDateKeyClient());

      (async () => {
        try {
          await ensureFirestoreSeeded(firebaseUser);
          if (cancelled) return;
          unsubFirestore = subscribeFirestoreWorkspace(firebaseUser, (partial) => {
            if (partial.staff) setStaff(partial.staff);
            if (partial.attendance) setAttendance(partial.attendance);
            if (partial.passcodeDispatches) setDispatches(partial.passcodeDispatches);
            if (partial.auditLogs) setAuditLogs(partial.auditLogs);
            if (partial.documents) setDocuments(partial.documents);
            if (partial.cloudConnectors) setConnectors(partial.cloudConnectors);
            if (partial.backupSnapshots) setSnapshots(partial.backupSnapshots);
            if (partial.apiKeys) setApiKeys(partial.apiKeys);
            if (partial.webhooks) setWebhooks(partial.webhooks);
            setLoading(false);
          });
        } catch (err) {
          setAuthNotice(err instanceof Error ? err.message : 'Unable to sync Firestore.');
          setLoading(false);
        }
      })();

      return () => {
        cancelled = true;
        unsubFirestore?.();
      };
    }

    let sseSource: EventSource | undefined;
    let active = true;

    (async () => {
      const ok = await fetchExpressBootstrap();
      if (!active) return;

      if (ok) {
        setBackendMode('express');
        setLoading(false);
        sseSource = new EventSource('/api/v1/stream');
        const refresh = () => {
          void fetchExpressBootstrap();
        };
        sseSource.addEventListener('attendance:new', refresh);
        sseSource.addEventListener('audit:new', refresh);
        sseSource.addEventListener('passcode:dispatched', refresh);
        sseSource.addEventListener('document:new', refresh);
        sseSource.addEventListener('backup:new', refresh);
        sseSource.addEventListener('staff:updated', refresh);
      } else {
        setBackendMode('static');
        const local = loadStaticWorkspace();
        setToday(local.today);
        setStaff(local.staff);
        setAttendance(local.attendance);
        setDispatches(local.passcodeDispatches);
        setAuditLogs(local.auditLogs);
        setDocuments(local.documents);
        setConnectors(local.cloudConnectors);
        setSnapshots(local.backupSnapshots);
        setApiKeys(local.apiKeys);
        setWebhooks(local.webhooks);
        setLoading(false);
      }
    })();

    return () => {
      active = false;
      sseSource?.close();
    };
  }, [authReady, firebaseUser, fetchExpressBootstrap]);

  // Persist changes to browser static storage when in static GitHub Pages mode
  useEffect(() => {
    if (backendMode !== 'static' || loading || staff.length === 0) return;
    saveStaticWorkspace({
      today,
      staff,
      attendance,
      passcodeDispatches: dispatches,
      auditLogs,
      documents,
      cloudConnectors: connectors,
      backupSnapshots: snapshots,
      apiKeys,
      webhooks,
    });
  }, [
    backendMode,
    loading,
    today,
    staff,
    attendance,
    dispatches,
    auditLogs,
    documents,
    connectors,
    snapshots,
    apiKeys,
    webhooks,
  ]);

  // Strict authenticated role resolution (never grants Elena Vance / Admin view to visitors or regular members)
  const identity = useMemo(
    () =>
      resolveAuthenticatedStaff({
        firebaseUser,
        staff,
        previewStaffId,
      }),
    [firebaseUser, staff, previewStaffId]
  );

  const activeUser = identity.staffMember;
  const activePerms = useMemo(
    () => (activeUser ? getPermissionsForRole(activeUser.role) : null),
    [activeUser]
  );

  const visibleNavItems = useMemo(() => {
    if (!identity.isAuthorizedStaff || !activePerms) {
      return ALL_NAV_ITEMS.filter((item) => item.id === 'checkin');
    }
    return ALL_NAV_ITEMS.filter((item) => {
      if (item.id === 'checkin' || item.id === 'dashboard') return true;
      if (item.id === 'rbac') return activePerms.canManageRbac;
      if (item.id === 'vault') return activePerms.canManageVault;
      if (item.id === 'audit') return activePerms.canViewAuditLog;
      if (item.id === 'api') return activePerms.canManageApiKeys;
      return false;
    });
  }, [identity.isAuthorizedStaff, activePerms]);

  // Keep activeTab restricted to what the signed-in user's role permits
  useEffect(() => {
    if (!visibleNavItems.some((item) => item.id === activeTab)) {
      setActiveTab('checkin');
    }
  }, [visibleNavItems, activeTab]);

  const globalComplianceToday = useMemo(
    () => computeBranchCompliance(attendance, today),
    [attendance, today]
  );

  const handleGoogleSignIn = async () => {
    setAuthNotice(null);
    setAvatarFailed(false);
    try {
      await signInWithGoogle();
    } catch (err) {
      setAuthNotice(
        err instanceof Error ? err.message : 'Google Sign-In was cancelled or blocked.'
      );
    }
  };

  const handleGoogleSignOut = async () => {
    setAuthNotice(null);
    setPreviewStaffId(null);
    setActiveTab('checkin');
    await signOutFirebase();
  };

  const handleRecordAudit = async (
    action: AuditLogEntry['action'],
    resource: string,
    details: string,
    branch: RegionalBranch | 'All Branches' = 'All Branches'
  ) => {
    if (!activeUser) return;
    if (backendMode === 'express') {
      const res = await fetch('/api/v1/audit-logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-actor-id': activeUser.id,
        },
        body: JSON.stringify({ action, resource, details, branch }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.entry) {
          setAuditLogs((prev) => [data.entry, ...prev]);
        }
      }
    } else if (backendMode === 'firebase' && firebaseUser) {
      await recordAuditFirebase({
        actor: activeUser,
        action,
        resource,
        details,
        branch,
        staff,
      });
    } else {
      const entry: AuditLogEntry = {
        id: `aud-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorName: activeUser.name,
        actorEmail: activeUser.email,
        actorRole: activeUser.role,
        branch,
        action,
        resource,
        details,
        integrityHash: `${Date.now().toString(16)}local`,
      };
      setAuditLogs((prev) => [entry, ...prev]);
    }
  };

  const handleLinkGoogleSheet = async (urlOrId: string) => {
    setSheetNotice(null);
    if (!sheetsAccessToken) {
      setSheetNotice({
        type: 'error',
        text: 'Click "Connect Google Sheets" first to authorize spreadsheet access in this session.',
      });
      return;
    }
    const id = extractSpreadsheetId(urlOrId);
    if (!id) {
      setSheetNotice({
        type: 'error',
        text: 'Enter a valid Google Sheets URL or Spreadsheet ID.',
      });
      return;
    }
    setSheetBusy(true);
    try {
      const meta = await inspectGoogleSheet(sheetsAccessToken, id);
      saveLinkedSheetConfig(meta);
      setLinkedSheet(meta);
      setSheetNotice({
        type: 'success',
        text: `Linked Google Sheet "${meta.title}" (${meta.availableTabs.join(', ')}).`,
      });
    } catch (err) {
      setSheetNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to inspect Google Sheet.',
      });
    } finally {
      setSheetBusy(false);
    }
  };

  const handlePullGoogleSheet = async () => {
    setSheetNotice(null);
    if (!sheetsAccessToken || !linkedSheet) return;
    setSheetBusy(true);
    try {
      const pulled = await pullAttendanceFromGoogleSheet({
        accessToken: sheetsAccessToken,
        spreadsheetId: linkedSheet.spreadsheetId,
        sheetTitle: linkedSheet.attendanceTab,
      });
      if (pulled.length === 0) {
        setSheetNotice({
          type: 'success',
          text: `Checked "${linkedSheet.attendanceTab}" in "${linkedSheet.title}" — no rows found yet.`,
        });
      } else {
        setAttendance((prev) => {
          const map = new Map<string, AttendanceRecord>();
          for (const item of pulled) map.set(item.id, item);
          for (const item of prev) {
            if (!map.has(item.id)) map.set(item.id, item);
          }
          return Array.from(map.values()).sort((a, b) =>
            b.checkedInAt.localeCompare(a.checkedInAt)
          );
        });
        setSheetNotice({
          type: 'success',
          text: `Loaded ${pulled.length} attendance records from "${linkedSheet.title}" (${linkedSheet.attendanceTab}).`,
        });
      }
    } catch (err) {
      setSheetNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load rows from Google Sheet.',
      });
    } finally {
      setSheetBusy(false);
    }
  };

  const handleConfirmSheetMutation = async () => {
    if (!pendingSheetAction || !sheetsAccessToken) return;
    setSheetBusy(true);
    setSheetNotice(null);
    try {
      if (pendingSheetAction === 'create') {
        const created = await createCnaGoogleSheet(sheetsAccessToken);
        const synced = await syncWorkspaceToGoogleSheet({
          accessToken: sheetsAccessToken,
          config: created,
          attendance,
          staff,
          auditLogs,
        });
        saveLinkedSheetConfig(synced);
        setLinkedSheet(synced);
        setSheetNotice({
          type: 'success',
          text: `Created & synced "${synced.title}" (${attendance.length} attendance rows).`,
        });
        await handleRecordAudit(
          'CLOUD_SYNC_EXECUTED',
          `Google Sheets (${synced.title})`,
          `Created spreadsheet and synced ${attendance.length} attendance rows, ${staff.length} staff, and ${auditLogs.length} audit logs.`
        );
      } else if (pendingSheetAction === 'sync' && linkedSheet) {
        const synced = await syncWorkspaceToGoogleSheet({
          accessToken: sheetsAccessToken,
          config: linkedSheet,
          attendance,
          staff,
          auditLogs,
        });
        saveLinkedSheetConfig(synced);
        setLinkedSheet(synced);
        setSheetNotice({
          type: 'success',
          text: `Synced ${attendance.length} attendance rows, ${staff.length} staff records, and ${auditLogs.length} audit entries to "${synced.title}".`,
        });
        await handleRecordAudit(
          'CLOUD_SYNC_EXECUTED',
          `Google Sheets (${synced.title})`,
          `Updated ${synced.attendanceTab}, Staff, and AuditLog tabs (${attendance.length} attendance records).`
        );
      }
    } catch (err) {
      setSheetNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Google Sheets update failed.',
      });
    } finally {
      setSheetBusy(false);
      setPendingSheetAction(null);
    }
  };

  const activeNavLabel = ALL_NAV_ITEMS.find((n) => n.id === activeTab)?.label ?? 'Portal';

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:sticky lg:top-0 lg:h-screen border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
        <div className="h-16 px-5 flex items-center border-b border-slate-200 dark:border-slate-800">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('checkin');
            }}
            className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap"
          >
            CNA Union Portal
          </a>
        </div>

        <nav aria-label="Workspace Navigation" className="flex-1 p-3 space-y-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-red-700 text-white'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}

          {!identity.isAuthorizedStaff && (
            <div className="mt-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 p-3 text-xs text-slate-600 dark:text-slate-400">
              {identity.isSignedIn
                ? 'Signed in as a union member. Chapter analytics and admin tools are restricted to authorized organizers.'
                : 'Organizer dashboards, Google Sheets sync, and exports unlock after signing in with an authorized organizer Google account.'}
            </div>
          )}
        </nav>

        {/* Identity & Role-Restricted Access Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-3">
            {firebaseUser?.photoURL && !avatarFailed ? (
              <img
                src={firebaseUser.photoURL}
                alt={identity.displayName}
                referrerPolicy="no-referrer"
                onError={() => setAvatarFailed(true)}
                className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-red-700 text-white flex items-center justify-center text-xs font-bold shrink-0">
                {identity.displayName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                {identity.displayName}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {identity.roleLabel}
              </div>
            </div>
          </div>

          {firebaseUser ? (
            <div className="space-y-2">
              {identity.isAuthorizedStaff && !sheetsAccessToken && (
                <GoogleSignInButton
                  onClick={handleGoogleSignIn}
                  label="Connect Google Sheets"
                />
              )}
              <button
                type="button"
                onClick={handleGoogleSignOut}
                className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out ({firebaseUser.email?.split('@')[0]})
              </button>
            </div>
          ) : (
            <GoogleSignInButton
              onClick={handleGoogleSignIn}
              label="Sign in with Google"
            />
          )}

          {/* Admin-only role preview switcher */}
          {identity.isAdmin && (
            <div>
              <label
                htmlFor="role-switcher-desktop"
                className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1"
              >
                Admin Role Preview
              </label>
              <select
                id="role-switcher-desktop"
                value={previewStaffId ?? identity.actualStaffMember?.id ?? ''}
                onChange={(e) => setPreviewStaffId(e.target.value || null)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.role} — {s.name.split(',')[0]}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between p-4 z-10">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
                <span className="text-base font-bold text-slate-900 dark:text-slate-50">
                  CNA Union Portal
                </span>
                <button
                  type="button"
                  aria-label="Close navigation menu"
                  onClick={() => setMobileNavOpen(false)}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="mt-4 space-y-1">
                {visibleNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileNavOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium ${
                        active
                          ? 'bg-red-700 text-white'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
              {firebaseUser ? (
                <>
                  {identity.isAuthorizedStaff && !sheetsAccessToken && (
                    <GoogleSignInButton
                      onClick={handleGoogleSignIn}
                      label="Connect Google Sheets"
                    />
                  )}
                  <button
                    type="button"
                    onClick={handleGoogleSignOut}
                    className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out ({firebaseUser.email?.split('@')[0]})
                  </button>
                </>
              ) : (
                <GoogleSignInButton
                  onClick={handleGoogleSignIn}
                  label="Sign in with Google"
                />
              )}

              {identity.isAdmin && (
                <div>
                  <label
                    htmlFor="role-switcher-mobile"
                    className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1"
                  >
                    Admin Role Preview
                  </label>
                  <select
                    id="role-switcher-mobile"
                    value={previewStaffId ?? identity.actualStaffMember?.id ?? ''}
                    onChange={(e) => setPreviewStaffId(e.target.value || null)}
                    className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  >
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.role} — {s.name.split(',')[0]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 px-4 sm:px-8 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm font-medium text-slate-500 dark:text-slate-400 truncate">
              <span className="hidden sm:inline">California Nurses Association</span>
              <span className="hidden sm:inline mx-2">/</span>
              <span className="text-slate-900 dark:text-slate-100 font-semibold">
                {activeNavLabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {!firebaseUser && (
              <div className="lg:hidden">
                <GoogleSignInButton
                  onClick={handleGoogleSignIn}
                  label="Sign in"
                  compact
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => setTourOpen(true)}
              aria-label="Onboarding Guide"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Onboarding Guide</span>
            </button>

            <button
              type="button"
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {authNotice && (
            <div className="mb-4 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200">
              {authNotice}
            </div>
          )}

          {loading ? (
            <div className="space-y-4">
              <div className="h-24 rounded-xl bg-slate-200/70 dark:bg-slate-800/70 animate-pulse" />
              <div className="h-64 rounded-xl bg-slate-200/70 dark:bg-slate-800/70 animate-pulse" />
            </div>
          ) : (
            <>
              {activeTab === 'checkin' && (
                <CheckInPortal
                  today={today}
                  compliance={globalComplianceToday}
                  dispatches={dispatches}
                  staff={staff}
                  backendMode={backendMode}
                  firebaseUser={firebaseUser}
                  onCheckInSuccess={(rec) => {
                    if (backendMode !== 'firebase') {
                      setAttendance((prev) => [rec, ...prev]);
                    }
                    if (backendMode === 'express') {
                      void fetchExpressBootstrap();
                    }
                  }}
                  onPasscodeDispatched={(dispatch) => {
                    if (backendMode !== 'firebase') {
                      setDispatches((prev) => [dispatch, ...prev]);
                    }
                  }}
                />
              )}

              {activeTab === 'dashboard' && activeUser && (
                <DashboardView
                  today={today}
                  activeUser={activeUser}
                  records={attendance}
                  linkedSheet={linkedSheet}
                  sheetsConnected={Boolean(sheetsAccessToken)}
                  onSyncGoogleSheet={() => setPendingSheetAction('sync')}
                  onOpenGoogleSheetsSetup={() => {
                    if (activePerms?.canManageVault) {
                      setActiveTab('vault');
                    }
                  }}
                  onRecordAudit={handleRecordAudit}
                />
              )}

              {activeTab === 'rbac' && activeUser && activePerms?.canManageRbac && (
                <RbacAccessView
                  activeUser={activeUser}
                  staff={staff}
                  backendMode={backendMode}
                  firebaseUser={firebaseUser}
                  onStaffUpdated={(updated) => {
                    if (backendMode !== 'firebase') {
                      setStaff((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
                    }
                  }}
                  onStaffCreated={(created) => {
                    if (backendMode !== 'firebase') {
                      setStaff((prev) => [...prev, created]);
                    }
                  }}
                />
              )}

              {activeTab === 'vault' && activeUser && activePerms?.canManageVault && (
                <VaultAndCloudView
                  activeUser={activeUser}
                  staff={staff}
                  attendanceCount={attendance.length}
                  backendMode={backendMode}
                  firebaseUser={firebaseUser}
                  sheetsConnected={Boolean(sheetsAccessToken)}
                  linkedSheet={linkedSheet}
                  sheetBusy={sheetBusy}
                  sheetNotice={sheetNotice}
                  onConnectGoogleSheets={handleGoogleSignIn}
                  onCreateGoogleSheet={() => setPendingSheetAction('create')}
                  onLinkGoogleSheet={handleLinkGoogleSheet}
                  onChangeSheetTab={(tab) => {
                    if (!linkedSheet) return;
                    const updated = { ...linkedSheet, attendanceTab: tab };
                    saveLinkedSheetConfig(updated);
                    setLinkedSheet(updated);
                  }}
                  onSyncGoogleSheet={() => setPendingSheetAction('sync')}
                  onPullGoogleSheet={handlePullGoogleSheet}
                  onUnlinkGoogleSheet={() => {
                    clearLinkedSheetConfig();
                    setLinkedSheet(null);
                    setSheetNotice(null);
                  }}
                  documents={documents}
                  connectors={connectors}
                  snapshots={snapshots}
                  onDocumentCreated={(docItem) => {
                    if (backendMode !== 'firebase') {
                      setDocuments((prev) => [docItem, ...prev]);
                    }
                  }}
                  onConnectorUpdated={(conn) => {
                    if (backendMode !== 'firebase') {
                      setConnectors((prev) => prev.map((c) => (c.id === conn.id ? conn : c)));
                    }
                  }}
                  onBackupCompleted={(snap) => {
                    if (backendMode !== 'firebase') {
                      setSnapshots((prev) => [snap, ...prev]);
                    }
                  }}
                  onRecordAudit={(action, resource, details, branch) =>
                    handleRecordAudit(action, resource, details, branch)
                  }
                />
              )}

              {activeTab === 'audit' && activeUser && activePerms?.canViewAuditLog && (
                <AuditComplianceView
                  today={today}
                  activeUser={activeUser}
                  records={attendance}
                  auditLogs={auditLogs}
                  onRecordAudit={(action, resource, details) =>
                    handleRecordAudit(action, resource, details)
                  }
                />
              )}

              {activeTab === 'api' && activeUser && activePerms?.canManageApiKeys && (
                <ApiIntegrationsView
                  activeUser={activeUser}
                  staff={staff}
                  attendanceCount={attendance.length}
                  auditCount={auditLogs.length}
                  backendMode={backendMode}
                  firebaseUser={firebaseUser}
                  apiKeys={apiKeys}
                  webhooks={webhooks}
                  onKeyCreated={(key) => {
                    if (backendMode !== 'firebase') {
                      setApiKeys((prev) => [key, ...prev]);
                    }
                  }}
                  onKeyRevoked={(revoked) => {
                    if (backendMode !== 'firebase') {
                      setApiKeys((prev) => prev.map((k) => (k.id === revoked.id ? revoked : k)));
                    }
                  }}
                  onWebhookCreated={(wh) => {
                    if (backendMode !== 'firebase') {
                      setWebhooks((prev) => [wh, ...prev]);
                    }
                  }}
                />
              )}
            </>
          )}
        </main>
      </div>

      <ConfirmSheetModal
        open={pendingSheetAction !== null}
        busy={sheetBusy}
        title={
          pendingSheetAction === 'create'
            ? 'Create CNA Google Sheet?'
            : 'Sync & Update Google Sheet?'
        }
        description={
          pendingSheetAction === 'create'
            ? 'This will create a new spreadsheet in your Google account and populate it with your current attendance, staff directory, and audit log.'
            : `This will update and overwrite the ${linkedSheet?.attendanceTab ?? 'Attendance'}, Staff, and AuditLog tabs inside "${linkedSheet?.title ?? 'your linked Google Sheet'}".`
        }
        details={[
          `${attendance.length} attendance check-in rows → "${linkedSheet?.attendanceTab ?? 'Attendance'}" tab`,
          `${staff.length} organizer/chapter staff records → "Staff" tab`,
          `${auditLogs.length} compliance audit entries → "AuditLog" tab`,
        ]}
        confirmLabel={
          pendingSheetAction === 'create'
            ? 'Confirm & Create Sheet'
            : 'Confirm & Update Sheet'
        }
        onConfirm={handleConfirmSheetMutation}
        onCancel={() => {
          if (!sheetBusy) setPendingSheetAction(null);
        }}
      />

      <OnboardingTour
        open={tourOpen}
        isAuthorizedStaff={identity.isAuthorizedStaff}
        onClose={() => setTourOpen(false)}
        onNavigate={(tab) => setActiveTab(tab)}
      />
    </div>
  );
}

export default App;
