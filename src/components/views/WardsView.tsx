import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowRightLeft,
  BedDouble,
  FileHeart,
  LogOut,
  Plus,
  Wrench,
} from 'lucide-react';
import { api, type EnrichedWardBed } from '../../lib/api';
import { formatCurrency, formatDateTime, formatShortDate } from '../../lib/format';
import type { BedStatus, Doctor, Patient, StaffUser, WardType } from '../../types/hms';
import { Modal } from '../ui/Modal';

export interface DischargeBillingDraft {
  patientId: string;
  bedNumber: string;
  stayDays: number;
  dailyRate: number;
}

interface WardsViewProps {
  currentUser: StaffUser;
  onOpenEHR: (patientId: string) => void;
  onNotify: (type: 'success' | 'error', text: string) => void;
  onGlobalChange: () => void;
  onCreateDischargeInvoice: (draft: DischargeBillingDraft) => void;
}

const WARD_TYPES: Array<'all' | WardType> = ['all', 'ICU', 'General', 'Surgical', 'Pediatrics', 'Maternity'];

export function WardsView({
  currentUser,
  onOpenEHR,
  onNotify,
  onGlobalChange,
  onCreateDischargeInvoice,
}: WardsViewProps) {
  const [beds, setBeds] = useState<EnrichedWardBed[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [wardFilter, setWardFilter] = useState<'all' | WardType>('all');

  const [selectedBed, setSelectedBed] = useState<EnrichedWardBed | null>(null);
  const [admitPatientId, setAdmitPatientId] = useState('');
  const [admitDoctorId, setAdmitDoctorId] = useState('');
  const [admitDiagnosis, setAdmitDiagnosis] = useState('');
  const [roundNoteText, setRoundNoteText] = useState('');
  const [transferTargetId, setTransferTargetId] = useState('');
  const [maintenanceNote, setMaintenanceNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadWards = useCallback(async () => {
    setLoading(true);
    try {
      const [wardData, patData, docData] = await Promise.all([
        api.getWards(),
        api.getPatients(),
        api.getDoctors(),
      ]);
      setBeds(wardData);
      setPatients(patData);
      setDoctors(docData);
      setSelectedBed((prev) => (prev ? wardData.find((b) => b._id === prev._id) || null : null));
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    loadWards();
  }, [loadWards]);

  function openBedModal(bed: EnrichedWardBed) {
    setSelectedBed(bed);
    const occupiedPatientIds = new Set(beds.filter((b) => b.patientId).map((b) => b.patientId));
    const eligiblePatients = patients.filter((p) => !occupiedPatientIds.has(p._id));
    setAdmitPatientId(eligiblePatients[0]?._id || '');
    setAdmitDoctorId(doctors[0]?._id || '');
    setAdmitDiagnosis('');
    setRoundNoteText('');
    setTransferTargetId('');
    setMaintenanceNote(bed.diagnosis || '');
  }

  async function handleAdmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBed) return;
    setSubmitting(true);
    try {
      await api.admitToBed(selectedBed._id, {
        patientId: admitPatientId,
        attendingDoctorId: admitDoctorId,
        diagnosis: admitDiagnosis,
      });
      onNotify('success', `Patient admitted to bed ${selectedBed.bedNumber}.`);
      setSelectedBed(null);
      await loadWards();
      onGlobalChange();
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDischarge(openBilling: boolean) {
    if (!selectedBed) return;
    setSubmitting(true);
    try {
      const res = await api.dischargeBed(selectedBed._id);
      onNotify('success', `Patient discharged from ${res.bedNumber}. Bed is now available.`);
      setSelectedBed(null);
      await loadWards();
      onGlobalChange();
      if (openBilling && currentUser.role !== 'doctor') {
        onCreateDischargeInvoice({
          patientId: res.dischargedPatientId,
          bedNumber: res.bedNumber,
          stayDays: res.stayDays,
          dailyRate: res.dailyRate,
        });
      }
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBed || !transferTargetId) return;
    setSubmitting(true);
    try {
      await api.transferBed(selectedBed._id, transferTargetId);
      onNotify('success', `Patient transferred from ${selectedBed.bedNumber}.`);
      setSelectedBed(null);
      await loadWards();
      onGlobalChange();
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddRoundNote(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBed || !roundNoteText.trim()) return;
    setSubmitting(true);
    try {
      await api.addRoundNote(selectedBed._id, roundNoteText);
      setRoundNoteText('');
      onNotify('success', 'Clinical round note logged.');
      await loadWards();
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleBedStatusChange(status: BedStatus) {
    if (!selectedBed) return;
    setSubmitting(true);
    try {
      await api.updateBedStatus(selectedBed._id, status, maintenanceNote);
      onNotify('success', `${selectedBed.bedNumber} status set to ${status}.`);
      setSelectedBed(null);
      await loadWards();
      onGlobalChange();
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const filteredBeds = wardFilter === 'all' ? beds : beds.filter((b) => b.wardType === wardFilter);
  const groupedWards = Array.from(
    filteredBeds.reduce((map, bed) => {
      const list = map.get(bed.wardName) || [];
      list.push(bed);
      map.set(bed.wardName, list);
      return map;
    }, new Map<string, EnrichedWardBed[]>())
  );

  const occupiedCount = beds.filter((b) => b.status === 'occupied').length;
  const availableCount = beds.filter((b) => b.status === 'available').length;
  const reservedCount = beds.filter((b) => b.status === 'reserved').length;
  const maintenanceCount = beds.filter((b) => b.status === 'maintenance').length;

  const occupiedPatientIds = new Set(beds.filter((b) => b.patientId).map((b) => b.patientId));
  const admitCandidates = patients.filter((p) => !occupiedPatientIds.has(p._id));
  const availableTransferBeds = beds.filter(
    (b) => b.status === 'available' && b._id !== selectedBed?._id
  );

  return (
    <div className="space-y-6">
      {/* Census Summary & Filter Strip */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-[#111827] border border-[#1F2937] rounded-md overflow-x-auto">
          {WARD_TYPES.map((wt) => (
            <button
              key={wt}
              type="button"
              onClick={() => setWardFilter(wt)}
              className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap transition-colors ${
                wardFilter === wt
                  ? 'bg-[#1E293B] text-sky-300'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {wt === 'all' ? 'All Wards' : wt}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-5 text-xs font-mono tabular-nums text-slate-300">
          <span>
            <strong className="text-sky-400">{occupiedCount}</strong> Occupied
          </span>
          <span>
            <strong className="text-emerald-400">{availableCount}</strong> Available
          </span>
          <span>
            <strong className="text-amber-400">{reservedCount}</strong> Reserved
          </span>
          <span>
            <strong className="text-slate-400">{maintenanceCount}</strong> Maintenance
          </span>
        </div>
      </div>

      {/* Ward Groups */}
      {loading && beds.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-36 rounded-lg bg-[#111827] border border-[#1F2937] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {groupedWards.map(([wardName, wardBeds]) => {
            const wardOccupied = wardBeds.filter((b) => b.status === 'occupied').length;
            return (
              <section key={wardName} className="space-y-3">
                <div className="flex items-center justify-between border-b border-[#1F2937] pb-2">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-100">{wardName}</h2>
                    <p className="text-xs text-slate-400">
                      {wardBeds[0].wardType} Unit ·{' '}
                      <span className="font-mono tabular-nums">
                        {formatCurrency(wardBeds[0].dailyRate)}/day
                      </span>
                    </p>
                  </div>
                  <div className="text-xs font-mono tabular-nums text-slate-300">
                    {wardOccupied}/{wardBeds.length} occupied
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {wardBeds.map((bed) => (
                    <button
                      key={bed._id}
                      type="button"
                      onClick={() => openBedModal(bed)}
                      className={`text-left p-4 rounded-lg border transition-colors flex flex-col justify-between min-h-[138px] ${
                        bed.status === 'occupied'
                          ? 'bg-[#111827] border-sky-500/35 hover:border-sky-400/60'
                          : bed.status === 'available'
                          ? 'bg-[#111827] border-[#1F2937] hover:border-emerald-500/40'
                          : bed.status === 'reserved'
                          ? 'bg-[#111827] border-amber-500/30 hover:border-amber-400/60'
                          : 'bg-[#0F172A] border-[#1F2937] opacity-80 hover:opacity-100'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 w-full">
                        <span className="font-mono text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                          <BedDouble className="w-3.5 h-3.5 text-slate-400" />
                          {bed.bedNumber}
                        </span>
                        <span
                          className={`text-[11px] font-medium capitalize ${
                            bed.status === 'occupied'
                              ? 'text-sky-400'
                              : bed.status === 'available'
                              ? 'text-emerald-400'
                              : bed.status === 'reserved'
                              ? 'text-amber-400'
                              : 'text-slate-500'
                          }`}
                        >
                          {bed.status}
                        </span>
                      </div>

                      {bed.status === 'occupied' ? (
                        <div className="mt-3 space-y-1">
                          <div className="text-sm font-medium text-slate-100 truncate">
                            {bed.patientName}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">
                            {bed.patientMrn} · {bed.attendingDoctorName}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            {bed.diagnosis}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 space-y-1">
                          <div className="text-xs text-slate-400">
                            {bed.status === 'available'
                              ? 'Ready for inpatient admission'
                              : bed.diagnosis || 'Unavailable for intake'}
                          </div>
                          <div className="text-[11px] font-mono tabular-nums text-slate-500">
                            {formatCurrency(bed.dailyRate)} / day
                          </div>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Bed Action Modal */}
      <Modal
        open={Boolean(selectedBed)}
        onClose={() => setSelectedBed(null)}
        title={selectedBed ? `Bed ${selectedBed.bedNumber} — ${selectedBed.wardName}` : 'Bed Details'}
        subtitle={
          selectedBed
            ? `${selectedBed.wardType} Unit · ${formatCurrency(selectedBed.dailyRate)}/day · Current status: ${selectedBed.status}`
            : undefined
        }
        maxWidth="xl"
      >
        {selectedBed && selectedBed.status === 'occupied' ? (
          <div className="space-y-6">
            {/* Occupied Patient Header */}
            <div className="p-4 rounded-md bg-[#0B1120] border border-[#1F2937] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">{selectedBed.patientName}</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  <span className="font-mono">{selectedBed.patientMrn}</span> · Attending:{' '}
                  {selectedBed.attendingDoctorName} · Admitted{' '}
                  {formatShortDate(selectedBed.admissionDate || '')}
                </div>
                <div className="text-xs text-slate-300 mt-1.5">
                  Diagnosis: {selectedBed.diagnosis}
                </div>
              </div>
              {selectedBed.patientId && (
                <button
                  type="button"
                  onClick={() => {
                    const pid = selectedBed.patientId!;
                    setSelectedBed(null);
                    onOpenEHR(pid);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 rounded-md whitespace-nowrap shrink-0"
                >
                  <FileHeart className="w-3.5 h-3.5" />
                  <span>Open EHR</span>
                </button>
              )}
            </div>

            {/* Nursing & Physician Round Notes */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-200">Inpatient Round Notes</h3>
              <form onSubmit={handleAddRoundNote} className="flex gap-2">
                <input
                  type="text"
                  value={roundNoteText}
                  onChange={(e) => setRoundNoteText(e.target.value)}
                  placeholder="Log clinical round observation or nursing update..."
                  className="flex-1 px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
                />
                <button
                  type="submit"
                  disabled={submitting || !roundNoteText.trim()}
                  className="px-3.5 py-2 text-xs font-medium bg-[#1E293B] hover:bg-sky-500/20 text-slate-100 border border-[#334155] rounded-md whitespace-nowrap"
                >
                  Add Note
                </button>
              </form>
              {selectedBed.roundNotes.length > 0 && (
                <div className="divide-y divide-[#1F2937] border border-[#1F2937] rounded-md bg-[#0B1120] max-h-40 overflow-y-auto">
                  {selectedBed.roundNotes.map((rn) => (
                    <div key={rn._id} className="px-3.5 py-2.5 text-xs">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="font-medium text-slate-300">{rn.author}</span>
                        <span className="font-mono tabular-nums">{formatDateTime(rn.timestamp)}</span>
                      </div>
                      <p className="text-slate-200 mt-1">{rn.note}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Transfer Bed */}
            <form onSubmit={handleTransfer} className="pt-4 border-t border-[#1F2937] space-y-2.5">
              <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <ArrowRightLeft className="w-3.5 h-3.5 text-slate-400" />
                <span>Transfer to Available Bed</span>
              </h3>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={transferTargetId}
                  onChange={(e) => setTransferTargetId(e.target.value)}
                  className="flex-1 px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
                >
                  <option value="">Select destination bed...</option>
                  {availableTransferBeds.map((b) => (
                    <option key={b._id} value={b._id}>
                      {b.bedNumber} — {b.wardName} ({formatCurrency(b.dailyRate)}/day)
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={submitting || !transferTargetId}
                  className="px-4 py-2 text-xs font-medium text-slate-100 bg-[#1E293B] hover:bg-sky-500/20 border border-[#334155] disabled:opacity-40 rounded-md whitespace-nowrap"
                >
                  Transfer Patient
                </button>
              </div>
            </form>

            {/* Discharge Actions */}
            <div className="pt-4 border-t border-[#1F2937] flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleDischarge(false)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-red-300 hover:bg-red-500/15 border border-red-500/35 rounded-md whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Discharge Only</span>
              </button>
              {currentUser.role !== 'doctor' && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleDischarge(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-md whitespace-nowrap"
                >
                  <span>Discharge &amp; Generate Invoice</span>
                </button>
              )}
            </div>
          </div>
        ) : selectedBed ? (
          <div className="space-y-6">
            {/* Admit Patient Form (if available or reserved) */}
            {(selectedBed.status === 'available' || selectedBed.status === 'reserved') && (
              <form onSubmit={handleAdmit} className="space-y-4">
                <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-sky-400" />
                  <span>Admit Patient to {selectedBed.bedNumber}</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Select Patient *</label>
                    <select
                      required
                      value={admitPatientId}
                      onChange={(e) => setAdmitPatientId(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
                    >
                      <option value="">Choose eligible patient...</option>
                      {admitCandidates.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.fullName} ({p.mrn})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Attending Physician *</label>
                    <select
                      required
                      value={admitDoctorId}
                      onChange={(e) => setAdmitDoctorId(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
                    >
                      {doctors.map((d) => (
                        <option key={d._id} value={d._id}>
                          {d.fullName} ({d.department})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Admission Diagnosis / Indication *</label>
                  <input
                    type="text"
                    required
                    value={admitDiagnosis}
                    onChange={(e) => setAdmitDiagnosis(e.target.value)}
                    placeholder="e.g. Post-operative cardiac telemetry, Acute dehydration"
                    className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submitting || !admitPatientId}
                    className="px-4 py-2 text-xs font-medium bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-md"
                  >
                    {submitting ? 'Admitting...' : 'Confirm Admission'}
                  </button>
                </div>
              </form>
            )}

            {/* Bed Maintenance / Reservation Controls */}
            {currentUser.role !== 'doctor' && (
              <div className="pt-4 border-t border-[#1F2937] space-y-3">
                <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-slate-400" />
                  <span>Bed Operational Status</span>
                </h3>
                <input
                  type="text"
                  value={maintenanceNote}
                  onChange={(e) => setMaintenanceNote(e.target.value)}
                  placeholder="Optional reservation or maintenance note..."
                  className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
                />
                <div className="flex flex-wrap gap-2">
                  {(['available', 'reserved', 'maintenance'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      disabled={submitting || selectedBed.status === st}
                      onClick={() => handleBedStatusChange(st)}
                      className="px-3 py-1.5 text-xs font-medium capitalize bg-[#1E293B] hover:bg-[#334155] disabled:opacity-40 text-slate-200 border border-[#334155] rounded-md"
                    >
                      Mark {st}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
