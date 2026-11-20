import React, { useEffect, useState } from 'react';
import {
  Briefcase,
  Building2,
  CalendarDays,
  CheckCircle2,
  Cookie,
  KeyRound,
  Mail,
  Phone,
  Send,
  ShieldCheck,
  Trash2,
  User,
} from 'lucide-react';
import {
  AttendanceRecord,
  CHECKIN_ROLES,
  CheckInRole,
  ComplianceSummary,
  MEETING_TYPES,
  MeetingType,
  MemberCookieProfile,
  PasscodeDispatch,
  REGIONAL_BRANCHES,
  RegionalBranch,
} from '../types/union';
import {
  clearMemberProfileCookie,
  loadMemberProfileCookie,
  saveMemberProfileCookie,
} from '../utils/cookies';
import { formatPhoneDisplay, validatePasscodeFormat } from '../utils/rbac';
import { type User as FirebaseUser } from '../firebase';
import {
  submitCheckInFirebase,
  submitPasscodeRequestFirebase,
} from '../services/unionBackend';
import { StaffMember } from '../types/union';
import assemblyHallImg from '../assets/images/cna_assembly_hall_1795193812567.jpg';

interface CheckInPortalProps {
  today: string;
  compliance: ComplianceSummary[];
  dispatches: PasscodeDispatch[];
  staff: StaffMember[];
  backendMode: 'firebase' | 'express' | 'static';
  firebaseUser: FirebaseUser | null;
  onCheckInSuccess: (record: AttendanceRecord) => void;
  onPasscodeDispatched: (dispatch: PasscodeDispatch) => void;
}

