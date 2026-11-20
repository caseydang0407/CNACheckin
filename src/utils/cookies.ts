import {
  CHECKIN_ROLES,
  CheckInRole,
  MEETING_TYPES,
  MeetingType,
  MemberCookieProfile,
  REGIONAL_BRANCHES,
  RegionalBranch,
} from '../types/union';

const COOKIE_NAME = 'cna_member_profile';
const STORAGE_KEY = 'cna_member_profile_v1';
const THEME_KEY = 'cna_theme_mode';

export function saveMemberProfileCookie(profile: MemberCookieProfile): void {
  const payload = encodeURIComponent(JSON.stringify(profile));
  const maxAgeSeconds = 60 * 60 * 24 * 180; // 180 days
  if (typeof document !== 'undefined') {
    document.cookie = `${COOKIE_NAME}=${payload}; max-age=${maxAgeSeconds}; path=/; SameSite=Lax`;
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch {
      // ignore storage quota failures
    }
  }
}

export function loadMemberProfileCookie(): MemberCookieProfile | null {
  try {
    if (typeof document !== 'undefined' && document.cookie) {
      const pairs = document.cookie.split(';').map((c) => c.trim());
      const match = pairs.find((p) => p.startsWith(`${COOKIE_NAME}=`));
      if (match) {
        const raw = decodeURIComponent(match.slice(COOKIE_NAME.length + 1));
        const parsed = JSON.parse(raw) as Partial<MemberCookieProfile>;
        if (parsed.name && parsed.email && parsed.phone) {
          return normalizeProfile(parsed);
        }
      }
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<MemberCookieProfile>;
        if (parsed.name && parsed.email && parsed.phone) {
          return normalizeProfile(parsed);
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function clearMemberProfileCookie(): void {
  if (typeof document !== 'undefined') {
    document.cookie = `${COOKIE_NAME}=; max-age=0; path=/; SameSite=Lax`;
  }
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

function normalizeProfile(parsed: Partial<MemberCookieProfile>): MemberCookieProfile {
  const validBranch: RegionalBranch = REGIONAL_BRANCHES.includes(parsed.branch as RegionalBranch)
    ? (parsed.branch as RegionalBranch)
    : 'San Francisco';
  const validMeeting: MeetingType = MEETING_TYPES.includes(parsed.meetingTitle as MeetingType)
    ? (parsed.meetingTitle as MeetingType)
    : 'Union Rep Meeting';
  const validRole: CheckInRole = CHECKIN_ROLES.includes(parsed.memberRole as CheckInRole)
    ? (parsed.memberRole as CheckInRole)
    : 'Union Member (RN)';
  return {
    name: String(parsed.name ?? ''),
    phone: String(parsed.phone ?? ''),
    email: String(parsed.email ?? ''),
    branch: validBranch,
    unit: String(parsed.unit ?? 'Medical-Surgical'),
    meetingTitle: validMeeting,
    memberRole: validRole,
    savedAt: String(parsed.savedAt ?? new Date().toISOString()),
  };
}

export function loadThemePreference(): 'light' | 'dark' {
  if (typeof window !== 'undefined' && window.localStorage) {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') {
      return saved;
    }
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  }
  return 'light';
}

export function saveThemePreference(theme: 'light' | 'dark'): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
  }
}
