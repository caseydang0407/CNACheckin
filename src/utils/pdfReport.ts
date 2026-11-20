import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  AttendanceRecord,
  AuditLogEntry,
  ComplianceSummary,
  RegionalBranch,
  StaffMember,
} from '../types/union';
import { formatPhoneDisplay } from './rbac';

export function exportAttendancePdfReport(params: {
  records: AttendanceRecord[];
  compliance: ComplianceSummary[];
  activeUser: StaffMember;
  branchFilter: RegionalBranch | 'All Branches';
  dateFilter: string;
}): string {
  const { records, compliance, activeUser, branchFilter, dateFilter } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
  const generatedAt = new Date().toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  // Header Band
  doc.setFillColor(153, 27, 27); // CNA Union Crimson #991B1B
  doc.rect(0, 0, 612, 74, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('California Nurses Association (CNA)', 36, 30);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Official Union Meeting Attendance & Compliance Report', 36, 48);
  doc.text(`Generated: ${generatedAt}`, 405, 30);
  doc.text(`Scope: ${branchFilter} · Date: ${dateFilter}`, 405, 48);

  // Meta Summary
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(9.5);
  doc.text(
    `Prepared By: ${activeUser.name} (${activeUser.role}) — ${activeUser.email}`,
    36,
    98
  );
  doc.text(
    `Total Checked-In Members in Scope: ${records.length}  |  Check-In Only Policy (No Check-Out Required)`,
    36,
    114
  );

  // Chapter Compliance Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Regional Branch Compliance Summary', 36, 142);

  autoTable(doc, {
    startY: 150,
    head: [['Regional Branch', 'Checked In', 'Quorum Target', 'Compliance %', 'Status']],
    body: compliance.map((c) => [
      c.branch,
      String(c.checkedInToday),
      String(c.quorumTarget),
      `${c.compliancePercent}%`,
      c.quorumMet ? 'Quorum Met' : 'In Progress',
    ]),
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    margin: { left: 36, right: 36 },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 260;

  // Attendance Roster Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Verified Member Check-In Roster', 36, finalY + 24);

  autoTable(doc, {
    startY: finalY + 32,
    head: [['Member Name', 'Role', 'Meeting', 'Branch', 'Unit', 'Phone', 'Check-In']],
    body:
      records.length > 0
        ? records.map((r) => [
            r.name,
            r.memberRole,
            r.meetingTitle,
            r.branch,
            r.unit,
            formatPhoneDisplay(r.phone),
            new Date(r.checkedInAt).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
            }),
          ])
        : [['No records matching current filter', '-', '-', '-', '-', '-', '-']],
    styles: { fontSize: 7.8, cellPadding: 4 },
    headStyles: { fillColor: [153, 27, 27], textColor: 255 },
    margin: { left: 36, right: 36 },
  });

  const fileName = `CNA-Attendance-Report-${branchFilter.replace(/\s+/g, '-')}-${dateFilter}.pdf`;
  doc.save(fileName);
  return fileName;
}

export function exportAuditCompliancePdf(params: {
  logs: AuditLogEntry[];
  compliance: ComplianceSummary[];
  activeUser: StaffMember;
}): string {
  const { logs, compliance, activeUser } = params;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const generatedAt = new Date().toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 792, 64, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('California Nurses Association — Security Audit & Compliance Ledger', 36, 28);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Exported By: ${activeUser.name} (${activeUser.role}) · ${generatedAt}`, 36, 46);

  autoTable(doc, {
    startY: 82,
    head: [['Branch', 'Checked In Today', 'Quorum Target', 'Compliance', 'Quorum Status']],
    body: compliance.map((c) => [
      c.branch,
      String(c.checkedInToday),
      String(c.quorumTarget),
      `${c.compliancePercent}%`,
      c.quorumMet ? 'Compliant' : 'Pending Quorum',
    ]),
    styles: { fontSize: 8.5, cellPadding: 4 },
    headStyles: { fillColor: [153, 27, 27], textColor: 255 },
    margin: { left: 36, right: 36 },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 200;

  autoTable(doc, {
    startY: finalY + 20,
    head: [['Timestamp', 'Actor', 'Role', 'Branch', 'Action', 'Resource', 'Details']],
    body: logs.slice(0, 40).map((l) => [
      new Date(l.timestamp).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      l.actorName,
      l.actorRole,
      l.branch,
      l.action,
      l.resource,
      l.details,
    ]),
    styles: { fontSize: 7.8, cellPadding: 3.5 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255 },
    margin: { left: 36, right: 36 },
  });

  const fileName = `CNA-Audit-Compliance-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
  return fileName;
}

export function exportAttendanceCsv(records: AttendanceRecord[], filenamePrefix = 'cna-attendance'): string {
  const headers = ['ID', 'Name', 'Role', 'Meeting', 'Phone', 'Email', 'Branch', 'Unit', 'Date', 'CheckedInAt', 'VerificationHash'];
  const escape = (val: string) => `"${val.replace(/"/g, '""')}"`;
  const rows = records.map((r) =>
    [r.id, r.name, r.memberRole, r.meetingTitle, r.phone, r.email, r.branch, r.unit, r.dateKey, r.checkedInAt, r.verificationHash]
      .map(escape)
      .join(',')
  );
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const fileName = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  return fileName;
}
