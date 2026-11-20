import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BookOpen,
  ClipboardCheck,
  Code2,
  FileLock2,
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
  RegionalBranch,
  StaffMember,
  WebhookConfig,
} from './types/union';
import { computeBranchCompliance } from './utils/rbac';
import { loadThemePreference, saveThemePreference } from './utils/cookies';
import { CheckInPortal } from './components/CheckInPortal';
import { DashboardView } from './components/DashboardView';
import { RbacAccessView } from './components/RbacAccessView';
import { VaultAndCloudView } from './components/VaultAndCloudView';
import { AuditComplianceView } from './components/AuditComplianceView';
import { ApiIntegrationsView } from './components/ApiIntegrationsView';
import { OnboardingTour } from './components/OnboardingTour';

type NavTab = 'checkin' | 'dashboard' | 'rbac' | 'vault' | 'audit' | 'api';

const NAV_ITEMS: Array<{ id: NavTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'checkin', label: 'Member Check-In', icon: ClipboardCheck },
  { id: 'dashboard', label: 'Attendance Analytics', icon: Activity },
  { id: 'rbac', label: 'Roles & Branches', icon: Users },
  { id: 'vault', label: 'Vault & Cloud Sync', icon: FileLock2 },
  { id: 'audit', label: 'Audit & Compliance', icon: ShieldCheck },
  { id: 'api', label: 'API & Webhooks', icon: Code2 },
];

