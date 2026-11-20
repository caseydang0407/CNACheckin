import React, { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Lock, Search } from 'lucide-react';
import {
  AttendanceRecord,
  ComplianceSummary,
  REGIONAL_BRANCHES,
  RegionalBranch,
  StaffMember,
} from '../types/union';
import {
  computeBranchCompliance,
  filterAttendanceForUser,
  formatPhoneDisplay,
  getAccessibleBranches,
  getPermissionsForRole,
} from '../utils/rbac';
import { exportAttendanceCsv, exportAttendancePdfReport } from '../utils/pdfReport';
import { RegionalHeatmap } from './RegionalHeatmap';

interface DashboardViewProps {
  today: string;
  activeUser: StaffMember;
  records: AttendanceRecord[];
  onRecordAudit: (action: 'REPORT_EXPORTED', resource: string, details: string, branch?: RegionalBranch | 'All Branches') => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  today,
  activeUser,
  records,
  onRecordAudit,
}) => {
  const perms = getPermissionsForRole(activeUser.role);
  const accessibleBranches = getAccessibleBranches(activeUser);

  const [branchFilter, setBranchFilter] = useState<RegionalBranch | 'All Branches'>('All Branches');
  const [dateFilter, setDateFilter] = useState<string>(today);
  const [search, setSearch] = useState('');
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  // Ensure selected branch stays within accessible scope when switching roles
  const effectiveBranchFilter: RegionalBranch | 'All Branches' =
    branchFilter !== 'All Branches' && !accessibleBranches.includes(branchFilter)
      ? 'All Branches'
      : branchFilter;

  const filteredRecords = useMemo(
    () =>
      filterAttendanceForUser(records, activeUser, {
        branch: effectiveBranchFilter,
        dateKey: dateFilter,
        search,
      }),
    [records, activeUser, effectiveBranchFilter, dateFilter, search]
  );

  const complianceSummary: ComplianceSummary[] = useMemo(
    () =>
      computeBranchCompliance(
        records,
        dateFilter === 'ALL' ? today : dateFilter,
        effectiveBranchFilter === 'All Branches' ? accessibleBranches : [effectiveBranchFilter]
      ),
    [records, dateFilter, today, accessibleBranches, effectiveBranchFilter]
  );

  const mapComplianceSummary: ComplianceSummary[] = useMemo(() => {
    if (dateFilter === 'ALL') {
      const normalized = records.map((r) => ({ ...r, dateKey: 'ALL' }));
      return computeBranchCompliance(normalized, 'ALL', accessibleBranches);
    }
    return computeBranchCompliance(records, dateFilter, accessibleBranches);
  }, [records, dateFilter, accessibleBranches]);

  const uniqueDates = useMemo(() => {
    const set = new Set<string>([today]);
    records.forEach((r) => set.add(r.dateKey));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [records, today]);

  const totalCheckedIn = filteredRecords.length;
  const quorumMetCount = complianceSummary.filter((c) => c.quorumMet).length;
  const avgCompliance =
    complianceSummary.length > 0
      ? Math.round(
          complianceSummary.reduce((acc, c) => acc + c.compliancePercent, 0) /
            complianceSummary.length
        )
      : 0;
  const latestRecord = filteredRecords[0];

  // Hourly velocity buckets (06:00 - 20:00)
  const hourlyBuckets = useMemo(() => {
    const buckets = Array.from({ length: 12 }, (_, i) => ({
      hour: i + 7, // 7 AM to 6 PM
      label: `${i + 7 > 12 ? i + 7 - 12 : i + 7}${i + 7 >= 12 ? 'p' : 'a'}`,
      count: 0,
    }));
    filteredRecords.forEach((r) => {
      const hr = new Date(r.checkedInAt).getHours();
      const idx = buckets.findIndex((b) => b.hour === hr);
      if (idx >= 0) {
        buckets[idx].count += 1;
      } else if (hr < 7) {
        buckets[0].count += 1;
      } else {
        buckets[buckets.length - 1].count += 1;
      }
    });
    return buckets;
  }, [filteredRecords]);

  const maxHourly = Math.max(1, ...hourlyBuckets.map((b) => b.count));

  const handleExportPdf = () => {
    const fileName = exportAttendancePdfReport({
      records: filteredRecords,
      compliance: complianceSummary,
      activeUser,
      branchFilter: effectiveBranchFilter,
      dateFilter,
    });
    onRecordAudit(
      'REPORT_EXPORTED',
      fileName,
      `Exported PDF attendance report (${filteredRecords.length} records, scope: ${effectiveBranchFilter}).`,
      effectiveBranchFilter
    );
    setExportMessage(`Downloaded ${fileName}`);
    setTimeout(() => setExportMessage(null), 4000);
  };

  const handleExportCsv = () => {
    const fileName = exportAttendanceCsv(filteredRecords);
    onRecordAudit(
      'REPORT_EXPORTED',
      fileName,
      `Exported CSV attendance roster (${filteredRecords.length} records).`,
      effectiveBranchFilter
    );
    setExportMessage(`Downloaded ${fileName}`);
    setTimeout(() => setExportMessage(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Scope & Export Toolbar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">
              Real-Time Attendance &amp; Chapter Analytics
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Viewing data as <strong>{activeUser.role}</strong> · Branch Access:{' '}
              {accessibleBranches.length === REGIONAL_BRANCHES.length
                ? 'All 5 California Chapters'
                : accessibleBranches.join(', ')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {perms.canExportCsv && (
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Export CSV
              </button>
            )}
            {perms.canExportPdf ? (
              <button
                type="button"
                onClick={handleExportPdf}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4" />
                Export PDF Report
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Lock className="w-3.5 h-3.5" />
                PDF export restricted
              </span>
            )}
          </div>
        </div>

        {exportMessage && (
          <div className="mt-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 px-3.5 py-2 text-xs font-medium text-emerald-800 dark:text-emerald-200">
            {exportMessage}
          </div>
        )}

        {/* Filter Controls */}
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <label htmlFor="dashboard-search" className="sr-only">
              Search attendees
            </label>
            <input
              id="dashboard-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by member name, email, phone, or unit..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-600"
            />
          </div>

          <div className="sm:col-span-4">
            <label htmlFor="dashboard-branch-filter" className="sr-only">
              Regional Branch Filter
            </label>
            <select
              id="dashboard-branch-filter"
              value={effectiveBranchFilter}
              onChange={(e) =>
                setBranchFilter(e.target.value as RegionalBranch | 'All Branches')
              }
              disabled={accessibleBranches.length === 1}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-red-600"
            >
              {accessibleBranches.length > 1 && (
                <option value="All Branches">All Accessible Branches ({accessibleBranches.length})</option>
              )}
              {accessibleBranches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3">
            <label htmlFor="dashboard-date-filter" className="sr-only">
              Session Date Filter
            </label>
            <select
              id="dashboard-date-filter"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-600"
            >
              <option value="ALL">All Recorded Dates</option>
              {uniqueDates.map((d) => (
                <option key={d} value={d}>
                  {d === today ? `Today (${d})` : d}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Verified Check-Ins
          </div>
          <div
            data-testid="kpi-checked-in"
            className="text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-50 mt-2"
          >
            {totalCheckedIn}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {dateFilter === 'ALL' ? 'Across all dates' : `Session ${dateFilter}`}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Branches at Quorum
          </div>
          <div className="text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-50 mt-2">
            {quorumMetCount} / {complianceSummary.length}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Chapter attendance threshold
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Average Compliance Rate
          </div>
          <div className="text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-50 mt-2">
            {avgCompliance}%
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Scoped regional target
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Latest Check-In
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-50 mt-2">
            {latestRecord
              ? new Date(latestRecord.checkedInAt).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '—'}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
            {latestRecord ? `${latestRecord.name} · ${latestRecord.branch}` : 'No entries yet'}
          </div>
        </div>
      </div>

      {/* D3 Geospatial Attendance Heatmap */}
      <RegionalHeatmap
        compliance={mapComplianceSummary}
        accessibleBranches={accessibleBranches}
        selectedBranch={effectiveBranchFilter}
        onSelectBranch={(nextBranch) => setBranchFilter(nextBranch)}
      />

      {/* 2-Column Visualization Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Attendance by Regional Chapter
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Checked-in count vs. quorum target per branch
              </p>
            </div>
            <FileText className="w-4 h-4 text-slate-400" />
          </div>

          <div className="space-y-4">
            {complianceSummary.map((item) => (
              <div key={item.branch}>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {item.branch}
                  </span>
                  <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    {item.checkedInToday} / {item.quorumTarget} · {item.compliancePercent}%
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      item.quorumMet ? 'bg-emerald-600' : 'bg-red-700 dark:bg-red-500'
                    }`}
                    style={{ width: `${Math.max(3, item.compliancePercent)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Hourly Check-In Velocity
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Distribution of member arrivals across meeting hours
            </p>
          </div>

          <div className="mt-6 h-44 flex items-end gap-2">
            {hourlyBuckets.map((b) => {
              const heightPct = Math.round((b.count / maxHourly) * 100);
              return (
                <div key={b.hour} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                  <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                    {b.count > 0 ? b.count : ''}
                  </span>
                  <div className="w-full flex-1 flex items-end">
                    <div
                      title={`${b.label}: ${b.count} check-ins`}
                      className="w-full rounded-t bg-red-700/85 dark:bg-red-500/85 transition-all duration-300"
                      style={{ height: `${Math.max(4, heightPct)}%` }}
                    />
                  </div>
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                    {b.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Live Attendance Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Verified Member Check-In Roster ({filteredRecords.length})
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Check-in only · Cookies enabled for repeat visits
          </span>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              No attendance records match the selected filters.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Clear your search filter or switch to All Recorded Dates.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 font-semibold text-slate-600 dark:text-slate-300">
                  <th className="py-2.5 px-3">Member Name</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Meeting</th>
                  <th className="py-2.5 px-3">Chapter</th>
                  <th className="py-2.5 px-3">Unit</th>
                  <th className="py-2.5 px-3">Phone</th>
                  <th className="py-2.5 px-3">Email</th>
                  <th className="py-2.5 px-3 text-right">Checked In</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredRecords.map((rec) => (
                  <tr
                    key={rec.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {rec.name}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {rec.memberRole}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {rec.meetingTitle}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {rec.branch}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {rec.unit}
                    </td>
                    <td className="py-2.5 px-3 font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {formatPhoneDisplay(rec.phone)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {rec.email}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {rec.dateKey} ·{' '}
                      {new Date(rec.checkedInAt).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
