import { AttendanceRecord, AuditLogEntry, StaffMember } from '../types/union';
import {
  formatAttendanceSheetRows,
  formatAuditSheetRows,
  formatSingleAttendanceRow,
  formatStaffSheetRows,
  parseAttendanceSheetRows,
} from '../utils/googleSheetsHelpers';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const LINKED_SHEET_CONFIG_KEY = 'cna_linked_google_sheet_v1';

export interface LinkedGoogleSheetConfig {
  spreadsheetId: string;
  title: string;
  spreadsheetUrl: string;
  attendanceTab: string;
  availableTabs: string[];
  lastSyncedAt: string | null;
}

export function loadLinkedSheetConfig(): LinkedGoogleSheetConfig | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(LINKED_SHEET_CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LinkedGoogleSheetConfig;
    if (parsed && parsed.spreadsheetId && parsed.attendanceTab) {
      return parsed;
    }
  } catch {
    // ignore invalid local config
  }
  return null;
}

export function saveLinkedSheetConfig(config: LinkedGoogleSheetConfig): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(LINKED_SHEET_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // ignore quota errors
  }
}

export function clearLinkedSheetConfig(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(LINKED_SHEET_CONFIG_KEY);
  } catch {
    // ignore
  }
}

async function sheetsFetch<T>(
  url: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (data as { error?: { message?: string } })?.error?.message ||
      `Google Sheets request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

function encodeSheetRange(sheetTitle: string, cellRange: string): string {
  const escaped = `'${sheetTitle.replace(/'/g, "''")}'!${cellRange}`;
  return encodeURIComponent(escaped);
}

export async function inspectGoogleSheet(
  accessToken: string,
  spreadsheetId: string
): Promise<LinkedGoogleSheetConfig> {
  const data = await sheetsFetch<{
    spreadsheetId: string;
    spreadsheetUrl: string;
    properties?: { title?: string };
    sheets?: Array<{ properties?: { title?: string } }>;
  }>(
    `${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties.title`,
    accessToken
  );

  const tabs = (data.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => Boolean(t));

  const preferredAttendance =
    tabs.find((t) => t.toLowerCase() === 'attendance') ?? tabs[0] ?? 'Attendance';

  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title ?? 'CNA Union Spreadsheet',
    spreadsheetUrl:
      data.spreadsheetUrl ??
      `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
    attendanceTab: preferredAttendance,
    availableTabs: tabs.length > 0 ? tabs : [preferredAttendance],
    lastSyncedAt: null,
  };
}

export async function createCnaGoogleSheet(
  accessToken: string,
  title = 'CNA Union Attendance & Compliance'
): Promise<LinkedGoogleSheetConfig> {
  const data = await sheetsFetch<{
    spreadsheetId: string;
    spreadsheetUrl: string;
    properties?: { title?: string };
    sheets?: Array<{ properties?: { title?: string } }>;
  }>(SHEETS_API_BASE, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      properties: { title },
      sheets: [
        { properties: { title: 'Attendance', gridProperties: { frozenRowCount: 1 } } },
        { properties: { title: 'Staff', gridProperties: { frozenRowCount: 1 } } },
        { properties: { title: 'AuditLog', gridProperties: { frozenRowCount: 1 } } },
      ],
    }),
  });

  const tabs = (data.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => Boolean(t));

  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title ?? title,
    spreadsheetUrl:
      data.spreadsheetUrl ??
      `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`,
    attendanceTab: tabs[0] ?? 'Attendance',
    availableTabs: tabs.length > 0 ? tabs : ['Attendance', 'Staff', 'AuditLog'],
    lastSyncedAt: null,
  };
}

async function ensureTabsExist(
  accessToken: string,
  spreadsheetId: string,
  requiredTabs: string[]
): Promise<string[]> {
  const meta = await inspectGoogleSheet(accessToken, spreadsheetId);
  const missing = requiredTabs.filter((t) => !meta.availableTabs.includes(t));
  if (missing.length === 0) return meta.availableTabs;

  await sheetsFetch(`${SHEETS_API_BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, accessToken, {
    method: 'POST',
    body: JSON.stringify({
      requests: missing.map((title) => ({
        addSheet: {
          properties: {
            title,
            gridProperties: { frozenRowCount: 1 },
          },
        },
      })),
    }),
  });

  return [...meta.availableTabs, ...missing];
}

