import React, { useCallback, useEffect, useState } from 'react';
import { FileHeart, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { calculateAge } from '../../lib/format';
import type { Patient, PatientStatus, StaffUser } from '../../types/hms';
import { Modal } from '../ui/Modal';

interface PatientsViewProps {
  currentUser: StaffUser;
  onOpenEHR: (patientId: string) => void;
  onNotify: (type: 'success' | 'error', text: string) => void;
  onGlobalChange: () => void;
  registerTrigger: number;
}

const EMPTY_FORM = {
  fullName: '',
  dateOfBirth: '1985-06-15',
  gender: 'Female' as Patient['gender'],
  bloodGroup: 'O+' as Patient['bloodGroup'],
  phone: '',
  email: '',
  address: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  insuranceProvider: 'Self-Pay',
  insurancePolicyNumber: '',
  allergiesText: '',
  status: 'outpatient' as PatientStatus,
};

export function PatientsView({
  currentUser,
  onOpenEHR,
  onNotify,
  onGlobalChange,
  registerTrigger,
}: PatientsViewProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PatientStatus>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const loadPatients = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getPatients({
        search: search.trim() || undefined,
        status: statusFilter,
      });
      setPatients(data);
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, onNotify]);

  useEffect(() => {
    const t = setTimeout(loadPatients, 150);
    return () => clearTimeout(t);
  }, [loadPatients]);

  useEffect(() => {
    if (registerTrigger > 0) {
      openCreateModal();
    }
  }, [registerTrigger]);

  function openCreateModal() {
    setEditingPatient(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEditModal(p: Patient) {
    setEditingPatient(p);
    setForm({
      fullName: p.fullName,
      dateOfBirth: p.dateOfBirth,
      gender: p.gender,
      bloodGroup: p.bloodGroup,
      phone: p.phone,
      email: p.email,
      address: p.address,
      emergencyContactName: p.emergencyContactName,
      emergencyContactPhone: p.emergencyContactPhone,
      insuranceProvider: p.insuranceProvider,
      insurancePolicyNumber: p.insurancePolicyNumber,
      allergiesText: p.allergies.join(', '),
      status: p.status,
    });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        fullName: form.fullName,
        dateOfBirth: form.dateOfBirth,
        gender: form.gender,
        bloodGroup: form.bloodGroup,
        phone: form.phone,
        email: form.email,
        address: form.address,
        emergencyContactName: form.emergencyContactName,
        emergencyContactPhone: form.emergencyContactPhone,
        insuranceProvider: form.insuranceProvider,
        insurancePolicyNumber: form.insurancePolicyNumber,
        allergies: form.allergiesText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        status: form.status,
      };
      if (editingPatient) {
        await api.updatePatient(editingPatient._id, payload);
        onNotify('success', `Updated patient profile for ${form.fullName}.`);
      } else {
        await api.createPatient(payload);
        onNotify('success', `Registered ${form.fullName} into patient registry.`);
      }
      setModalOpen(false);
      await loadPatients();
      onGlobalChange();
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: Patient) {
    try {
      await api.deletePatient(p._id);
      onNotify('success', `Removed record ${p.mrn} (${p.fullName}).`);
      await loadPatients();
      onGlobalChange();
    } catch (err) {
      onNotify('error', (err as Error).message);
    }
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, MRN, phone, blood..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-[#111827] border border-[#334155] rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#111827] border border-[#1F2937] rounded-md">
            {(['all', 'outpatient', 'admitted', 'discharged'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1 text-xs font-medium rounded capitalize whitespace-nowrap transition-colors ${
                  statusFilter === status
                    ? 'bg-[#1E293B] text-sky-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-md whitespace-nowrap shrink-0 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Register Patient</span>
        </button>
      </div>

      {/* Patient Data Grid */}
      <div className="rounded-lg bg-[#111827] border border-[#1F2937] overflow-hidden">
        {loading && patients.length === 0 ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 bg-[#1E293B]/60 rounded animate-pulse" />
            ))}
          </div>
        ) : patients.length === 0 ? (
          <div className="py-14 px-6 text-center">
            <p className="text-sm text-slate-300">No patients match your current filters.</p>
            <p className="text-xs text-slate-500 mt-1">
              Clear the search query or register a new patient record.
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              className="mt-4 px-4 py-2 text-xs font-medium bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-md"
            >
              Register First Patient
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#0F172A] text-slate-400 border-b border-[#1F2937]">
                <tr>
                  <th className="text-left font-medium px-5 py-3">MRN</th>
                  <th className="text-left font-medium px-3 py-3">Patient</th>
                  <th className="text-left font-medium px-3 py-3">Demographics</th>
                  <th className="text-left font-medium px-3 py-3">Contact &amp; Insurance</th>
                  <th className="text-left font-medium px-3 py-3">Allergies</th>
                  <th className="text-left font-medium px-3 py-3">Status</th>
                  <th className="text-right font-medium px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F2937]">
                {patients.map((p) => (
                  <tr key={p._id} className="hover:bg-[#1E293B]/45 transition-colors">
                    <td className="px-5 py-3 font-mono tabular-nums text-sky-400 whitespace-nowrap">
                      {p.mrn}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => onOpenEHR(p._id)}
                        className="text-left font-medium text-slate-100 hover:text-sky-300 transition-colors"
                      >
                        {p.fullName}
                      </button>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {p.vitals.length} vitals · {p.clinicalNotes.length} notes · {p.prescriptions.length} Rx
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-300 whitespace-nowrap">
                      <span>{p.gender}</span>
                      <span className="text-slate-500 mx-1.5">·</span>
                      <span className="font-mono tabular-nums">{calculateAge(p.dateOfBirth)}y</span>
                      <span className="text-slate-500 mx-1.5">·</span>
                      <span className="font-mono font-medium text-slate-100">{p.bloodGroup}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-mono tabular-nums text-slate-200">{p.phone}</div>
                      <div className="text-[11px] text-slate-400 truncate max-w-[200px]">
                        {p.insuranceProvider}
                      </div>
                    </td>
                    <td className="px-3 py-3 max-w-[160px] truncate">
                      {p.allergies.length > 0 ? (
                        <span className="text-red-300">{p.allergies.join(', ')}</span>
                      ) : (
                        <span className="text-slate-500">None reported</span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span
                        className={`font-medium capitalize ${
                          p.status === 'admitted'
                            ? 'text-sky-400'
                            : p.status === 'discharged'
                            ? 'text-slate-400'
                            : 'text-emerald-400'
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenEHR(p._id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 rounded transition-colors"
                        >
                          <FileHeart className="w-3.5 h-3.5" />
                          <span>EHR</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(p)}
                          aria-label={`Edit ${p.fullName}`}
                          className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-[#1E293B] rounded transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {currentUser.role === 'admin' && (
                          <button
                            type="button"
                            onClick={() => handleDelete(p)}
                            aria-label={`Delete ${p.fullName}`}
                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Register / Edit Patient Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingPatient ? `Edit Patient — ${editingPatient.mrn}` : 'Register New Patient'}
        subtitle="Demographics, emergency contact, insurance policy, and documented allergies"
        maxWidth="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Date of Birth *</label>
              <input
                type="date"
                required
                value={form.dateOfBirth}
                onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Gender</label>
              <select
                value={form.gender}
                onChange={(e) => setForm({ ...form, gender: e.target.value as Patient['gender'] })}
                className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              >
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Blood Group</label>
              <select
                value={form.bloodGroup}
                onChange={(e) =>
                  setForm({ ...form, bloodGroup: e.target.value as Patient['bloodGroup'] })
                }
                className="w-full px-3 py-2 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              >
                {(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const).map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Phone *</label>
              <input
                type="text"
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="(415) 555-0199"
                className="w-full px-3 py-2 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1">Residential Address</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Emergency Contact Name</label>
              <input
                type="text"
                value={form.emergencyContactName}
                onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Emergency Contact Phone</label>
              <input
                type="text"
                value={form.emergencyContactPhone}
                onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Insurance Provider</label>
              <input
                type="text"
                value={form.insuranceProvider}
                onChange={(e) => setForm({ ...form, insuranceProvider: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Policy Number</label>
              <input
                type="text"
                value={form.insurancePolicyNumber}
                onChange={(e) => setForm({ ...form, insurancePolicyNumber: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Documented Allergies (comma-separated)
              </label>
              <input
                type="text"
                value={form.allergiesText}
                onChange={(e) => setForm({ ...form, allergiesText: e.target.value })}
                placeholder="e.g. Penicillin, Latex, Sulfa Drugs"
                className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#1F2937]">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:bg-[#1E293B] rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-medium bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-md"
            >
              {saving ? 'Saving...' : editingPatient ? 'Save Changes' : 'Register Patient'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
