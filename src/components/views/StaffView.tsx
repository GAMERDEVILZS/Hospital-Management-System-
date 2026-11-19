import React, { useCallback, useEffect, useState } from 'react';
import { Plus, UserCheck, UserX } from 'lucide-react';
import { api } from '../../lib/api';
import { formatShortDate } from '../../lib/format';
import type { Doctor, StaffRole, StaffUser } from '../../types/hms';
import { Modal } from '../ui/Modal';

interface StaffViewProps {
  currentUser: StaffUser;
  onNotify: (type: 'success' | 'error', text: string) => void;
}

export function StaffView({ currentUser, onNotify }: StaffViewProps) {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'reception' as StaffRole,
    department: 'Admissions & Front Desk',
    doctorId: '',
  });
  const [saving, setSaving] = useState(false);

  const loadStaff = useCallback(async () => {
    setLoading(true);
    try {
      const [users, docs] = await Promise.all([api.getStaff(), api.getDoctors()]);
      setStaff(users);
      setDoctors(docs);
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  async function handleCreateStaff(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createStaff({
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        department: form.department,
        doctorId: form.role === 'doctor' && form.doctorId ? form.doctorId : undefined,
      });
      setCreateOpen(false);
      setForm({
        name: '',
        email: '',
        password: '',
        role: 'reception',
        department: 'Admissions & Front Desk',
        doctorId: '',
      });
      onNotify('success', 'Staff account provisioned successfully.');
      await loadStaff();
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user: StaffUser) {
    try {
      await api.updateStaff(user._id, { active: !user.active });
      onNotify(
        'success',
        `${user.name} account ${user.active ? 'deactivated' : 'reactivated'}.`
      );
      await loadStaff();
    } catch (err) {
      onNotify('error', (err as Error).message);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Authorized Staff Directory</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Provision role-based console accounts for administrators, physicians, and reception staff
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-md whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Staff Account</span>
        </button>
      </div>

      <div className="rounded-lg bg-[#111827] border border-[#1F2937] overflow-hidden">
        {loading && staff.length === 0 ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-[#1E293B]/60 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#0F172A] text-slate-400 border-b border-[#1F2937]">
                <tr>
                  <th className="text-left font-medium px-5 py-3">Staff Member</th>
                  <th className="text-left font-medium px-3 py-3">Role</th>
                  <th className="text-left font-medium px-3 py-3">Department</th>
                  <th className="text-left font-medium px-3 py-3">Provisioned</th>
                  <th className="text-left font-medium px-3 py-3">Status</th>
                  <th className="text-right font-medium px-5 py-3">Access</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F2937]">
                {staff.map((u) => (
                  <tr key={u._id} className="hover:bg-[#1E293B]/45 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-medium text-slate-100">{u.name}</div>
                      <div className="font-mono text-[11px] text-slate-400">{u.email}</div>
                    </td>
                    <td className="px-3 py-3 capitalize font-medium text-sky-400">{u.role}</td>
                    <td className="px-3 py-3 text-slate-300">{u.department}</td>
                    <td className="px-3 py-3 font-mono tabular-nums text-slate-400">
                      {formatShortDate(u.createdAt)}
                    </td>
                    <td className="px-3 py-3">
                      <span className={u.active ? 'text-emerald-400 font-medium' : 'text-slate-500'}>
                        {u.active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {u._id === currentUser._id ? (
                        <span className="text-slate-500">Current session</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleActive(u)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border transition-colors ${
                            u.active
                              ? 'text-red-300 border-red-500/30 hover:bg-red-500/15'
                              : 'text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/15'
                          }`}
                        >
                          {u.active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                          <span>{u.active ? 'Disable' : 'Activate'}</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Provision Staff Console Account"
        subtitle="Creates a bcrypt-secured login with scoped clinical permissions"
      >
        <form onSubmit={handleCreateStaff} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Role *</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as StaffRole })}
                className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100"
              >
                <option value="reception">Reception</option>
                <option value="doctor">Doctor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Staff Email *</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@meridianclinical.org"
                className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Initial Password *</label>
              <input
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Min 6 characters"
                className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-300 mb-1">Department</label>
              <input
                type="text"
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100"
              />
            </div>
            {form.role === 'doctor' && (
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-300 mb-1">Link Physician Profile</label>
                <select
                  value={form.doctorId}
                  onChange={(e) => setForm({ ...form, doctorId: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100"
                >
                  <option value="">None</option>
                  {doctors.map((d) => (
                    <option key={d._id} value={d._id}>
                      {d.fullName} — {d.department}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#1F2937]">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:bg-[#1E293B] rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-medium bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-md"
            >
              {saving ? 'Provisioning...' : 'Create Account'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