export function App() {
  const [activeTab, setActiveTab] = useState<NavTab>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') return 'dashboard';
    }
    return 'checkin';
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => loadThemePreference());
  const [tourOpen, setTourOpen] = useState(false);

  const [today, setToday] = useState(() => new Date().toISOString().slice(0, 10));
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [activeUserId, setActiveUserId] = useState<string>('staff-1');
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

  const fetchBootstrap = useCallback(async (actorId: string) => {
    try {
      const res = await fetch('/api/v1/bootstrap', {
        headers: { 'x-actor-id': actorId },
      });
      if (!res.ok) return;
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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBootstrap(activeUserId);
  }, [activeUserId, fetchBootstrap]);

  // Real-time Server-Sent Events subscription
  useEffect(() => {
    const source = new EventSource('/api/v1/stream');
    source.addEventListener('attendance:new', () => {
      fetchBootstrap(activeUserId);
    });
    source.addEventListener('audit:new', () => {
      fetchBootstrap(activeUserId);
    });
    source.addEventListener('passcode:dispatched', () => {
      fetchBootstrap(activeUserId);
    });
    source.addEventListener('document:new', () => {
      fetchBootstrap(activeUserId);
    });
    source.addEventListener('backup:new', () => {
      fetchBootstrap(activeUserId);
    });
    source.addEventListener('staff:updated', () => {
      fetchBootstrap(activeUserId);
    });
    return () => {
      source.close();
    };
  }, [activeUserId, fetchBootstrap]);

  const activeUser: StaffMember = useMemo(() => {
    return (
      staff.find((s) => s.id === activeUserId) ??
      staff[0] ?? {
        id: 'staff-1',
        name: 'Elena Vance, RN',
        email: 'caseydang0407@gmail.com',
        role: 'Administrative Staff',
        assignedBranches: ['San Francisco', 'Sacramento', 'Los Angeles', 'Irvine', 'San Diego'],
        facility: 'CNA Statewide Operations',
        active: true,
        lastActiveAt: new Date().toISOString(),
        canReceivePasscode: true,
      }
    );
  }, [staff, activeUserId]);

  const globalComplianceToday = useMemo(
    () => computeBranchCompliance(attendance, today),
    [attendance, today]
  );

  const handleRecordAudit = async (
    action: 'REPORT_EXPORTED' | 'DOCUMENT_DECRYPTED',
    resource: string,
    details: string,
    branch: RegionalBranch | 'All Branches' = 'All Branches'
  ) => {
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
  };

  const activeNavLabel = NAV_ITEMS.find((n) => n.id === activeTab)?.label ?? 'Portal';

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
          {NAV_ITEMS.map((item) => {
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
        </nav>

        {/* Active Role / User Switcher */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center gap-3">
            {!avatarFailed ? (
              <img
                src="/src/assets/images/cna_lead_avatar_1795193812224.jpg"
                alt={activeUser.name}
                referrerPolicy="no-referrer"
                onError={() => setAvatarFailed(true)}
                className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-red-700 text-white flex items-center justify-center text-xs font-bold shrink-0">
                {activeUser.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                {activeUser.name}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {activeUser.role}
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="role-switcher-desktop"
              className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1"
            >
              Active Role &amp; Chapter View
            </label>
            <select
              id="role-switcher-desktop"
              value={activeUserId}
              onChange={(e) => setActiveUserId(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.role} — {s.name.split(',')[0]}
                </option>
              ))}
            </select>
          </div>
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
                {NAV_ITEMS.map((item) => {
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

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
              <label
                htmlFor="role-switcher-mobile"
                className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1"
              >
                Active Role View
              </label>
              <select
                id="role-switcher-mobile"
                value={activeUserId}
                onChange={(e) => setActiveUserId(e.target.value)}
                className="w-full px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.role} — {s.name.split(',')[0]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Breadcrumb on left, concise utility actions on right */}
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
            <button
              type="button"
              onClick={() => setTourOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Onboarding Guide</span>
              <span className="sm:hidden">Guide</span>
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
                  onCheckInSuccess={(rec) => {
                    setAttendance((prev) => [rec, ...prev]);
                    fetchBootstrap(activeUserId);
                  }}
                  onPasscodeDispatched={(dispatch) => {
                    setDispatches((prev) => [dispatch, ...prev]);
                  }}
                />
              )}

              {activeTab === 'dashboard' && (
                <DashboardView
                  today={today}
                  activeUser={activeUser}
                  records={attendance}
                  onRecordAudit={handleRecordAudit}
                />
              )}

              {activeTab === 'rbac' && (
                <RbacAccessView
                  activeUser={activeUser}
                  staff={staff}
                  onStaffUpdated={(updated) =>
                    setStaff((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
                  }
                  onStaffCreated={(created) => setStaff((prev) => [...prev, created])}
                />
              )}

              {activeTab === 'vault' && (
                <VaultAndCloudView
                  activeUser={activeUser}
                  documents={documents}
                  connectors={connectors}
                  snapshots={snapshots}
                  onDocumentCreated={(doc) => setDocuments((prev) => [doc, ...prev])}
                  onConnectorUpdated={(conn) =>
                    setConnectors((prev) => prev.map((c) => (c.id === conn.id ? conn : c)))
                  }
                  onBackupCompleted={(snap) => setSnapshots((prev) => [snap, ...prev])}
                  onRecordAudit={(action, resource, details, branch) =>
                    handleRecordAudit(action, resource, details, branch)
                  }
                />
              )}

              {activeTab === 'audit' && (
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

              {activeTab === 'api' && (
                <ApiIntegrationsView
                  activeUser={activeUser}
                  apiKeys={apiKeys}
                  webhooks={webhooks}
                  onKeyCreated={(key) => setApiKeys((prev) => [key, ...prev])}
                  onKeyRevoked={(revoked) =>
                    setApiKeys((prev) => prev.map((k) => (k.id === revoked.id ? revoked : k)))
                  }
                  onWebhookCreated={(wh) => setWebhooks((prev) => [wh, ...prev])}
                />
              )}
            </>
          )}
        </main>
      </div>

      <OnboardingTour
        open={tourOpen}
        onClose={() => setTourOpen(false)}
        onNavigate={(tab) => setActiveTab(tab)}
      />
    </div>
  );
}

export default App;
