import React, { useState } from 'react';
import { Check, Lock, Pencil, Shield, Trash2, UserPlus, X } from 'lucide-react';
import {
  REGIONAL_BRANCHES,
  RegionalBranch,
  StaffMember,
  UNION_ROLES,
  UnionRole,
} from '../types/union';
import { getPermissionsForRole } from '../utils/rbac';
import { type User } from '../firebase';
import {
  createStaffFirebase,
  deleteStaffFirebase,
  updateStaffFirebase,
} from '../services/unionBackend';

interface RbacAccessViewProps {
  activeUser: StaffMember;
  staff: StaffMember[];
  backendMode: 'firebase' | 'express' | 'static';
  firebaseUser: User | null;
  onStaffUpdated: (updated: StaffMember) => void;
  onStaffCreated: (created: StaffMember) => void;
  onStaffDeleted: (memberId: string, removed: StaffMember) => void;
}

export const RbacAccessView: React.FC<RbacAccessViewProps> = ({
  activeUser,
  staff,
  backendMode,
  firebaseUser,
  onStaffUpdated,
  onStaffCreated,
  onStaffDeleted,
}) => {
  const perms = getPermissionsForRole(activeUser.role);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<UnionRole>('Unit Representative');
  const [newFacility, setNewFacility] = useState('');
  const [newBranches, setNewBranches] = useState<RegionalBranch[]>(['San Francisco']);
  const [newPasscodeAccess, setNewPasscodeAccess] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Edit member state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editFacility, setEditFacility] = useState('');
  const [editRole, setEditRole] = useState<UnionRole>('Unit Representative');
  const [editBranches, setEditBranches] = useState<RegionalBranch[]>(['San Francisco']);
  const [editActive, setEditActive] = useState(true);
  const [editPasscodeAccess, setEditPasscodeAccess] = useState(false);

  // Delete confirmation state
  const [confirmDeleteMember, setConfirmDeleteMember] = useState<StaffMember | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const toggleNewBranch = (branch: RegionalBranch) => {
    setNewBranches((prev) =>
      prev.includes(branch) ? (prev.length > 1 ? prev.filter((b) => b !== branch) : prev) : [...prev, branch]
    );
  };

  const toggleEditBranch = (branch: RegionalBranch) => {
    setEditBranches((prev) =>
      prev.includes(branch) ? (prev.length > 1 ? prev.filter((b) => b !== branch) : prev) : [...prev, branch]
    );
  };

  const startEditing = (member: StaffMember) => {
    setEditingId(member.id);
    setEditName(member.name);
    setEditEmail(member.email);
    setEditFacility(member.facility);
    setEditRole(member.role);
    setEditBranches([...member.assignedBranches]);
    setEditActive(member.active);
    setEditPasscodeAccess(member.canReceivePasscode);
    setNotice(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const handleUpdateMember = async (
    member: StaffMember,
    patch: Partial<
      Pick<
        StaffMember,
        'name' | 'email' | 'facility' | 'role' | 'assignedBranches' | 'active' | 'canReceivePasscode'
      >
    >
  ) => {
    setSavingId(member.id);
    setNotice(null);
    try {
      if (backendMode === 'express') {
        const res = await fetch(`/api/v1/staff/${member.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-actor-id': activeUser.id,
          },
          body: JSON.stringify(patch),
        });
        const data = await res.json();
        if (res.ok && data.staff) {
          onStaffUpdated(data.staff);
          setNotice(`Updated permissions for ${data.staff.name}. Logged to audit trail.`);
          if (editingId === member.id) setEditingId(null);
        } else {
          setNotice(data.error || 'Failed to update member.');
        }
      } else {
        if (backendMode === 'firebase' && firebaseUser) {
          await updateStaffFirebase({ memberId: member.id, patch });
        }
        const updated: StaffMember = { ...member, ...patch, lastActiveAt: new Date().toISOString() };
        onStaffUpdated(updated);
        setNotice(`Updated ${updated.name} (${updated.role}). Logged to audit trail.`);
        if (editingId === member.id) setEditingId(null);
      }
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent, member: StaffMember) => {
    e.preventDefault();
    if (!editName.trim() || !editEmail.trim()) return;
    await handleUpdateMember(member, {
      name: editName.trim(),
      email: editEmail.trim(),
      facility: editFacility.trim() || 'CNA Regional Chapter',
      role: editRole,
      assignedBranches: editBranches,
      active: editActive,
      canReceivePasscode: editPasscodeAccess,
    });
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteMember) return;
    const target = confirmDeleteMember;
    setDeletingId(target.id);
    setNotice(null);
    try {
      if (backendMode === 'express') {
        const res = await fetch(`/api/v1/staff/${target.id}`, {
          method: 'DELETE',
          headers: { 'x-actor-id': activeUser.id },
        });
        const data = await res.json();
        if (!res.ok) {
          setNotice(data.error || 'Unable to delete team member.');
          return;
        }
      } else if (backendMode === 'firebase' && firebaseUser) {
        await deleteStaffFirebase({
          member: target,
          actor: activeUser,
          staff,
        });
      }
      onStaffDeleted(target.id, target);
      if (editingId === target.id) setEditingId(null);
      setNotice(`Removed ${target.name} (${target.email}) from Roles & Branches.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Unable to delete team member.');
    } finally {
      setDeletingId(null);
      setConfirmDeleteMember(null);
    }
  };

  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim()) return;
    if (backendMode === 'express') {
      const res = await fetch('/api/v1/staff', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-actor-id': activeUser.id,
        },
        body: JSON.stringify({
          name: newName.trim(),
          email: newEmail.trim(),
          role: newRole,
          assignedBranches: newBranches,
          facility: newFacility.trim() || 'CNA Regional Chapter',
          canReceivePasscode: newPasscodeAccess,
        }),
      });
      const data = await res.json();
      if (res.ok && data.staff) {
        onStaffCreated(data.staff);
        setNewName('');
        setNewEmail('');
        setNewFacility('');
        setNotice(`Provisioned ${data.staff.name} (${data.staff.role}).`);
      } else {
        setNotice(data.error || 'Unable to provision staff user.');
      }
    } else {
      let created: StaffMember;
      if (backendMode === 'firebase' && firebaseUser) {
        created = await createStaffFirebase({
          user: firebaseUser,
          member: {
            name: newName.trim(),
            email: newEmail.trim(),
            role: newRole,
            assignedBranches: newBranches,
            facility: newFacility.trim() || 'CNA Regional Chapter',
            canReceivePasscode: newPasscodeAccess,
          },
        });
      } else {
        created = {
          id: `staff-${Date.now()}`,
          name: newName.trim(),
          email: newEmail.trim(),
          role: newRole,
          assignedBranches: newBranches,
          facility: newFacility.trim() || 'CNA Regional Chapter',
          active: true,
          lastActiveAt: new Date().toISOString(),
          canReceivePasscode: newPasscodeAccess,
        };
      }
      onStaffCreated(created);
      setNewName('');
      setNewEmail('');
      setNewFacility('');
      setNotice(`Provisioned ${created.name} (${created.role}).`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">
              Role-Based Access Control &amp; Chapter Segregation
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Granular organizational permissions across San Francisco, Sacramento, Los Angeles,
              Irvine, and San Diego chapters.
            </p>
          </div>
          {!perms.canManageRbac && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs font-medium text-amber-800 dark:text-amber-200">
              <Lock className="w-3.5 h-3.5" />
              Read-only view for {activeUser.role}
            </div>
          )}
        </div>

        {notice && (
          <div className="mt-4 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-xs font-medium text-slate-800 dark:text-slate-200">
            {notice}
          </div>
        )}

        {/* Role Permission Matrix */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 pr-4 font-semibold">Organizational Role</th>
                <th className="py-2.5 px-3 font-semibold">Cross-Branch Scope</th>
                <th className="py-2.5 px-3 font-semibold">PDF Export</th>
                <th className="py-2.5 px-3 font-semibold">Daily Passcode Email</th>
                <th className="py-2.5 px-3 font-semibold">E2EE Vault</th>
                <th className="py-2.5 px-3 font-semibold">Audit &amp; Cloud Sync</th>
                <th className="py-2.5 pl-3 font-semibold">Admin RBAC &amp; API</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {UNION_ROLES.map((role) => {
                const p = getPermissionsForRole(role);
                const cell = (allowed: boolean) =>
                  allowed ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                      <Check className="w-3.5 h-3.5" /> Allowed
                    </span>
                  ) : (
                    <span className="text-slate-400 dark:text-slate-600">Restricted</span>
                  );
                return (
                  <tr key={role}>
                    <td className="py-3 pr-4 font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {role}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {p.canViewAllBranches ? 'All 5 Chapters' : 'Assigned Only'}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">{cell(p.canExportPdf)}</td>
                    <td className="py-3 px-3 whitespace-nowrap">{cell(p.canRequestPasscode)}</td>
                    <td className="py-3 px-3 whitespace-nowrap">{cell(p.canManageVault)}</td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {cell(p.canViewAuditLog && p.canManageCloudBackups)}
                    </td>
                    <td className="py-3 pl-3 whitespace-nowrap">{cell(p.canManageRbac)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Team Directory & Branch Segregation Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-red-700 dark:text-red-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Authorized Chapter Leads &amp; Passcode Recipients ({staff.length})
            </h2>
          </div>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {staff.map((member) => {
            const isEditing = editingId === member.id;
            const isSelf =
              member.id === activeUser.id ||
              member.email.trim().toLowerCase() === activeUser.email.trim().toLowerCase();

            return (
              <div key={member.id} className="p-5 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                        {member.name}
                      </span>
                      {!member.active && (
                        <span className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                          Inactive
                        </span>
                      )}
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        · {member.email} · {member.facility}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {REGIONAL_BRANCHES.map((branch) => {
                        const assigned = member.assignedBranches.includes(branch);
                        return (
                          <button
                            key={branch}
                            type="button"
                            disabled={!perms.canManageRbac || savingId === member.id}
                            onClick={() => {
                              const next = assigned
                                ? member.assignedBranches.length > 1
                                  ? member.assignedBranches.filter((b) => b !== branch)
                                  : member.assignedBranches
                                : [...member.assignedBranches, branch];
                              handleUpdateMember(member, { assignedBranches: next });
                            }}
                            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                              assigned
                                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                            } disabled:cursor-default`}
                          >
                            {branch}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={member.canReceivePasscode}
                        disabled={!perms.canManageRbac || savingId === member.id}
                        onChange={(e) =>
                          handleUpdateMember(member, { canReceivePasscode: e.target.checked })
                        }
                        className="h-4 w-4 rounded border-slate-300 text-red-700 focus:ring-red-600"
                      />
                      Passcode Email Access
                    </label>

                    <select
                      aria-label={`Role for ${member.name}`}
                      value={member.role}
                      disabled={!perms.canManageRbac || savingId === member.id}
                      onChange={(e) =>
                        handleUpdateMember(member, { role: e.target.value as UnionRole })
                      }
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 disabled:opacity-60"
                    >
                      {UNION_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>

                    {perms.canManageRbac && (
                      <>
                        <button
                          type="button"
                          onClick={() => (isEditing ? cancelEditing() : startEditing(member))}
                          aria-label={`Edit ${member.name}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          {isEditing ? 'Close' : 'Edit'}
                        </button>

                        <button
                          type="button"
                          disabled={isSelf || deletingId === member.id}
                          title={
                            isSelf
                              ? 'Cannot delete your active admin account'
                              : `Delete ${member.name}`
                          }
                          aria-label={`Delete ${member.name}`}
                          onClick={() => setConfirmDeleteMember(member)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-red-900/70 text-xs font-semibold text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Inline Edit Panel */}
                {isEditing && perms.canManageRbac && (
                  <form
                    onSubmit={(e) => handleSaveEdit(e, member)}
                    className="rounded-lg bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        Edit Member Profile &amp; Permissions
                      </span>
                      <button
                        type="button"
                        onClick={cancelEditing}
                        className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 inline-flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        Cancel
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Full Name
                        </label>
                        <input
                          type="text"
                          required
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Email Address
                        </label>
                        <input
                          type="email"
                          required
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Hospital / Facility
                        </label>
                        <input
                          type="text"
                          required
                          value={editFacility}
                          onChange={(e) => setEditFacility(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                          Union Role
                        </label>
                        <select
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value as UnionRole)}
                          className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                        >
                          {UNION_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 mr-1">
                          Branches:
                        </span>
                        {REGIONAL_BRANCHES.map((b) => (
                          <button
                            key={b}
                            type="button"
                            onClick={() => toggleEditBranch(b)}
                            className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                              editBranches.includes(b)
                                ? 'bg-red-700 text-white'
                                : 'bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {b}
                          </button>
                        ))}
                      </div>

                      <div className="flex flex-wrap items-center gap-4">
                        <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={editActive}
                            onChange={(e) => setEditActive(e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-red-700"
                          />
                          Active Account
                        </label>

                        <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={editPasscodeAccess}
                            onChange={(e) => setEditPasscodeAccess(e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-red-700"
                          />
                          Passcode Access
                        </label>

                        <button
                          type="submit"
                          disabled={savingId === member.id}
                          className="px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold disabled:opacity-50"
                        >
                          {savingId === member.id ? 'Saving...' : 'Save Changes'}
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Staff Member Form (Admin Only) */}
      {perms.canManageRbac && (
        <form
          onSubmit={handleCreateMember}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-red-700 dark:text-red-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Provision New Chapter Representative or Staff Lead
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <input
              type="text"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Full Name, RN"
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
            <input
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="lead@calnurses.org"
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
            <select
              aria-label="New Staff Role"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as UnionRole)}
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            >
              {UNION_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newFacility}
              onChange={(e) => setNewFacility(e.target.value)}
              placeholder="Hospital / Facility"
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Branches:
              </span>
              {REGIONAL_BRANCHES.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => toggleNewBranch(b)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    newBranches.includes(b)
                      ? 'bg-red-700 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={newPasscodeAccess}
                  onChange={(e) => setNewPasscodeAccess(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-red-700"
                />
                Allow daily passcode requests
              </label>

              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold transition-colors whitespace-nowrap"
              >
                Add Team Member
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Confirm Delete Staff Modal */}
      {confirmDeleteMember && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-staff-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
        >
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 id="delete-staff-title" className="text-sm font-bold text-slate-900 dark:text-slate-50">
                Delete Member from Roles &amp; Branches?
              </h3>
              <button
                type="button"
                onClick={() => setConfirmDeleteMember(null)}
                aria-label="Cancel delete"
                className="p-1 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <p>
                Remove <strong>{confirmDeleteMember.name}</strong> ({confirmDeleteMember.email})?
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                They will immediately lose {confirmDeleteMember.role} dashboard access and daily
                passcode request eligibility.
              </p>
            </div>
            <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDeleteMember(null)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingId !== null}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold disabled:opacity-50"
              >
                {deletingId ? 'Deleting...' : 'Delete Member'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
