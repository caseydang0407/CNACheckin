import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { unionStore, getTodayDateKey } from './server/store';
import {
  computeBranchCompliance,
  filterAttendanceForUser,
  getAccessibleBranches,
  getPermissionsForRole,
} from './src/utils/rbac';
import { RegionalBranch } from './src/types/union';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '4mb' }));

  // Helper to resolve active acting user from header or default admin
  function resolveActor(req: express.Request) {
    const actorId = req.header('x-actor-id');
    const state = unionStore.getState();
    if (actorId) {
      const found = state.staff.find((s) => s.id === actorId);
      if (found) return found;
    }
    return state.staff[0];
  }

  // Health endpoint
  app.get('/api/v1/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'cna-union-checkin-api',
      today: getTodayDateKey(),
      timestamp: new Date().toISOString(),
    });
  });

  // Real-time Server-Sent Events stream
  app.get('/api/v1/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    res.write(`event: connected\ndata: ${JSON.stringify({ today: getTodayDateKey() })}\n\n`);

    const unsubscribe = unionStore.subscribe((evt) => {
      res.write(`event: ${evt.type}\ndata: ${JSON.stringify(evt.payload)}\n\n`);
    });

    const keepAlive = setInterval(() => {
      res.write(`: ping\n\n`);
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  });

  // Bootstrap state (respects actor RBAC scope for sensitive subsets where appropriate)
  app.get('/api/v1/bootstrap', (req, res) => {
    const actor = resolveActor(req);
    const state = unionStore.getState();
    const today = getTodayDateKey();
    const perms = getPermissionsForRole(actor.role);
    const allowedBranches = getAccessibleBranches(actor);

    const scopedAttendance = filterAttendanceForUser(state.attendance, actor, {
      branch: 'All Branches',
      dateKey: 'ALL',
    });

    const scopedDocuments = perms.canManageVault
      ? state.documents.filter((d) => allowedBranches.includes(d.branch))
      : [];

    const scopedAudit = perms.canViewAuditLog
      ? state.auditLogs.filter(
          (l) => l.branch === 'All Branches' || allowedBranches.includes(l.branch as RegionalBranch)
        )
      : [];

    res.json({
      today,
      staff: state.staff,
      attendance: scopedAttendance,
      passcodeDispatches: state.passcodeDispatches.slice(0, 15),
      auditLogs: scopedAudit,
      documents: scopedDocuments,
      cloudConnectors: state.cloudConnectors,
      backupSnapshots: state.backupSnapshots,
      apiKeys: perms.canManageApiKeys ? state.apiKeys : [],
      webhooks: perms.canManageApiKeys ? state.webhooks : [],
      complianceToday: computeBranchCompliance(state.attendance, today, allowedBranches),
    });
  });

  // Passcode of the Day Request (verifies email in database and dispatches code)
  app.post('/api/v1/passcode/request', (req, res) => {
    const { email, branch } = req.body as { email?: string; branch?: RegionalBranch | 'All Branches' };
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Administrator email is required.' });
    }
    const dispatch = unionStore.requestDailyPasscode(email, branch ?? 'All Branches');
    if (dispatch.status === 'Rejected') {
      return res.status(403).json({
        status: 'Rejected',
        error: dispatch.reason,
        dispatch,
      });
    }
    return res.json({
      status: 'Dispatched',
      message: `Daily passcode sent to ${dispatch.requestedByEmail}.`,
      dispatch,
    });
  });

  // Member Check-In (Check-in only, no check-out)
  app.post('/api/v1/attendance/checkin', (req, res) => {
    const result = unionStore.recordCheckIn(req.body);
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
    return res.status(201).json({ record: result.record });
  });

  // REST API: Attendance query (for dashboard + third-party API sync)
  app.get('/api/v1/attendance', (req, res) => {
    const actor = resolveActor(req);
    const state = unionStore.getState();
    const branch = (req.query.branch as RegionalBranch | 'All Branches' | undefined) ?? 'All Branches';
    const dateKey = (req.query.date as string | undefined) ?? 'ALL';
    const search = (req.query.q as string | undefined) ?? '';

    const filtered = filterAttendanceForUser(state.attendance, actor, { branch, dateKey, search });
    return res.json({
      count: filtered.length,
      branchScope: getAccessibleBranches(actor),
      records: filtered,
    });
  });

  app.delete('/api/v1/attendance/:id', (req, res) => {
    const actor = resolveActor(req);
    const perms = getPermissionsForRole(actor.role);
    if (!perms.canDeleteAttendance) {
      return res.status(403).json({ error: 'Only Administrative Staff can delete roster entries.' });
    }
    const deletedCount = unionStore.deleteAttendanceRecords(actor, [req.params.id]);
    if (deletedCount === 0) {
      return res.status(404).json({ error: 'Attendance record not found.' });
    }
    return res.json({ deletedCount, deletedIds: [req.params.id] });
  });

  app.post('/api/v1/attendance/bulk-delete', (req, res) => {
    const actor = resolveActor(req);
    const perms = getPermissionsForRole(actor.role);
    if (!perms.canDeleteAttendance) {
      return res.status(403).json({ error: 'Only Administrative Staff can delete roster entries.' });
    }
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]) : [];
    const deletedCount = unionStore.deleteAttendanceRecords(actor, ids);
    return res.json({ deletedCount, deletedIds: ids });
  });

  // REST API: Compliance summary
  app.get('/api/v1/reports/compliance', (req, res) => {
    const actor = resolveActor(req);
    const state = unionStore.getState();
    const dateKey = (req.query.date as string | undefined) ?? getTodayDateKey();
    const allowedBranches = getAccessibleBranches(actor);
    const summary = computeBranchCompliance(state.attendance, dateKey, allowedBranches);
    return res.json({
      dateKey,
      generatedAt: new Date().toISOString(),
      branches: summary,
    });
  });

  // Audit Log endpoint + client-initiated export/decrypt audit recording
  app.get('/api/v1/audit-logs', (req, res) => {
    const actor = resolveActor(req);
    const perms = getPermissionsForRole(actor.role);
    if (!perms.canViewAuditLog) {
      return res.status(403).json({ error: 'Role does not have permission to view audit logs.' });
    }
    const allowedBranches = getAccessibleBranches(actor);
    const logs = unionStore
      .getState()
      .auditLogs.filter(
        (l) => l.branch === 'All Branches' || allowedBranches.includes(l.branch as RegionalBranch)
      );
    return res.json({ count: logs.length, logs });
  });

  app.post('/api/v1/audit-logs', (req, res) => {
    const actor = resolveActor(req);
    const { action, resource, details, branch } = req.body;
    const entry = unionStore.appendAudit({
      actorName: actor.name,
      actorEmail: actor.email,
      actorRole: actor.role,
      branch: branch ?? 'All Branches',
      action,
      resource,
      details,
    });
    return res.status(201).json({ entry });
  });

  // RBAC Staff Management
  app.patch('/api/v1/staff/:id', (req, res) => {
    const actor = resolveActor(req);
    const perms = getPermissionsForRole(actor.role);
    if (!perms.canManageRbac) {
      return res.status(403).json({ error: 'Only Administrative Staff can modify RBAC assignments.' });
    }
    const updated = unionStore.updateStaffMember(actor, req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Staff member not found.' });
    return res.json({ staff: updated });
  });

  app.post('/api/v1/staff', (req, res) => {
    const actor = resolveActor(req);
    const perms = getPermissionsForRole(actor.role);
    if (!perms.canManageRbac) {
      return res.status(403).json({ error: 'Only Administrative Staff can provision staff accounts.' });
    }
    const created = unionStore.addStaffMember(actor, req.body);
    return res.status(201).json({ staff: created });
  });

  app.delete('/api/v1/staff/:id', (req, res) => {
    const actor = resolveActor(req);
    const perms = getPermissionsForRole(actor.role);
    if (!perms.canManageRbac) {
      return res.status(403).json({ error: 'Only Administrative Staff can remove staff accounts.' });
    }
    if (actor.id === req.params.id) {
      return res.status(400).json({ error: 'You cannot delete your own active admin account.' });
    }
    const removed = unionStore.deleteStaffMember(actor, req.params.id);
    if (!removed) return res.status(404).json({ error: 'Staff member not found.' });
    return res.json({ deleted: removed });
  });

  // Encrypted Vault Documents
  app.post('/api/v1/documents', (req, res) => {
    const actor = resolveActor(req);
    const perms = getPermissionsForRole(actor.role);
    if (!perms.canManageVault) {
      return res.status(403).json({ error: 'Role cannot upload encrypted documents.' });
    }
    const created = unionStore.addEncryptedDocument(actor, {
      ...req.body,
      uploadedBy: actor.name,
    });
    return res.status(201).json({ document: created });
  });

  // Cloud Storage Connectors & Backups
  app.patch('/api/v1/backups/connectors/:id', (req, res) => {
    const actor = resolveActor(req);
    const perms = getPermissionsForRole(actor.role);
    if (!perms.canManageCloudBackups) {
      return res.status(403).json({ error: 'Insufficient permission to manage cloud connectors.' });
    }
    const updated = unionStore.updateCloudConnector(actor, req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Connector not found.' });
    return res.json({ connector: updated });
  });

  app.post('/api/v1/backups/sync', (req, res) => {
    const actor = resolveActor(req);
    const perms = getPermissionsForRole(actor.role);
    if (!perms.canManageCloudBackups) {
      return res.status(403).json({ error: 'Insufficient permission to trigger cloud backups.' });
    }
    const { provider, branchScope } = req.body;
    const snapshot = unionStore.triggerCloudBackup(
      actor,
      provider ?? 'Google Drive',
      branchScope ?? 'All Branches'
    );
    return res.status(201).json({ snapshot });
  });

  // API Keys & Webhooks
  app.post('/api/v1/integrations/keys', (req, res) => {
    const actor = resolveActor(req);
    const perms = getPermissionsForRole(actor.role);
    if (!perms.canManageApiKeys) {
      return res.status(403).json({ error: 'Only Administrative Staff can create API keys.' });
    }
    const result = unionStore.createApiKey(actor, req.body);
    return res.status(201).json(result);
  });

  app.delete('/api/v1/integrations/keys/:id', (req, res) => {
    const actor = resolveActor(req);
    const perms = getPermissionsForRole(actor.role);
    if (!perms.canManageApiKeys) {
      return res.status(403).json({ error: 'Only Administrative Staff can revoke API keys.' });
    }
    const revoked = unionStore.revokeApiKey(actor, req.params.id);
    if (!revoked) return res.status(404).json({ error: 'API key not found.' });
    return res.json({ key: revoked });
  });

  app.post('/api/v1/integrations/webhooks', (req, res) => {
    const actor = resolveActor(req);
    const perms = getPermissionsForRole(actor.role);
    if (!perms.canManageApiKeys) {
      return res.status(403).json({ error: 'Only Administrative Staff can register webhooks.' });
    }
    const { name, url, events } = req.body;
    const webhook = unionStore.addWebhook(name, url, events ?? ['attendance.checkin']);
    return res.status(201).json({ webhook });
  });

  // Vite middleware in dev, static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CNA Union Check-In Server listening on http://localhost:${PORT}`);
  });
}

startServer();
