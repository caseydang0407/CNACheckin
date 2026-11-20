import {
  AttendanceRecord,
  ComplianceSummary,
  REGIONAL_BRANCHES,
  RegionalBranch,
  RolePermissions,
  StaffMember,
  UnionRole,
} from '../types/union';

export const BRANCH_QUORUM_TARGETS: Record<RegionalBranch, number> = {
  'San Francisco': 25,
  Sacramento: 20,
  'Los Angeles': 35,
  Irvine: 20,
  'San Diego': 25,
};

export function getPermissionsForRole(role: UnionRole): RolePermissions {
  switch (role) {
    case 'Administrative Staff':
      return {
        canViewAllBranches: true,
        canExportPdf: true,
        canExportCsv: true,
        canRequestPasscode: true,
        canManageRbac: true,
        canManageVault: true,
        canViewAuditLog: true,
        canManageCloudBackups: true,
        canManageApiKeys: true,
      };
    case 'Union Representative':
      return {
        canViewAllBranches: false,
        canExportPdf: true,
        canExportCsv: true,
        canRequestPasscode: true,
        canManageRbac: false,
        canManageVault: true,
        canViewAuditLog: true,
        canManageCloudBackups: true,
        canManageApiKeys: false,
      };
    case 'PPC Member':
      return {
        canViewAllBranches: false,
        canExportPdf: true,
        canExportCsv: true,
        canRequestPasscode: false,
        canManageRbac: false,
        canManageVault: true,
        canViewAuditLog: false,
        canManageCloudBackups: false,
        canManageApiKeys: false,
      };
    case 'Unit Representative':
      return {
        canViewAllBranches: false,
        canExportPdf: true,
        canExportCsv: false,
        canRequestPasscode: false,
        canManageRbac: false,
        canManageVault: false,
        canViewAuditLog: false,
        canManageCloudBackups: false,
        canManageApiKeys: false,
      };
  }
}

export function getAccessibleBranches(user: StaffMember): RegionalBranch[] {
  const perms = getPermissionsForRole(user.role);
  if (perms.canViewAllBranches) {
    return [...REGIONAL_BRANCHES];
  }
  return user.assignedBranches.length > 0 ? [...user.assignedBranches] : ['San Francisco'];
}

export function canAccessBranch(user: StaffMember, branch: RegionalBranch): boolean {
  return getAccessibleBranches(user).includes(branch);
}

export function filterAttendanceForUser(
  records: AttendanceRecord[],
  user: StaffMember,
  filters: {
    branch?: RegionalBranch | 'All Branches';
    dateKey?: string;
    search?: string;
  }
): AttendanceRecord[] {
  const allowedBranches = getAccessibleBranches(user);
  const query = (filters.search ?? '').trim().toLowerCase();

  return records.filter((rec) => {
    if (!allowedBranches.includes(rec.branch)) {
      return false;
    }
    if (filters.branch && filters.branch !== 'All Branches' && rec.branch !== filters.branch) {
      return false;
    }
    if (filters.dateKey && filters.dateKey !== 'ALL' && rec.dateKey !== filters.dateKey) {
      return false;
    }
    if (query) {
      const haystack = `${rec.name} ${rec.email} ${rec.phone} ${rec.unit} ${rec.branch} ${rec.meetingTitle} ${rec.memberRole}`.toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }
    return true;
  });
}

export function computeBranchCompliance(
  records: AttendanceRecord[],
  dateKey: string,
  allowedBranches: RegionalBranch[] = REGIONAL_BRANCHES
): ComplianceSummary[] {
  return allowedBranches.map((branch) => {
    const dayRecords = records.filter((r) => r.branch === branch && r.dateKey === dateKey);
    const target = BRANCH_QUORUM_TARGETS[branch];
    const count = dayRecords.length;
    const pct = Math.min(100, Math.round((count / target) * 100));
    const sorted = [...dayRecords].sort((a, b) => b.checkedInAt.localeCompare(a.checkedInAt));
    return {
      branch,
      checkedInToday: count,
      quorumTarget: target,
      quorumMet: count >= target,
      compliancePercent: pct,
      lastCheckInAt: sorted[0]?.checkedInAt ?? null,
    };
  });
}

export function generateDailyPasscode(dateKey: string, secretSalt = 'CNA-UNION-2026'): string {
  const input = `${dateKey}::${secretSalt}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const positive = Math.abs(hash) % 900000;
  return String(100000 + positive);
}

export function validatePasscodeFormat(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}

export function formatPhoneDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw.trim();
}
