import React, { useState } from 'react';
import { ArrowRight, BookOpen, Check, X } from 'lucide-react';

interface OnboardingTourProps {
  open: boolean;
  isAuthorizedStaff: boolean;
  onClose: () => void;
  onNavigate: (tab: 'checkin' | 'dashboard' | 'rbac' | 'vault' | 'audit' | 'api') => void;
}

const TOUR_STEPS: Array<{
  title: string;
  targetTab: 'checkin' | 'dashboard' | 'rbac' | 'vault' | 'audit' | 'api';
  summary: string;
  checklist: string[];
}> = [
  {
    title: '01. Daily Protection Passcode & Email Dispatch',
    targetTab: 'checkin',
    summary:
      'Prevent off-site check-ins with a rotating 6-digit daily passcode. Authorized organizers request the passcode right from the Check-In screen.',
    checklist: [
      'Click "Organizer: Request Passcode of the Day" on the Check-In screen.',
      'Enter an authorized organizer email from the CNA directory to receive today’s code.',
      'Members enter Name, Phone, Email once — cookies save their profile for future meetings.',
    ],
  },
  {
    title: '02. Real-Time Dashboard, Heatmap & PDF Reports',
    targetTab: 'dashboard',
    summary:
      'Signed-in organizers monitor live arrivals across California chapters with zero check-out friction, filter by branch, and export formatted PDFs.',
    checklist: [
      'Review KPIs, California geospatial heatmap, and chapter quorum bars.',
      'Use customized branch/date/search filters to isolate a specific session.',
      'Click "Export PDF Report", "Export CSV", or "Sync to Google Sheets".',
    ],
  },
  {
    title: '03. Google Sign-In Role Enforcement & Chapter Segregation',
    targetTab: 'rbac',
    summary:
      'Regular members only see Check-In. Chapter leads and Administrative Staff automatically receive permissions scoped to their verified Google email.',
    checklist: [
      'Visitors and regular members see only the Member Check-In kiosk.',
      'Union Reps, Unit Reps, and PPC Members see only their assigned regional branches.',
      'Administrative Staff manage role permissions and branch access in Roles & Branches.',
    ],
  },
  {
    title: '04. Google Sheets Live Sync & E2EE Document Vault',
    targetTab: 'vault',
    summary:
      'Connect your Google account to sync live attendance and audit logs to Google Sheets, and encrypt sensitive files locally with AES-256-GCM.',
    checklist: [
      'Create a new CNA Google Sheet or link an existing spreadsheet by URL.',
      'Sync attendance, staff directory, and audit history with explicit confirmation.',
      'Encrypt confidential PPC logs locally using PBKDF2-SHA256 + AES-256-GCM.',
    ],
  },
  {
    title: '05. Audit Ledger & Developer REST API',
    targetTab: 'audit',
    summary:
      'Every check-in, passcode dispatch, export, RBAC change, and cloud backup is recorded in an integrity-hashed audit log and exposed via REST API.',
    checklist: [
      'Inspect Audit & Compliance for cryptographic event trails and PDF compliance ledgers.',
      'Issue scoped API tokens and test live /api/v1 endpoints in the API Console.',
    ],
  },
];

export const OnboardingTour: React.FC<OnboardingTourProps> = ({
  open,
  isAuthorizedStaff,
  onClose,
  onNavigate,
}) => {
  const [stepIndex, setStepIndex] = useState(0);

  if (!open) return null;

  const step = TOUR_STEPS[stepIndex];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-xl rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-50">
            <BookOpen className="w-4 h-4 text-red-700 dark:text-red-400" />
            <span id="onboarding-title">Enterprise Onboarding Walkthrough</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close onboarding tutorial"
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center gap-1.5">
            {TOUR_STEPS.map((s, idx) => (
              <button
                key={s.title}
                type="button"
                aria-label={`Step ${idx + 1}`}
                onClick={() => setStepIndex(idx)}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  idx === stepIndex
                    ? 'bg-red-700 dark:bg-red-500'
                    : idx < stepIndex
                      ? 'bg-emerald-600'
                      : 'bg-slate-200 dark:bg-slate-800'
                }`}
              />
            ))}
          </div>

          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">{step.title}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1.5">{step.summary}</p>
          </div>

          <ul className="space-y-2.5 pt-2">
            {step.checklist.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300"
              >
                <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          {isAuthorizedStaff || step.targetTab === 'checkin' ? (
            <button
              type="button"
              onClick={() => {
                onNavigate(step.targetTab);
                onClose();
              }}
              className="text-xs font-semibold text-red-700 dark:text-red-400 hover:underline"
            >
              Open This Section Now
            </button>
          ) : (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Sign in as an authorized organizer to open this section.
            </span>
          )}

          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={() => setStepIndex((i) => i - 1)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                Previous
              </button>
            )}
            {stepIndex < TOUR_STEPS.length - 1 ? (
              <button
                type="button"
                onClick={() => setStepIndex((i) => i + 1)}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold"
              >
                Next Step <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold"
              >
                Finish Tutorial
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
