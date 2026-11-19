import React, { useCallback, useEffect, useState } from 'react';
import { FileHeart, Plus, Search, XCircle } from 'lucide-react';
import { api, type EnrichedAppointment } from '../../lib/api';
import { formatCurrency, formatShortDate, getTodayISO } from '../../lib/format';
import type { AppointmentStatus, AppointmentType, Doctor, Patient, StaffUser } from '../../types/hms';
import { Modal } from '../ui/Modal';

interface AppointmentsViewProps {
  currentUser: StaffUser;
  onOpenEHR: (patientId: string) => void;
  onNotify: (type: 'success' | 'error', text: string) => void;
  onGlobalChange: () => void;
  bookTrigger: number;
}

export function AppointmentsView({
  currentUser,
  onOpenEHR,
  onNotify,
  onGlobalChange,
  bookTrigger,
}: AppointmentsViewProps) {
  const [appointments, setAppointments] = useState<EnrichedAppointment[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<'all' | AppointmentStatus>('all');
  const [dateScope, setDateScope] = useState<'all' | 'today'>('all');
  const [search, setSearch] = useState('');

  const [bookOpen, setBookOpen] = useState(false);
  const [form, setForm] = useState({
    patientId: '',
    doctorId: '',
    date: getTodayISO(),
    timeSlot: '10:30',
    type: 'Consultation' as AppointmentType,
    reason: '',
  });
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [apts, pats, docs] = await Promise.all([
        api.getAppointments({
          status: statusFilter,
          date: dateScope === 'today' ? getTodayISO() : undefined,
          search: search.trim() || undefined,
        }),
        api.getPatients(),
        api.getDoctors(),
      ]);
      setAppointments(apts);
      setPatients(pats);
      setDoctors(docs);
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dateScope, search, onNotify]);

  useEffect(() => {
    const t = setTimeout(loadData, 120);
    return () => clearTimeout(t);
  }, [loadData]);

  useEffect(() => {
    if (bookTrigger > 0) {
      openBookModal();
    }
  }, [bookTrigger]);

  function openBookModal() {
    setForm({
      patientId: patients[0]?._id || '',
      doctorId: doctors[0]?._id || '',
      date: getTodayISO(),
      timeSlot: '11:00',
      type: 'Consultation',
      reason: '',
    });
    setBookOpen(true);
  }

  async function handleBookSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createAppointment({
        patientId: form.patientId,
        doctorId: form.doctorId,
        date: form.date,
        timeSlot: form.timeSlot,
        type: form.type,
        reason: form.reason,
      });
      setBookOpen(false);
      onNotify('success', 'Appointment scheduled and token assigned.');
      await loadData();
      onGlobalChange();
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTransition(id: string, status: AppointmentStatus) {
    try {
      await api.updateAppointment(id, { status });
      onNotify('success', `Queue status changed to ${status.replace('_', ' ')}.`);
      await loadData();
      onGlobalChange();
    } catch (err) {
      onNotify('error', (err as Error).message);
    }
  }

  const selectedDoc = doctors.find((d) => d._id === form.doctorId);

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search token, patient, doctor..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-[#111827] border border-[#334155] rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#111827] border border-[#1F2937] rounded-md">
            <button
              type="button"
              onClick={() => setDateScope('all')}
              className={`px-3 py-1 text-xs font-medium rounded whitespace-nowrap transition-colors ${
                dateScope === 'all' ? 'bg-[#1E293B] text-sky-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Dates
            </button>
            <button
              type="button"
              onClick={() => setDateScope('today')}
              className={`px-3 py-1 text-xs font-medium rounded whitespace-nowrap transition-colors ${
                dateScope === 'today' ? 'bg-[#1E293B] text-sky-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Today Only
            </button>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#111827] border border-[#1F2937] rounded-md overflow-x-auto">
            {(
              [
                ['all', 'All'],
                ['scheduled', 'Scheduled'],
                ['checked_in', 'Checked In'],
                ['in_consultation', 'In Consult'],
                ['completed', 'Completed'],
                ['cancelled', 'Cancelled'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setStatusFilter(val)}
                className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap transition-colors ${
                  statusFilter === val
                    ? 'bg-[#1E293B] text-sky-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={openBookModal}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-md whitespace-nowrap shrink-0 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Book Appointment</span>
        </button>
      </div>

      {/* Appointments Table */}
      <div className="rounded-lg bg-[#111827] border border-[#1F2937] overflow-hidden">
        {loading && appointments.length === 0 ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-[#1E293B]/60 rounded animate-pulse" />
            ))}
          </div>
        ) : appointments.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm text-slate-300">No appointments match the selected filters.</p>
            <button
              type="button"
              onClick={openBookModal}
              className="mt-4 px-4 py-2 text-xs font-medium bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-md"
            >
              Schedule Appointment
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#0F172A] text-slate-400 border-b border-[#1F2937]">
                <tr>
                  <th className="text-left font-medium px-5 py-3">Token</th>
                  <th className="text-left font-medium px-3 py-3">Date &amp; Slot</th>
                  <th className="text-left font-medium px-3 py-3">Patient</th>
                  <th className="text-left font-medium px-3 py-3">Physician &amp; Reason</th>
                  <th className="text-right font-medium px-3 py-3">Fee</th>
                  <th className="text-left font-medium px-3 py-3">Queue Stage</th>
                  <th className="text-right font-medium px-5 py-3">Workflow</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F2937]">
                {appointments.map((apt) => (
                  <tr key={apt._id} className="hover:bg-[#1E293B]/45 transition-colors">
                    <td className="px-5 py-3 font-mono tabular-nums font-medium text-sky-400 whitespace-nowrap">
                      {apt.tokenNumber}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="font-mono tabular-nums text-slate-200">
                        {formatShortDate(apt.date)}
                      </div>
                      <div className="font-mono tabular-nums text-[11px] text-slate-400">
                        {apt.timeSlot} · {apt.type}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => onOpenEHR(apt.patientId)}
                        className="text-left font-medium text-slate-100 hover:text-sky-300 transition-colors"
                      >
                        {apt.patientName}
                      </button>
                      <div className="font-mono text-[11px] text-slate-400">{apt.patientMrn}</div>
                    </td>
                    <td className="px-3 py-3 max-w-[260px]">
                      <div className="text-slate-200">
                        {apt.doctorName} <span className="text-slate-500">· {apt.department}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">{apt.reason}</div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                      {formatCurrency(apt.fee)}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <span
                        className={`font-medium ${
                          apt.status === 'completed'
                            ? 'text-emerald-400'
                            : apt.status === 'in_consultation'
                            ? 'text-sky-400'
                            : apt.status === 'checked_in'
                            ? 'text-amber-400'
                            : apt.status === 'cancelled'
                            ? 'text-red-400'
                            : 'text-slate-300'
                        }`}
                      >
                        {apt.status === 'in_consultation'
                          ? 'In Consultation'
                          : apt.status === 'checked_in'
                          ? 'Checked In'
                          : apt.status.charAt(0).toUpperCase() + apt.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {apt.status === 'scheduled' && (
                          <button
                            type="button"
                            onClick={() => handleTransition(apt._id, 'checked_in')}
                            className="px-2.5 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/15 border border-amber-500/30 rounded transition-colors"
                          >
                            Check In
                          </button>
                        )}
                        {apt.status === 'checked_in' && (
                          <button
                            type="button"
                            onClick={() => handleTransition(apt._id, 'in_consultation')}
                            className="px-2.5 py-1 text-xs font-medium text-sky-300 hover:bg-sky-500/15 border border-sky-500/30 rounded transition-colors"
                          >
                            Start Consult
                          </button>
                        )}
                        {apt.status === 'in_consultation' && (
                          <button
                            type="button"
                            onClick={() => handleTransition(apt._id, 'completed')}
                            className="px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/15 border border-emerald-500/30 rounded transition-colors"
                          >
                            Complete
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenEHR(apt.patientId)}
                          title="Open Patient EHR"
                          className="p-1.5 text-slate-400 hover:text-sky-300 hover:bg-[#1E293B] rounded transition-colors"
                        >
                          <FileHeart className="w-3.5 h-3.5" />
                        </button>
                        {(apt.status === 'scheduled' || apt.status === 'checked_in') &&
                          currentUser.role !== 'doctor' && (
                            <button
                              type="button"
                              onClick={() => handleTransition(apt._id, 'cancelled')}
                              title="Cancel Appointment"
                              className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                            >
                              <XCircle className="w-3.5 h-3.5" />
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

      {/* Book Appointment Modal */}
      <Modal
        open={bookOpen}
        onClose={() => setBookOpen(false)}
        title="Schedule Outpatient Appointment"
        subtitle="Automatically generates queue token and applies physician consultation rate"
      >
        <form onSubmit={handleBookSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Patient *</label>
            <select
              required
              value={form.patientId}
              onChange={(e) => setForm({ ...form, patientId: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
            >
              <option value="">Select registered patient...</option>
              {patients.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.fullName} ({p.mrn})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Attending Physician *</label>
            <select
              required
              value={form.doctorId}
              onChange={(e) => setForm({ ...form, doctorId: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
            >
              <option value="">Select physician...</option>
              {doctors.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.fullName} — {d.department} ({formatCurrency(d.consultationFee)})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Date *</label>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Time Slot *</label>
              <input
                type="time"
                required
                value={form.timeSlot}
                onChange={(e) => setForm({ ...form, timeSlot: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Visit Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as AppointmentType })}
                className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              >
                <option value="Consultation">Consultation</option>
                <option value="Follow-Up">Follow-Up</option>
                <option value="Emergency">Emergency</option>
                <option value="Procedure">Procedure</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Reason for Visit *</label>
            <textarea
              rows={2}
              required
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="Chief complaint, follow-up purpose, or procedure notes"
              className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
            />
          </div>

          {selectedDoc && (
            <div className="flex items-center justify-between px-3.5 py-2.5 rounded-md bg-[#0B1120] border border-[#1F2937] text-xs">
              <span className="text-slate-400">
                Department: <strong className="text-slate-200">{selectedDoc.department}</strong>
              </span>
              <span className="font-mono tabular-nums text-sky-400">
                Standard Fee: {formatCurrency(selectedDoc.consultationFee)}
              </span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-[#1F2937]">
            <button
              type="button"
              onClick={() => setBookOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:bg-[#1E293B] rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-medium bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-md"
            >
              {saving ? 'Scheduling...' : 'Confirm Booking'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