export async function syncWorkspaceToGoogleSheet(params: {
  accessToken: string;
  config: LinkedGoogleSheetConfig;
  attendance: AttendanceRecord[];
  staff: StaffMember[];
  auditLogs: AuditLogEntry[];
}): Promise<LinkedGoogleSheetConfig> {
  const { accessToken, config, attendance, staff, auditLogs } = params;
  const attendanceTab = config.attendanceTab;
  const availableTabs = await ensureTabsExist(accessToken, config.spreadsheetId, [
    attendanceTab,
    'Staff',
    'AuditLog',
  ]);

  const attRange = encodeSheetRange(attendanceTab, 'A:K');
  await sheetsFetch(
    `${SHEETS_API_BASE}/${encodeURIComponent(config.spreadsheetId)}/values/${attRange}:clear`,
    accessToken,
    { method: 'POST', body: '{}' }
  );
  await sheetsFetch(
    `${SHEETS_API_BASE}/${encodeURIComponent(config.spreadsheetId)}/values/${encodeSheetRange(attendanceTab, 'A1')}?valueInputOption=USER_ENTERED`,
    accessToken,
    {
      method: 'PUT',
      body: JSON.stringify({ values: formatAttendanceSheetRows(attendance) }),
    }
  );

  await sheetsFetch(
    `${SHEETS_API_BASE}/${encodeURIComponent(config.spreadsheetId)}/values/${encodeSheetRange('Staff', 'A:H')}:clear`,
    accessToken,
    { method: 'POST', body: '{}' }
  );
  await sheetsFetch(
    `${SHEETS_API_BASE}/${encodeURIComponent(config.spreadsheetId)}/values/${encodeSheetRange('Staff', 'A1')}?valueInputOption=USER_ENTERED`,
    accessToken,
    {
      method: 'PUT',
      body: JSON.stringify({ values: formatStaffSheetRows(staff) }),
    }
  );

  await sheetsFetch(
    `${SHEETS_API_BASE}/${encodeURIComponent(config.spreadsheetId)}/values/${encodeSheetRange('AuditLog', 'A:J')}:clear`,
    accessToken,
    { method: 'POST', body: '{}' }
  );
  await sheetsFetch(
    `${SHEETS_API_BASE}/${encodeURIComponent(config.spreadsheetId)}/values/${encodeSheetRange('AuditLog', 'A1')}?valueInputOption=USER_ENTERED`,
    accessToken,
    {
      method: 'PUT',
      body: JSON.stringify({ values: formatAuditSheetRows(auditLogs) }),
    }
  );

  return {
    ...config,
    availableTabs,
    lastSyncedAt: new Date().toISOString(),
  };
}

export async function appendCheckInToGoogleSheet(params: {
  accessToken: string;
  spreadsheetId: string;
  sheetTitle: string;
  record: AttendanceRecord;
}): Promise<void> {
  const range = encodeSheetRange(params.sheetTitle, 'A:K');
  await sheetsFetch(
    `${SHEETS_API_BASE}/${encodeURIComponent(params.spreadsheetId)}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    params.accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        values: [formatSingleAttendanceRow(params.record)],
      }),
    }
  );
}

export async function pullAttendanceFromGoogleSheet(params: {
  accessToken: string;
  spreadsheetId: string;
  sheetTitle: string;
}): Promise<AttendanceRecord[]> {
  const range = encodeSheetRange(params.sheetTitle, 'A1:K2000');
  const data = await sheetsFetch<{ values?: string[][] }>(
    `${SHEETS_API_BASE}/${encodeURIComponent(params.spreadsheetId)}/values/${range}`,
    params.accessToken
  );
  return parseAttendanceSheetRows(data.values ?? []);
}
