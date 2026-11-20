import React, { useMemo, useState } from 'react';
import { CheckCircle2, Download, FileCheck2, Lock, Search, ShieldAlert } from 'lucide-react';
import {
  AttendanceRecord,
  AuditLogEntry,
  StaffMember,
} from '../types/union';
import {
  computeBranchCompliance,
  getAccessibleBranches,
  getPermissionsForRole,
} from '../utils/rbac';
import { exportAuditCompliancePdf } from '../utils/pdfReport';

interface AuditComplianceViewProps {
  today: string;
  activeUser: StaffMember;
  records: AttendanceRecord[];
  auditLogs: AuditLogEntry[];
  onRecordAudit: (action: 'REPORT_EXPORTED', resource: string, details: string) => void;
}

export const AuditComplianceView: React.FC<AuditComplianceViewProps> = ({
  today,
  activeUser,
  records,
  auditLogs,
  onRecordAudit,
}) => {
  const perms = getPermissionsForRole(activeUser.role);
  const accessibleBranches = getAccessibleBranches(activeUser);
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const compliance = useMemo(
    () => computeBranchCompliance(records, today, accessibleBranches),
    [records, today, accessibleBranches]
  );

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return auditLogs.filter((l) => {
      if (actionFilter !== 'ALL' && l.action !== actionFilter) return false;
      if (q) {
        const hay = `${l.actorName} ${l.actorEmail} ${l.action} ${l.resource} ${l.details}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [auditLogs, actionFilter, search]);

  const handleExportCompliancePdf = () => {
    const fileName = exportAuditCompliancePdf({
      logs: filteredLogs,
      compliance,
      activeUser,
    });
    onRecordAudit(
      'REPORT_EXPORTED',
      fileName,
      `Exported automated compliance & audit PDF (${filteredLogs.length} audit entries).`
    );
    setExportNotice(`Downloaded ${fileName}`);
    setTimeout(() => setExportNotice(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Automated Compliance Overview */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">
              Audit Logging &amp; Automated Compliance Reporting
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Cryptographically hashed activity log across check-ins, passcode dispatches, RBAC
              changes, encrypted vault access, and cloud backups.
            </p>
          </div>
          {perms.canExportPdf && (
            <button
              type="button"
              onClick={handleExportCompliancePdf}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 self-start"
            >
              <Download className="w-4 h-4" />
              Export Compliance &amp; Audit PDF
            </button>
          )}
        </div>

        {exportNotice && (
          <div className="mt-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 px-4 py-2.5 text-xs font-medium text-emerald-800 dark:text-emerald-200">
            {exportNotice}
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {compliance.map((c) => (
            <div
              key={c.branch}
              className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5 bg-slate-50/60 dark:bg-slate-950/50"
            >
              <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                {c.branch}
              </div>
              <div className="mt-2 font-mono text-lg font-bold tabular-nums text-slate-900 dark:text-slate-50">
                {c.compliancePercent}%
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs">
                {c.quorumMet ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Quorum Met
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium">
                    <FileCheck2 className="w-3.5 h-3.5" /> {c.checkedInToday}/{c.quorumTarget} Logged
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Audit Trail */}
      {!perms.canViewAuditLog ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-sm text-amber-800 dark:text-amber-200 flex items-center gap-2.5">
          <Lock className="w-4 h-4 shrink-0" />
          Audit log inspection is restricted to Administrative Staff and Union Representatives.
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <label htmlFor="audit-search" className="sr-only">
                Search audit log
              </label>
              <input
                id="audit-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search actor, resource, or details..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
            </div>

            <select
              aria-label="Filter by audit event type"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              <option value="ALL">All Security &amp; File Events ({auditLogs.length})</option>
              <option value="MEMBER_CHECKIN">MEMBER_CHECKIN</option>
              <option value="ATTENDANCE_DELETED">ATTENDANCE_DELETED</option>
              <option value="PASSCODE_REQUESTED">PASSCODE_REQUESTED</option>
              <option value="PASSCODE_REJECTED">PASSCODE_REJECTED</option>
              <option value="DOCUMENT_ENCRYPTED">DOCUMENT_ENCRYPTED</option>
              <option value="DOCUMENT_DECRYPTED">DOCUMENT_DECRYPTED</option>
              <option value="DRIVE_BACKUP_SYNCED">DRIVE_BACKUP_SYNCED</option>
              <option value="CLOUD_SYNC_EXECUTED">CLOUD_SYNC_EXECUTED</option>
              <option value="REPORT_EXPORTED">REPORT_EXPORTED</option>
              <option value="RBAC_UPDATED">RBAC_UPDATED</option>
              <option value="RBAC_DELETED">RBAC_DELETED</option>
              <option value="API_KEY_CREATED">API_KEY_CREATED</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-4">Event</th>
                  <th className="py-2.5 px-4">Actor &amp; Role</th>
                  <th className="py-2.5 px-4">Branch</th>
                  <th className="py-2.5 px-4">Resource &amp; Details</th>
                  <th className="py-2.5 px-4 text-right">Integrity Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-semibold whitespace-nowrap">
                      <span
                        className={
                          log.action === 'PASSCODE_REJECTED'
                            ? 'text-red-700 dark:text-red-400 inline-flex items-center gap-1'
                            : 'text-slate-900 dark:text-slate-100'
                        }
                      >
                        {log.action === 'PASSCODE_REJECTED' && (
                          <ShieldAlert className="w-3.5 h-3.5" />
                        )}
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {log.actorName}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400">
                        {log.actorRole} · {log.actorEmail}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {log.branch}
                    </td>
                    <td className="py-2.5 px-4 max-w-md">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {log.resource}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400">{log.details}</div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-500 whitespace-nowrap">
                      {log.integrityHash.slice(0, 12)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
