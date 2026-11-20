import React, { useState } from 'react';
import { Code2, Copy, KeyRound, Lock, Play, Plus, Trash2, Webhook } from 'lucide-react';
import {
  ApiKeyRecord,
  REGIONAL_BRANCHES,
  RegionalBranch,
  StaffMember,
  WebhookConfig,
} from '../types/union';
import { getPermissionsForRole } from '../utils/rbac';

interface ApiIntegrationsViewProps {
  activeUser: StaffMember;
  apiKeys: ApiKeyRecord[];
  webhooks: WebhookConfig[];
  onKeyCreated: (key: ApiKeyRecord) => void;
  onKeyRevoked: (key: ApiKeyRecord) => void;
  onWebhookCreated: (wh: WebhookConfig) => void;
}

const API_ENDPOINTS = [
  { label: 'GET /api/v1/attendance', path: '/api/v1/attendance' },
  { label: 'GET /api/v1/reports/compliance', path: '/api/v1/reports/compliance' },
  { label: 'GET /api/v1/audit-logs', path: '/api/v1/audit-logs' },
  { label: 'GET /api/v1/health', path: '/api/v1/health' },
];

export const ApiIntegrationsView: React.FC<ApiIntegrationsViewProps> = ({
  activeUser,
  apiKeys,
  webhooks,
  onKeyCreated,
  onKeyRevoked,
  onWebhookCreated,
}) => {
  const perms = getPermissionsForRole(activeUser.role);

  const [keyLabel, setKeyLabel] = useState('');
  const [branchScope, setBranchScope] = useState<RegionalBranch | 'All Branches'>('All Branches');
  const [newRawSecret, setNewRawSecret] = useState<string | null>(null);

  const [whName, setWhName] = useState('');
  const [whUrl, setWhUrl] = useState('');

  const [selectedEndpoint, setSelectedEndpoint] = useState(API_ENDPOINTS[0].path);
  const [apiResponse, setApiResponse] = useState<string>('');
  const [apiStatus, setApiStatus] = useState<number | null>(null);
  const [runningTest, setRunningTest] = useState(false);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyLabel.trim()) return;
    const res = await fetch('/api/v1/integrations/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-actor-id': activeUser.id,
      },
      body: JSON.stringify({
        label: keyLabel.trim(),
        scopes: ['attendance:read', 'reports:read', 'backups:sync'],
        branchScope,
      }),
    });
    const data = await res.json();
    if (res.ok && data.record) {
      onKeyCreated(data.record);
      setNewRawSecret(data.rawSecret);
      setKeyLabel('');
    }
  };

  const handleRevokeKey = async (id: string) => {
    const res = await fetch(`/api/v1/integrations/keys/${id}`, {
      method: 'DELETE',
      headers: { 'x-actor-id': activeUser.id },
    });
    const data = await res.json();
    if (res.ok && data.key) {
      onKeyRevoked(data.key);
    }
  };

  const handleAddWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whName.trim() || !whUrl.trim()) return;
    const res = await fetch('/api/v1/integrations/webhooks', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-actor-id': activeUser.id,
      },
      body: JSON.stringify({
        name: whName.trim(),
        url: whUrl.trim(),
        events: ['attendance.checkin', 'backup.completed'],
      }),
    });
    const data = await res.json();
    if (res.ok && data.webhook) {
      onWebhookCreated(data.webhook);
      setWhName('');
      setWhUrl('');
    }
  };

  const handleExecuteApiTest = async () => {
    setRunningTest(true);
    try {
      const res = await fetch(selectedEndpoint, {
        headers: { 'x-actor-id': activeUser.id },
      });
      setApiStatus(res.status);
      const json = await res.json();
      setApiResponse(JSON.stringify(json, null, 2));
    } finally {
      setRunningTest(false);
    }
  };

  const curlSnippet = `curl -X GET "${typeof window !== 'undefined' ? window.location.origin : 'https://cna-union.example.org'}${selectedEndpoint}" \\\n  -H "Authorization: Bearer ${apiKeys[0]?.prefix ?? 'cna_live_token'}_..." \\\n  -H "Content-Type: application/json"`;

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">
          Enterprise Developer API &amp; Third-Party Synchronization
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Issue branch-scoped API tokens, configure real-time webhooks, and test live REST
          endpoints for automated union reporting and cloud workflows.
        </p>
      </div>

      {!perms.canManageApiKeys ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-sm text-amber-800 dark:text-amber-200 flex items-center gap-2.5">
          <Lock className="w-4 h-4 shrink-0" />
          API token provisioning and webhook management require Administrative Staff permissions.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* API Keys */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-red-700 dark:text-red-400" />
              Scoped API Tokens ({apiKeys.length})
            </h2>

            <form onSubmit={handleCreateKey} className="flex flex-wrap gap-2">
              <input
                type="text"
                required
                value={keyLabel}
                onChange={(e) => setKeyLabel(e.target.value)}
                placeholder="Integration label (e.g. Payroll Sync)"
                className="flex-1 min-w-[180px] px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
              <select
                aria-label="API Key Branch Scope"
                value={branchScope}
                onChange={(e) =>
                  setBranchScope(e.target.value as RegionalBranch | 'All Branches')
                }
                className="px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                <option value="All Branches">All Branches</option>
                {REGIONAL_BRANCHES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-3.5 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold"
              >
                <Plus className="w-3.5 h-3.5" /> Issue Key
              </button>
            </form>

            {newRawSecret && (
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 p-3 text-xs">
                <div className="font-semibold text-emerald-900 dark:text-emerald-200">
                  Copy your new API secret (shown once):
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2 font-mono text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded border border-emerald-200 dark:border-emerald-800">
                  <span className="truncate">{newRawSecret}</span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(newRawSecret)}
                    className="text-emerald-700 dark:text-emerald-400 font-semibold shrink-0"
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}

            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {apiKeys.map((k) => (
                <div key={k.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {k.label}{' '}
                      {!k.active && (
                        <span className="text-red-700 dark:text-red-400">(Revoked)</span>
                      )}
                    </div>
                    <div className="font-mono text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {k.tokenPreview} · {k.branchScope}
                    </div>
                  </div>
                  {k.active && (
                    <button
                      type="button"
                      onClick={() => handleRevokeKey(k.id)}
                      aria-label={`Revoke ${k.label}`}
                      className="p-1.5 text-slate-500 hover:text-red-700 dark:hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Webhooks */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Webhook className="w-4 h-4 text-red-700 dark:text-red-400" />
              Outbound Event Webhooks ({webhooks.length})
            </h2>

            <form onSubmit={handleAddWebhook} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <input
                type="text"
                required
                value={whName}
                onChange={(e) => setWhName(e.target.value)}
                placeholder="Webhook Name"
                className="sm:col-span-4 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
              <input
                type="url"
                required
                value={whUrl}
                onChange={(e) => setWhUrl(e.target.value)}
                placeholder="https://hooks.example.org/cna"
                className="sm:col-span-6 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              />
              <button
                type="submit"
                className="sm:col-span-2 px-3 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold"
              >
                Add
              </button>
            </form>

            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {webhooks.map((wh) => (
                <div key={wh.id} className="py-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {wh.name}
                    </span>
                    <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                      Active
                    </span>
                  </div>
                  <div className="font-mono text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    {wh.url}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                    Events: {wh.events.join(', ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Live API Explorer */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Code2 className="w-4 h-4 text-red-700 dark:text-red-400" />
            Live REST API v1 Explorer
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Select API Endpoint"
              value={selectedEndpoint}
              onChange={(e) => setSelectedEndpoint(e.target.value)}
              className="px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              {API_ENDPOINTS.map((ep) => (
                <option key={ep.path} value={ep.path}>
                  {ep.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleExecuteApiTest}
              disabled={runningTest}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold"
            >
              <Play className="w-3.5 h-3.5" />
              {runningTest ? 'Running...' : 'Execute Request'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                cURL Example
              </span>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(curlSnippet)}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-700"
              >
                <Copy className="w-3.5 h-3.5" /> Copy
              </button>
            </div>
            <pre className="text-[11px] font-mono text-slate-700 dark:text-slate-300 overflow-x-auto">
              {curlSnippet}
            </pre>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Live Response
              </span>
              {apiStatus !== null && (
                <span className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  HTTP {apiStatus}
                </span>
              )}
            </div>
            <pre className="text-[11px] font-mono text-slate-700 dark:text-slate-300 max-h-56 overflow-auto">
              {apiResponse || 'Click "Execute Request" to inspect live JSON output from /api/v1.'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
