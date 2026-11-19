import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Plus, Search } from 'lucide-react';
import { api } from '../../lib/api';
import { formatCurrency } from '../../lib/format';
import type { Doctor, DoctorShift, DoctorStatus, ShiftType, StaffUser } from '../../types/hms';
import { DoctorAvatar } from '../ui/DoctorAvatar';
import { Modal } from '../ui/Modal';

interface DoctorsViewProps {
  currentUser: StaffUser;
  onNotify: (type: 'success' | 'error', text: string) => void;
  onGlobalChange: () => void;
}

const DEPARTMENTS = [
  'Cardiology',
  'Neurology',
  'General Surgery',
  'Pediatrics',
  'Internal Medicine',
  'Orthopedics',
  'Obstetrics & Gynecology',
  'Emergency Medicine',
];

const SHIFT_HOURS: Record<ShiftType, string> = {
  Morning: '08:00–16:00',
  Evening: '14:00–22:00',
  Night: '22:00–06:30',
  Off: 'Off Duty',
};

export function DoctorsView({ currentUser, onNotify, onGlobalChange }: DoctorsViewProps) {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newDoc, setNewDoc] = useState({
    fullName: '',
    specialty: '',
    department: 'Cardiology',
    licenseNumber: '',
    phone: '',
    email: '',
    consultationFee: '220',
  });

  const [shiftDoctor, setShiftDoctor] = useState<Doctor | null>(null);
  const [editingShifts, setEditingShifts] = useState<DoctorShift[]>([]);
  const [saving, setSaving] = useState(false);

  const isAdmin = currentUser.role === 'admin';

  const loadDoctors = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getDoctors({
        search: search.trim() || undefined,
        department: departmentFilter,
      });
      setDoctors(data);
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search, departmentFilter, onNotify]);

  useEffect(() => {
    const t = setTimeout(loadDoctors, 120);
    return () => clearTimeout(t);
  }, [loadDoctors]);

  async function handleStatusChange(doc: Doctor, status: DoctorStatus) {
    try {
      await api.updateDoctor(doc._id, { status });
      onNotify('success', `${doc.fullName} marked as ${status.replace('_', ' ')}.`);
      await loadDoctors();
      onGlobalChange();
    } catch (err) {
      onNotify('error', (err as Error).message);
    }
  }

  async function handleAddDoctor(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createDoctor({
        fullName: newDoc.fullName,
        specialty: newDoc.specialty,
        department: newDoc.department,
        licenseNumber: newDoc.licenseNumber,
        phone: newDoc.phone,
        email: newDoc.email,
        consultationFee: Number(newDoc.consultationFee) || 200,
      });
      setAddModalOpen(false);
      setNewDoc({
        fullName: '',
        specialty: '',
        department: 'Cardiology',
        licenseNumber: '',
        phone: '',
        email: '',
        consultationFee: '220',
      });
      onNotify('success', 'Physician added to clinical roster.');
      await loadDoctors();
      onGlobalChange();
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function openShiftEditor(doc: Doctor) {
    setShiftDoctor(doc);
    setEditingShifts(doc.shifts.map((s) => ({ ...s })));
  }

  async function handleSaveShifts(e: React.FormEvent) {
    e.preventDefault();
    if (!shiftDoctor) return;
    setSaving(true);
    try {
      await api.updateDoctor(shiftDoctor._id, { shifts: editingShifts });
      onNotify('success', `Updated weekly shift roster for ${shiftDoctor.fullName}.`);
      setShiftDoctor(null);
      await loadDoctors();
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search physician, specialty..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-[#111827] border border-[#334155] rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-[#111827] border border-[#334155] rounded-md text-slate-200 focus:outline-none focus:border-sky-500"
          >
            <option value="all">All Departments</option>
            {DEPARTMENTS.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-md whitespace-nowrap shrink-0 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Physician</span>
          </button>
        )}
      </div>

      {/* Physician Roster & Shift Schedule Matrix */}
      <div className="rounded-lg bg-[#111827] border border-[#1F2937] overflow-hidden">
        {loading && doctors.length === 0 ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 bg-[#1E293B]/60 rounded animate-pulse" />
            ))}
          </div>
        ) : doctors.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            No physicians found matching this filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#0F172A] text-slate-400 border-b border-[#1F2937]">
                <tr>
                  <th className="text-left font-medium px-5 py-3">Physician</th>
                  <th className="text-left font-medium px-3 py-3">Department &amp; License</th>
                  <th className="text-right font-medium px-3 py-3">Consult Fee</th>
                  <th className="text-left font-medium px-3 py-3">Duty Status</th>
                  <th className="text-left font-medium px-3 py-3">Weekly Shift Roster</th>
                  <th className="text-right font-medium px-5 py-3">Schedule</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F2937]">
                {doctors.map((doc) => {
                  const canEditThisDoc =
                    isAdmin || (currentUser.role === 'doctor' && currentUser.doctorId === doc._id);
                  return (
                    <tr key={doc._id} className="hover:bg-[#1E293B]/45 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <DoctorAvatar name={doc.fullName} avatarUrl={doc.avatarUrl} size="md" />
                          <div className="min-w-0">
                            <div className="font-medium text-slate-100 whitespace-nowrap">
                              {doc.fullName}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate max-w-[200px]">
                              {doc.specialty}
                            </div>
                            <div className="text-[11px] font-mono text-slate-500">{doc.phone}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        <div className="text-slate-200">{doc.department}</div>
                        <div className="font-mono text-[11px] text-slate-500">
                          {doc.licenseNumber}
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-right font-mono tabular-nums text-slate-100 whitespace-nowrap">
                        {formatCurrency(doc.consultationFee)}
                      </td>
                      <td className="px-3 py-3.5 whitespace-nowrap">
                        {canEditThisDoc ? (
                          <select
                            value={doc.status}
                            onChange={(e) =>
                              handleStatusChange(doc, e.target.value as DoctorStatus)
                            }
                            className={`px-2.5 py-1 text-xs font-medium bg-[#0B1120] border border-[#334155] rounded focus:outline-none focus:border-sky-500 ${
                              doc.status === 'on_duty'
                                ? 'text-emerald-400'
                                : doc.status === 'in_surgery'
                                ? 'text-amber-400'
                                : 'text-slate-400'
                            }`}
                          >
                            <option value="on_duty">On Duty</option>
                            <option value="in_surgery">In Surgery</option>
                            <option value="off_duty">Off Duty</option>
                          </select>
                        ) : (
                          <span
                            className={`font-medium ${
                              doc.status === 'on_duty'
                                ? 'text-emerald-400'
                                : doc.status === 'in_surgery'
                                ? 'text-amber-400'
                                : 'text-slate-400'
                            }`}
                          >
                            {doc.status === 'on_duty'
                              ? 'On Duty'
                              : doc.status === 'in_surgery'
                              ? 'In Surgery'
                              : 'Off Duty'}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3.5">
                        <div className="grid grid-cols-7 gap-1 min-w-[260px]">
                          {doc.shifts.map((s) => (
                            <div
                              key={s.day}
                              title={`${s.day}: ${s.shiftType} (${s.hours})`}
                              className={`px-1.5 py-1 rounded text-center border text-[10px] font-mono ${
                                s.shiftType === 'Off'
                                  ? 'bg-[#0B1120] border-[#1F2937] text-slate-600'
                                  : s.shiftType === 'Night'
                                  ? 'bg-sky-500/10 border-sky-500/30 text-sky-300'
                                  : s.shiftType === 'Evening'
                                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                                  : 'bg-[#1E293B] border-[#334155] text-slate-200'
                              }`}
                            >
                              <div className="text-[9px] text-slate-400">{s.day}</div>
                              <div className="font-semibold">
                                {s.shiftType === 'Off' ? '—' : s.shiftType[0]}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        {canEditThisDoc ? (
                          <button
                            type="button"
                            onClick={() => openShiftEditor(doc)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:text-sky-300 bg-[#1E293B] border border-[#334155] rounded transition-colors"
                          >
                            <CalendarDays className="w-3.5 h-3.5" />
                            <span>Edit Shifts</span>
                          </button>
                        ) : (
                          <span className="text-slate-500">View only</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Shift Legend */}
      <div className="flex flex-wrap items-center gap-6 text-xs text-slate-400 px-1">
        <span>
          <strong className="font-mono text-slate-200">M</strong> Morning (07:00–16:00)
        </span>
        <span>
          <strong className="font-mono text-amber-300">E</strong> Evening (14:00–22:00)
        </span>
        <span>
          <strong className="font-mono text-sky-300">N</strong> Night (22:00–06:30)
        </span>
        <span>
          <strong className="font-mono text-slate-500">—</strong> Off Duty
        </span>
      </div>

      {/* Add Physician Modal */}
      <Modal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add Physician to Roster"
        subtitle="Credentials, department assignment, and consultation rate"
      >
        <form onSubmit={handleAddDoctor} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={newDoc.fullName}
                onChange={(e) => setNewDoc({ ...newDoc, fullName: e.target.value })}
                placeholder="Dr. Jordan Mercer"
                className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Department *</label>
              <select
                value={newDoc.department}
                onChange={(e) => setNewDoc({ ...newDoc, department: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              >
                {DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Specialty *</label>
              <input
                type="text"
                required
                value={newDoc.specialty}
                onChange={(e) => setNewDoc({ ...newDoc, specialty: e.target.value })}
                placeholder="e.g. Cardiac Electrophysiology"
                className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Medical License #</label>
              <input
                type="text"
                value={newDoc.licenseNumber}
                onChange={(e) => setNewDoc({ ...newDoc, licenseNumber: e.target.value })}
                placeholder="MC-80214-CA"
                className="w-full px-3 py-2 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Consultation Fee ($)</label>
              <input
                type="number"
                min="0"
                required
                value={newDoc.consultationFee}
                onChange={(e) => setNewDoc({ ...newDoc, consultationFee: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Direct Phone</label>
              <input
                type="text"
                value={newDoc.phone}
                onChange={(e) => setNewDoc({ ...newDoc, phone: e.target.value })}
                placeholder="(415) 555-0192"
                className="w-full px-3 py-2 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Email</label>
              <input
                type="email"
                value={newDoc.email}
                onChange={(e) => setNewDoc({ ...newDoc, email: e.target.value })}
                placeholder="j.mercer@meridianclinical.org"
                className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#1F2937]">
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:bg-[#1E293B] rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-medium bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-md"
            >
              {saving ? 'Adding...' : 'Add Physician'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Shifts Modal */}
      <Modal
        open={Boolean(shiftDoctor)}
        onClose={() => setShiftDoctor(null)}
        title={shiftDoctor ? `Weekly Shift Roster — ${shiftDoctor.fullName}` : 'Edit Shifts'}
        subtitle={shiftDoctor ? `${shiftDoctor.department} · ${shiftDoctor.specialty}` : undefined}
      >
        <form onSubmit={handleSaveShifts} className="space-y-3">
          {editingShifts.map((shift, idx) => (
            <div
              key={shift.day}
              className="grid grid-cols-12 items-center gap-3 py-1.5 border-b border-[#1F2937] last:border-0"
            >
              <div className="col-span-2 font-mono text-xs font-semibold text-slate-200">
                {shift.day}
              </div>
              <div className="col-span-5">
                <select
                  value={shift.shiftType}
                  onChange={(e) => {
                    const nextType = e.target.value as ShiftType;
                    setEditingShifts((prev) =>
                      prev.map((s, i) =>
                        i === idx ? { ...s, shiftType: nextType, hours: SHIFT_HOURS[nextType] } : s
                      )
                    );
                  }}
                  className="w-full px-2.5 py-1.5 text-xs bg-[#0B1120] border border-[#334155] rounded text-slate-100 focus:outline-none focus:border-sky-500"
                >
                  <option value="Morning">Morning</option>
                  <option value="Evening">Evening</option>
                  <option value="Night">Night</option>
                  <option value="Off">Off Duty</option>
                </select>
              </div>
              <div className="col-span-5">
                <input
                  type="text"
                  value={shift.hours}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditingShifts((prev) =>
                      prev.map((s, i) => (i === idx ? { ...s, hours: val } : s))
                    );
                  }}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded text-slate-300 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={() => setShiftDoctor(null)}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:bg-[#1E293B] rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-medium bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-md"
            >
              {saving ? 'Saving...' : 'Save Weekly Roster'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