export const CheckInPortal: React.FC<CheckInPortalProps> = ({
  today,
  compliance,
  dispatches,
  staff,
  backendMode,
  firebaseUser,
  onCheckInSuccess,
  onPasscodeDispatched,
}) => {
  const [passcode, setPasscode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [branch, setBranch] = useState<RegionalBranch>('San Francisco');
  const [unit, setUnit] = useState('Medical-Surgical');
  const [meetingTitle, setMeetingTitle] = useState<MeetingType>('Union Rep Meeting');
  const [memberRole, setMemberRole] = useState<CheckInRole>('Union Member (RN)');
  const [rememberDevice, setRememberDevice] = useState(true);

  const [cookieLoaded, setCookieLoaded] = useState<MemberCookieProfile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<AttendanceRecord | null>(null);

  // Passcode Request State
  const [showPasscodePanel, setShowPasscodePanel] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [requestBranch, setRequestBranch] = useState<RegionalBranch | 'All Branches'>('All Branches');
  const [requestingPasscode, setRequestingPasscode] = useState(false);
  const [passcodeNotice, setPasscodeNotice] = useState<{
    type: 'success' | 'error';
    text: string;
    dispatch?: PasscodeDispatch;
  } | null>(null);

  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    const saved = loadMemberProfileCookie();
    if (saved) {
      setCookieLoaded(saved);
      setName(saved.name);
      setPhone(saved.phone);
      setEmail(saved.email);
      setBranch(saved.branch);
      setUnit(saved.unit || 'Medical-Surgical');
      setMeetingTitle(saved.meetingTitle || 'Union Rep Meeting');
      setMemberRole(saved.memberRole || 'Union Member (RN)');
    } else if (firebaseUser) {
      if (firebaseUser.displayName) setName((prev) => prev || firebaseUser.displayName || '');
      if (firebaseUser.email) setEmail((prev) => prev || firebaseUser.email || '');
    }
  }, [firebaseUser]);

  const handleClearSavedCookie = () => {
    clearMemberProfileCookie();
    setCookieLoaded(null);
    setName('');
    setPhone('');
    setEmail('');
    setUnit('Medical-Surgical');
    setMeetingTitle('Union Rep Meeting');
    setMemberRole('Union Member (RN)');
  };

  const handleRequestPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasscodeNotice(null);
    if (!adminEmail.trim()) {
      setPasscodeNotice({
        type: 'error',
        text: 'Enter an authorized administrator or organizer email address.',
      });
      return;
    }

    setRequestingPasscode(true);
    try {
      if (backendMode === 'express') {
        const res = await fetch('/api/v1/passcode/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: adminEmail.trim(), branch: requestBranch }),
        });
        const data = await res.json();
        if (!res.ok) {
          setPasscodeNotice({
            type: 'error',
            text: data.error || 'Email is not authorized to receive today’s passcode.',
            dispatch: data.dispatch,
          });
          if (data.dispatch) onPasscodeDispatched(data.dispatch);
        } else {
          setPasscodeNotice({
            type: 'success',
            text: `Daily passcode dispatched to ${data.dispatch.requestedByEmail}.`,
            dispatch: data.dispatch,
          });
          onPasscodeDispatched(data.dispatch);
        }
      } else {
        const result = await submitPasscodeRequestFirebase({
          email: adminEmail.trim(),
          branch: requestBranch,
          staff,
          firebaseUser,
        });
        if (!result.ok) {
          setPasscodeNotice({
            type: 'error',
            text: result.error || 'Email is not authorized to receive today’s passcode.',
            dispatch: result.dispatch,
          });
          onPasscodeDispatched(result.dispatch);
        } else {
          setPasscodeNotice({
            type: 'success',
            text: `Daily passcode dispatched to ${result.dispatch.requestedByEmail}.`,
            dispatch: result.dispatch,
          });
          onPasscodeDispatched(result.dispatch);
        }
      }
    } catch {
      setPasscodeNotice({
        type: 'error',
        text: 'Unable to reach passcode verification server.',
      });
    } finally {
      setRequestingPasscode(false);
    }
  };

  const handleSubmitCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!validatePasscodeFormat(passcode)) {
      setErrorMsg('Enter the 6-digit protection passcode of the day.');
      return;
    }
    if (!name.trim() || !phone.trim() || !email.trim()) {
      setErrorMsg('Please complete your full name, phone number, and email address.');
      return;
    }

    setSubmitting(true);
    try {
      let createdRecord: AttendanceRecord | null = null;
      if (backendMode === 'express') {
        const res = await fetch('/api/v1/attendance/checkin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            passcode: passcode.trim(),
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim(),
            branch,
            unit: unit.trim(),
            meetingTitle,
            memberRole,
            rememberedDevice: rememberDevice,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error || 'Check-in rejected. Verify today’s passcode.');
          return;
        }
        createdRecord = data.record;
      } else {
        const result = await submitCheckInFirebase({
          passcode: passcode.trim(),
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          branch,
          unit: unit.trim(),
          meetingTitle,
          memberRole,
          rememberedDevice: rememberDevice,
          staff,
          firebaseUser,
        });
        if (!result.ok) {
          setErrorMsg(result.error);
          return;
        }
        createdRecord = result.record;
      }

      if (rememberDevice) {
        const profile: MemberCookieProfile = {
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          branch,
          unit: unit.trim(),
          meetingTitle,
          memberRole,
          savedAt: new Date().toISOString(),
        };
        saveMemberProfileCookie(profile);
        setCookieLoaded(profile);
      } else {
        clearMemberProfileCookie();
        setCookieLoaded(null);
      }

      if (createdRecord) {
        setReceipt(createdRecord);
        onCheckInSuccess(createdRecord);
      }
    } catch {
      setErrorMsg('Network error submitting check-in. Please retry.');
    } finally {
      setSubmitting(false);
    }
  };

  const latestDispatched = dispatches.find((d) => d.status === 'Dispatched' && d.dateKey === today);
  const totalCheckedInToday = compliance.reduce((sum, c) => sum + c.checkedInToday, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
      {/* Left: Primary Member Check-In Form */}
      <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 flex flex-col justify-between">
        <div>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
            <div className="min-w-0">
              <p className="text-xs font-medium text-red-700 dark:text-red-400">
                California Nurses Association · Daily Assembly Log
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 mt-1">
                In-Person Meeting Check-In
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
                Log your attendance for {today}. Check-in only — no check-out is required.
              </p>
            </div>
            <div className="sm:text-right font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
              <div>Session Date</div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                {today}
              </div>
            </div>
          </div>

          {cookieLoaded && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm">
              <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-200">
                <Cookie className="w-4 h-4 text-red-700 dark:text-red-400 shrink-0" />
                <span>
                  Welcome back, <strong>{cookieLoaded.name}</strong> · saved details pre-filled for{' '}
                  {cookieLoaded.branch}
                </span>
              </div>
              <button
                type="button"
                onClick={handleClearSavedCookie}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-red-700 dark:hover:text-red-400 transition-colors whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear saved info
              </button>
            </div>
          )}

          {receipt ? (
            <div
              data-testid="checkin-receipt"
              className="mt-6 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-6"
            >
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
                    Attendance Confirmed
                  </h2>
                  <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">
                    <strong>{receipt.name}</strong> ({receipt.memberRole}) is logged for{' '}
                    <strong>{receipt.meetingTitle}</strong> at the{' '}
                    <strong>{receipt.branch}</strong> chapter. You do not need to check out when
                    leaving.
                  </p>
                  <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs border-t border-emerald-200 dark:border-emerald-900/60 pt-4">
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">Email &amp; Phone</dt>
                      <dd className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                        {receipt.email} · {formatPhoneDisplay(receipt.phone)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">Timestamp &amp; Verification</dt>
                      <dd className="font-mono text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
                        {new Date(receipt.checkedInAt).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}{' '}
                        · #{receipt.verificationHash.slice(0, 10)}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-5">
                    <button
                      type="button"
                      onClick={() => {
                        setReceipt(null);
                        setErrorMsg(null);
                      }}
                      className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white transition-colors"
                    >
                      Check In Another Member
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmitCheckIn} className="mt-6 space-y-5">
              {/* Protection Passcode Row */}
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <label
                    htmlFor="daily-passcode"
                    className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100"
                  >
                    <KeyRound className="w-4 h-4 text-red-700 dark:text-red-400" />
                    Meeting Protection Passcode
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPasscodePanel((v) => !v)}
                    aria-expanded={showPasscodePanel}
                    className="text-xs font-semibold text-red-700 dark:text-red-400 hover:underline whitespace-nowrap shrink-0"
                  >
                    {showPasscodePanel
                      ? 'Hide Passcode Request'
                      : 'Organizer: Request Passcode of the Day'}
                  </button>
                </div>

                <input
                  id="daily-passcode"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="Enter 6-digit passcode"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-mono text-base tracking-widest placeholder:font-sans placeholder:text-sm placeholder:tracking-normal focus:outline-none focus:ring-2 focus:ring-red-600"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                  On-site verification prevents remote check-ins from outside the meeting hall.
                </p>

                {showPasscodePanel && (
                  <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Enter an authorized chapter administrator or organizer email registered in the
                      database. If matched, today’s passcode will be dispatched immediately.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                      <div className="sm:col-span-6">
                        <label htmlFor="admin-passcode-email" className="sr-only">
                          Authorized Organizer Email
                        </label>
                        <input
                          id="admin-passcode-email"
                          type="email"
                          value={adminEmail}
                          onChange={(e) => setAdminEmail(e.target.value)}
                          placeholder="organizer@calnurses.org"
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-600"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <label htmlFor="request-branch" className="sr-only">
                          Branch Scope
                        </label>
                        <select
                          id="request-branch"
                          value={requestBranch}
                          onChange={(e) =>
                            setRequestBranch(e.target.value as RegionalBranch | 'All Branches')
                          }
                          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-600"
                        >
                          <option value="All Branches">All Branches</option>
                          {REGIONAL_BRANCHES.map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sm:col-span-3">
                        <button
                          type="button"
                          onClick={handleRequestPasscode}
                          disabled={requestingPasscode}
                          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white disabled:opacity-50 transition-colors whitespace-nowrap"
                        >
                          <Send className="w-3.5 h-3.5" />
                          {requestingPasscode ? 'Sending...' : 'Email Code'}
                        </button>
                      </div>
                    </div>

                    {passcodeNotice && (
                      <div
                        data-testid="passcode-dispatch-result"
                        className={`rounded-lg px-3.5 py-2.5 text-xs border ${
                          passcodeNotice.type === 'success'
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200'
                            : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-900 dark:text-red-200'
                        }`}
                      >
                        <div className="font-semibold">{passcodeNotice.text}</div>
                        {passcodeNotice.dispatch?.status === 'Dispatched' && (
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-emerald-200 dark:border-emerald-800/60">
                            <span>
                              Email Relay Preview · Passcode of the Day:{' '}
                              <strong className="font-mono text-sm">
                                {passcodeNotice.dispatch.passcode}
                              </strong>
                            </span>
                            <button
                              type="button"
                              onClick={() => setPasscode(passcodeNotice.dispatch!.passcode)}
                              className="px-2.5 py-1 rounded bg-emerald-700 text-white font-semibold hover:bg-emerald-800 transition-colors"
                            >
                              Apply Code
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Member Identity Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="member-name"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      id="member-name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Elena Martinez, RN"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-red-600"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="member-phone"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      id="member-phone"
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(415) 555-0194"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-red-600"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="member-email"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <input
                      id="member-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nurse@hospital.org"
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-red-600"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="member-meeting"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Meeting Session
                  </label>
                  <div className="relative">
                    <CalendarDays className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <select
                      id="member-meeting"
                      value={meetingTitle}
                      onChange={(e) => setMeetingTitle(e.target.value as MeetingType)}
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-red-600"
                    >
                      {MEETING_TYPES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="member-role"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Union Role
                  </label>
                  <div className="relative">
                    <Briefcase className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <select
                      id="member-role"
                      value={memberRole}
                      onChange={(e) => setMemberRole(e.target.value as CheckInRole)}
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-red-600"
                    >
                      {CHECKIN_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="member-branch"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Regional Chapter Branch
                  </label>
                  <div className="relative">
                    <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                    <select
                      id="member-branch"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value as RegionalBranch)}
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-red-600"
                    >
                      {REGIONAL_BRANCHES.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="member-unit"
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Nursing Unit / Facility
                  </label>
                  <input
                    id="member-unit"
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="e.g. Adult ICU, Telemetry"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-red-600"
                  />
                </div>
              </div>

              <label className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-red-700 focus:ring-red-600"
                />
                <span>
                  Remember my name, phone, email, and chapter in a browser cookie so I don’t have
                  to re-enter them at my next union meeting.
                </span>
              </label>

              {errorMsg && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-sm text-red-800 dark:text-red-200"
                >
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-6 rounded-lg bg-red-700 hover:bg-red-800 text-white font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {submitting ? 'Logging Attendance...' : 'Complete Daily Check-In'}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Right: Chapter Hall Visual & Live Regional Attendance Snapshot */}
      <aside className="lg:col-span-5 flex flex-col gap-6">
        <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 min-h-[240px]">
          {!imageFailed ? (
            <img
              src={assemblyHallImg}
              alt="California Nurses Association sunlit regional chapter assembly hall"
              referrerPolicy="no-referrer"
              onError={() => setImageFailed(true)}
              className="w-full h-60 object-cover"
            />
          ) : (
            <div className="w-full h-60 bg-gradient-to-br from-slate-800 to-slate-950 flex items-center justify-center">
              <ShieldCheck className="w-12 h-12 text-red-500" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent flex flex-col justify-end p-5">
            <p className="text-xs font-medium text-red-300">
              Statewide Chapter Assemblies · Live Attendance
            </p>
            <h2 className="text-lg font-bold text-white mt-0.5">
              {totalCheckedInToday} Nurses Checked In Today
            </h2>
            <p className="text-xs text-slate-200 mt-1">
              San Francisco · Sacramento · Los Angeles · Irvine · San Diego
            </p>
          </div>
        </div>

        <div className="flex-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Regional Chapter Quorum Progress
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Real-time check-in counts updated automatically as members sign in.
            </p>

            <div className="mt-4 space-y-3.5">
              {compliance.map((c) => (
                <div key={c.branch}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {c.branch}
                    </span>
                    <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {c.checkedInToday} / {c.quorumTarget} ({c.compliancePercent}%)
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        c.quorumMet ? 'bg-emerald-600' : 'bg-red-700 dark:bg-red-500'
                      }`}
                      style={{ width: `${Math.max(4, c.compliancePercent)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {latestDispatched && (
            <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
              <span>Last passcode email dispatched</span>
              <span className="font-mono text-slate-900 dark:text-slate-200">
                {firebaseUser ? latestDispatched.requestedByEmail : 'Verified Chapter Organizer'}
              </span>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};
