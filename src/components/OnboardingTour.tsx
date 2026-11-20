import React, { useState } from 'react';
import { ArrowRight, BookOpen, Check, X } from 'lucide-react';

interface OnboardingTourProps {
  open: boolean;
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
      'Enter a verified database email (e.g. caseydang0407@gmail.com or organizer@calnurses.org).',
      'Members enter Name, Phone, Email once — cookies save their profile for future meetings.',
    ],
  },
  {
    title: '02. Real-Time Dashboard & PDF Reports',
    targetTab: 'dashboard',
    summary:
      'Monitor live arrivals across California chapters with zero check-out friction. Filter by branch, date, or keyword and export formatted PDFs.',
    checklist: [
      'Review KPIs, branch quorum bars, and hourly check-in velocity.',
      'Use customized branch/date/search filters to isolate a specific session.',
      'Click "Export PDF Report" or "Export CSV" for immediate union distribution.',
    ],
  },
  {
    title: '03. Role-Based Access & Branch Segregation',
    targetTab: 'rbac',
    summary:
      'Enforce strict data segregation across Administrative Staff, Union Reps, Unit Reps, and PPC Members across all 5 California branches.',
    checklist: [
      'Use the Role Switcher in the top workspace bar to preview each permission scope.',
      'Assign regional branches (San Francisco, Sacramento, Los Angeles, Irvine, San Diego).',
      'Control which team members are eligible to request daily meeting passcodes.',
    ],
  },
  {
    title: '04. AES-256-GCM Encrypted Vault & Google Drive Backups',
    targetTab: 'vault',
    summary:
      'Encrypt confidential PPC logs and bargaining minutes locally in your browser before cloud storage, and sync snapshots to Google Drive.',
    checklist: [
      'Encrypt documents locally using PBKDF2-SHA256 + AES-256-GCM.',
      'Link your Google account (caseydang0407@gmail.com) and run Drive backups.',
      'Review Firebase Firestore security rules & GitHub Pages deployment YAML.',
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
