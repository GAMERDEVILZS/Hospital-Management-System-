import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BedDouble,
  FileText,
  FlaskConical,
  Pill,
  Plus,
  Receipt,
  Check,
} from 'lucide-react';
import { api, type PatientEHRBundle } from '../lib/api';
import { calculateAge, formatCurrency, formatDateTime, formatShortDate } from '../lib/format';
import type { PharmacyItem, StaffUser } from '../types/hms';
import { SlideOver } from './ui/Modal';

interface PatientEHRDrawerProps {
  patientId: string | null;
  onClose: () => void;
  currentUser: StaffUser;
  onNotify: (type: 'success' | 'error', text: string) => void;
  onDataChanged: () => void;
}

type EHRTab = 'vitals' | 'notes' | 'prescriptions' | 'labs' | 'billing';

export function PatientEHRDrawer({
  patientId,
  onClose,
  currentUser,
  onNotify,
  onDataChanged,
}: PatientEHRDrawerProps) {
  const [bundle, setBundle] = useState<PatientEHRBundle | null>(null);
  const [pharmacyItems, setPharmacyItems] = useState<PharmacyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<EHRTab>('vitals');

  // Vitals form
  const [showVitalForm, setShowVitalForm] = useState(false);
  const [bp, setBp] = useState('120/78');
  const [hr, setHr] = useState('74');
  const [temp, setTemp] = useState('36.8');
  const [spo2, setSpo2] = useState('98');
  const [rr, setRr] = useState('16');
  const [weight, setWeight] = useState('72');

  // Clinical Note form
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [treatmentPlan, setTreatmentPlan] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');

  // Prescription form
  const [showRxForm, setShowRxForm] = useState(false);
  const [selectedMedId, setSelectedMedId] = useState('');
  const [medName, setMedName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('Twice daily');
  const [duration, setDuration] = useState('7 days');
  const [quantity, setQuantity] = useState('14');
  const [instructions, setInstructions] = useState('');
  const [dispenseNow, setDispenseNow] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const canWriteClinical = currentUser.role === 'admin' || currentUser.role === 'doctor';

  const loadBundle = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const [ehr, meds] = await Promise.all([api.getPatientEHR(patientId), api.getPharmacy()]);
      setBundle(ehr);
      setPharmacyItems(meds);
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [patientId, onNotify]);

  useEffect(() => {
    if (patientId) {
      setActiveTab('vitals');
      setShowVitalForm(false);
      setShowNoteForm(false);
      setShowRxForm(false);
      loadBundle();
    } else {
      setBundle(null);
    }
  }, [patientId, loadBundle]);

  async function handleSaveVitals(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId) return;
    setSubmitting(true);
    try {
      await api.addPatientVitals(patientId, {
        bloodPressure: bp,
        heartRate: Number(hr),
        temperature: Number(temp),
        spo2: Number(spo2),
        respiratoryRate: Number(rr),
        weightKg: Number(weight),
      });
      setShowVitalForm(false);
      onNotify('success', 'Vitals recorded to patient chart.');
      await loadBundle();
      onDataChanged();
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveNote(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId) return;
    setSubmitting(true);
    try {
      await api.addClinicalNote(patientId, {
        chiefComplaint,
        diagnosis,
        treatmentPlan,
        followUpDate: followUpDate || undefined,
      });
      setChiefComplaint('');
      setDiagnosis('');
      setTreatmentPlan('');
      setFollowUpDate('');
      setShowNoteForm(false);
      onNotify('success', 'Clinical encounter note saved.');
      await loadBundle();
      onDataChanged();
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSaveRx(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId) return;
    setSubmitting(true);
    try {
      await api.addPrescription(patientId, {
        medicationName: medName,
        pharmacyItemId: selectedMedId || undefined,
        dosage,
        frequency,
        duration,
        quantity: Number(quantity) || 1,
        instructions,
        dispenseNow,
      });
      setSelectedMedId('');
      setMedName('');
      setDosage('');
      setInstructions('');
      setDispenseNow(false);
      setShowRxForm(false);
      onNotify(
        'success',
        dispenseNow ? 'Prescription added and dispensed from pharmacy stock.' : 'Prescription added to EHR.'
      );
      await loadBundle();
      onDataChanged();
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDispenseRx(rxId: string) {
    if (!patientId) return;
    try {
      await api.dispensePrescription(patientId, rxId);
      onNotify('success', 'Medication dispensed and inventory updated.');
      await loadBundle();
      onDataChanged();
    } catch (err) {
      onNotify('error', (err as Error).message);
    }
  }

  const patient = bundle?.patient;

  return (
    <SlideOver
      open={Boolean(patientId)}
      onClose={onClose}
      title={patient ? patient.fullName : 'Loading Patient Chart...'}
      subtitle={
        patient
          ? `${patient.mrn} · ${patient.gender}, ${calculateAge(patient.dateOfBirth)} yrs · Blood ${patient.bloodGroup} · ${patient.phone}`
          : undefined
      }
    >
      {loading && !patient ? (
        <div className="p-6 space-y-4">
          <div className="h-20 bg-[#111827] rounded-md animate-pulse" />
          <div className="h-48 bg-[#111827] rounded-md animate-pulse" />
        </div>
      ) : patient ? (
        <div className="p-6 space-y-6">
          {/* Patient Summary Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-5 border-b border-[#1F2937] text-xs">
            <div>
              <div className="text-slate-400">Status</div>
              <div className="mt-1 font-medium text-slate-100 capitalize">{patient.status}</div>
            </div>
            <div>
              <div className="text-slate-400">Insurance</div>
              <div className="mt-1 font-medium text-slate-100 truncate">
                {patient.insuranceProvider}
              </div>
              {patient.insurancePolicyNumber && (
                <div className="font-mono text-[11px] text-slate-400">
                  {patient.insurancePolicyNumber}
                </div>
              )}
            </div>
            <div>
              <div className="text-slate-400">Emergency Contact</div>
              <div className="mt-1 font-medium text-slate-100 truncate">
                {patient.emergencyContactName || '—'}
              </div>
              <div className="font-mono text-[11px] text-slate-400">
                {patient.emergencyContactPhone || ''}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Inpatient Bed</div>
              {bundle.activeBed ? (
                <div className="mt-1 flex items-center gap-1.5 text-sky-400 font-mono font-medium">
                  <BedDouble className="w-3.5 h-3.5" />
                  <span>{bundle.activeBed.bedNumber}</span>
                </div>
              ) : (
                <div className="mt-1 text-slate-500">Not admitted</div>
              )}
            </div>
          </div>

          {/* Allergies Alert */}
          {patient.allergies.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-md bg-red-500/10 border border-red-500/30 text-xs text-red-200">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <div>
                <span className="font-semibold text-red-300">Documented Allergies: </span>
                <span>{patient.allergies.join(' · ')}</span>
              </div>
            </div>
          )}

          {/* Segmented Tabs */}
          <div className="flex items-center gap-1 p-1 bg-[#111827] border border-[#1F2937] rounded-md overflow-x-auto">
            {(
              [
                { id: 'vitals', label: `Vitals (${patient.vitals.length})`, icon: Activity },
                { id: 'notes', label: `Clinical Notes (${patient.clinicalNotes.length})`, icon: FileText },
                { id: 'prescriptions', label: `Prescriptions (${patient.prescriptions.length})`, icon: Pill },
                { id: 'labs', label: `Labs (${bundle.labOrders.length})`, icon: FlaskConical },
                { id: 'billing', label: `Invoices (${bundle.invoices.length})`, icon: Receipt },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    active
                      ? 'bg-[#1E293B] text-sky-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* TAB: VITALS */}
          {activeTab === 'vitals' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100">Vital Signs Flowsheet</h3>
                <button
                  type="button"
                  onClick={() => setShowVitalForm((v) => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 border border-sky-500/30 rounded-md whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{showVitalForm ? 'Cancel' : 'Record Vitals'}</span>
                </button>
              </div>

              {showVitalForm && (
                <form
                  onSubmit={handleSaveVitals}
                  className="p-4 rounded-md bg-[#111827] border border-[#334155] space-y-3"
                >
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">BP (mmHg)</label>
                      <input
                        type="text"
                        required
                        value={bp}
                        onChange={(e) => setBp(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Heart Rate (bpm)</label>
                      <input
                        type="number"
                        required
                        value={hr}
                        onChange={(e) => setHr(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Temp (°C)</label>
                      <input
                        type="number"
                        step="0.1"
                        required
                        value={temp}
                        onChange={(e) => setTemp(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">SpO2 (%)</label>
                      <input
                        type="number"
                        required
                        value={spo2}
                        onChange={(e) => setSpo2(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Resp Rate (/min)</label>
                      <input
                        type="number"
                        required
                        value={rr}
                        onChange={(e) => setRr(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Weight (kg)</label>
                      <input
                        type="number"
                        step="0.1"
                        required
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-4 py-1.5 text-xs font-medium bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-md"
                    >
                      {submitting ? 'Saving...' : 'Save Vitals'}
                    </button>
                  </div>
                </form>
              )}

              {patient.vitals.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400 border border-[#1F2937] rounded-md">
                  No vitals logged for this patient yet.
                </div>
              ) : (
                <div className="border border-[#1F2937] rounded-md overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-[#111827] text-slate-400 border-b border-[#1F2937]">
                      <tr>
                        <th className="text-left font-medium px-3 py-2.5">Recorded</th>
                        <th className="text-right font-medium px-3 py-2.5">BP</th>
                        <th className="text-right font-medium px-3 py-2.5">HR</th>
                        <th className="text-right font-medium px-3 py-2.5">Temp</th>
                        <th className="text-right font-medium px-3 py-2.5">SpO2</th>
                        <th className="text-right font-medium px-3 py-2.5">RR</th>
                        <th className="text-left font-medium px-3 py-2.5">By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1F2937]">
                      {patient.vitals.map((v) => (
                        <tr key={v._id} className="hover:bg-[#1E293B]/40">
                          <td className="px-3 py-2.5 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                            {formatDateTime(v.recordedAt)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-100">
                            {v.bloodPressure}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-200">
                            {v.heartRate}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-200">
                            {v.temperature.toFixed(1)}°C
                          </td>
                          <td
                            className={`px-3 py-2.5 text-right font-mono tabular-nums ${
                              v.spo2 < 94 ? 'text-red-400 font-semibold' : 'text-emerald-400'
                            }`}
                          >
                            {v.spo2}%
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-300">
                            {v.respiratoryRate}
                          </td>
                          <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
                            {v.recordedBy}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB: CLINICAL NOTES */}
          {activeTab === 'notes' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100">Clinical Encounters &amp; Diagnoses</h3>
                {canWriteClinical && (
                  <button
                    type="button"
                    onClick={() => setShowNoteForm((v) => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 border border-sky-500/30 rounded-md whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{showNoteForm ? 'Cancel' : 'Add Clinical Note'}</span>
                  </button>
                )}
              </div>

              {showNoteForm && canWriteClinical && (
                <form
                  onSubmit={handleSaveNote}
                  className="p-4 rounded-md bg-[#111827] border border-[#334155] space-y-3"
                >
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Chief Complaint</label>
                    <input
                      type="text"
                      required
                      value={chiefComplaint}
                      onChange={(e) => setChiefComplaint(e.target.value)}
                      placeholder="Presenting symptoms and onset"
                      className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Assessment / Diagnosis</label>
                    <input
                      type="text"
                      required
                      value={diagnosis}
                      onChange={(e) => setDiagnosis(e.target.value)}
                      placeholder="Primary clinical impression"
                      className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Treatment &amp; Management Plan</label>
                    <textarea
                      rows={3}
                      value={treatmentPlan}
                      onChange={(e) => setTreatmentPlan(e.target.value)}
                      placeholder="Interventions, medications, monitoring orders"
                      className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="w-48">
                      <label className="block text-[11px] text-slate-400 mb-1">Follow-up Date (Optional)</label>
                      <input
                        type="date"
                        value={followUpDate}
                        onChange={(e) => setFollowUpDate(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-[#0B1120] border border-[#334155] rounded text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="self-end px-4 py-2 text-xs font-medium bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-md"
                    >
                      {submitting ? 'Saving...' : 'Sign & Save Note'}
                    </button>
                  </div>
                </form>
              )}

              {patient.clinicalNotes.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400 border border-[#1F2937] rounded-md">
                  No clinical encounter notes recorded yet.
                </div>
              ) : (
                <div className="divide-y divide-[#1F2937] border border-[#1F2937] rounded-md bg-[#111827]">
                  {patient.clinicalNotes.map((note) => (
                    <div key={note._id} className="p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-slate-100">{note.diagnosis}</span>
                        <span className="font-mono tabular-nums text-slate-400 whitespace-nowrap">
                          {formatDateTime(note.date)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">
                        {note.doctorName} · {note.department}
                      </div>
                      <div className="text-xs text-slate-300 pt-1">
                        <span className="text-slate-400">Complaint: </span>
                        {note.chiefComplaint}
                      </div>
                      {note.treatmentPlan && (
                        <div className="text-xs text-slate-300">
                          <span className="text-slate-400">Plan: </span>
                          {note.treatmentPlan}
                        </div>
                      )}
                      {note.followUpDate && (
                        <div className="text-xs text-sky-400">
                          Scheduled follow-up: {formatShortDate(note.followUpDate)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: PRESCRIPTIONS */}
          {activeTab === 'prescriptions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100">Medication Orders</h3>
                {canWriteClinical && (
                  <button
                    type="button"
                    onClick={() => setShowRxForm((v) => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 border border-sky-500/30 rounded-md whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{showRxForm ? 'Cancel' : 'Write Prescription'}</span>
                  </button>
                )}
              </div>

              {showRxForm && canWriteClinical && (
                <form
                  onSubmit={handleSaveRx}
                  className="p-4 rounded-md bg-[#111827] border border-[#334155] space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Link Pharmacy Formulary (Optional)</label>
                      <select
                        value={selectedMedId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setSelectedMedId(id);
                          const found = pharmacyItems.find((m) => m._id === id);
                          if (found) setMedName(found.name);
                        }}
                        className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded text-slate-100 focus:outline-none focus:border-sky-500"
                      >
                        <option value="">Custom medication entry...</option>
                        {pharmacyItems.map((m) => (
                          <option key={m._id} value={m._id}>
                            {m.name} (Stock: {m.stockQty})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Medication Name</label>
                      <input
                        type="text"
                        required
                        value={medName}
                        onChange={(e) => setMedName(e.target.value)}
                        placeholder="e.g. Amoxicillin 500mg"
                        className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Dosage</label>
                      <input
                        type="text"
                        required
                        value={dosage}
                        onChange={(e) => setDosage(e.target.value)}
                        placeholder="e.g. 500 mg"
                        className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Frequency</label>
                      <input
                        type="text"
                        required
                        value={frequency}
                        onChange={(e) => setFrequency(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Duration</label>
                      <input
                        type="text"
                        required
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Quantity (Units)</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Administration Instructions</label>
                    <input
                      type="text"
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      placeholder="Take with meals, hold parameters, etc."
                      className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={dispenseNow}
                        disabled={!selectedMedId}
                        onChange={(e) => setDispenseNow(e.target.checked)}
                        className="rounded border-slate-600 bg-[#0B1120]"
                      />
                      <span className={!selectedMedId ? 'text-slate-500' : ''}>
                        Dispense immediately from pharmacy stock
                      </span>
                    </label>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-4 py-1.5 text-xs font-medium bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-md"
                    >
                      {submitting ? 'Saving...' : 'Order Medication'}
                    </button>
                  </div>
                </form>
              )}

              {patient.prescriptions.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400 border border-[#1F2937] rounded-md">
                  No prescriptions ordered for this patient.
                </div>
              ) : (
                <div className="divide-y divide-[#1F2937] border border-[#1F2937] rounded-md bg-[#111827]">
                  {patient.prescriptions.map((rx) => (
                    <div key={rx._id} className="p-4 flex items-start justify-between gap-4">
                      <div className="space-y-1 min-w-0">
                        <div className="text-sm font-medium text-slate-100">{rx.medicationName}</div>
                        <div className="text-xs text-slate-300">
                          {rx.dosage} · {rx.frequency} · {rx.duration} ·{' '}
                          <span className="font-mono tabular-nums">Qty {rx.quantity}</span>
                        </div>
                        <div className="text-xs text-slate-400">
                          Prescribed by {rx.doctorName} · {formatShortDate(rx.date)}
                        </div>
                        {rx.instructions && (
                          <div className="text-xs text-slate-400 italic">{rx.instructions}</div>
                        )}
                      </div>
                      <div className="shrink-0">
                        {rx.dispensed ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
                            <Check className="w-3.5 h-3.5" />
                            Dispensed
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDispenseRx(rx._id)}
                            className="px-3 py-1.5 text-xs font-medium text-slate-100 bg-[#1E293B] hover:bg-sky-500/20 hover:text-sky-300 border border-[#334155] rounded-md whitespace-nowrap"
                          >
                            Dispense Stock
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: LABS */}
          {activeTab === 'labs' && (
            <div className="space-y-3">
              {bundle.labOrders.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400 border border-[#1F2937] rounded-md">
                  No laboratory orders on record.
                </div>
              ) : (
                bundle.labOrders.map((order) => (
                  <div
                    key={order._id}
                    className="p-4 rounded-md bg-[#111827] border border-[#1F2937] space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-slate-100">{order.testName}</div>
                        <div className="text-xs text-slate-400 mt-0.5 font-mono">
                          {order.orderCode} · {order.category} · {order.priority} · {order.doctorName}
                        </div>
                      </div>
                      <span
                        className={`text-xs font-medium capitalize ${
                          order.status === 'completed'
                            ? 'text-emerald-400'
                            : order.priority === 'STAT'
                            ? 'text-red-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {order.status.replace('_', ' ')}
                      </span>
                    </div>

                    {order.results.length > 0 && (
                      <table className="w-full text-xs border-t border-[#1F2937]">
                        <thead className="text-slate-400">
                          <tr>
                            <th className="text-left py-2 font-medium">Parameter</th>
                            <th className="text-right py-2 font-medium">Result</th>
                            <th className="text-right py-2 font-medium">Reference</th>
                            <th className="text-right py-2 font-medium">Flag</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1F2937]">
                          {order.results.map((r, idx) => (
                            <tr key={idx}>
                              <td className="py-1.5 text-slate-200">{r.parameter}</td>
                              <td className="py-1.5 text-right font-mono tabular-nums text-slate-100">
                                {r.value} {r.unit}
                              </td>
                              <td className="py-1.5 text-right font-mono tabular-nums text-slate-400">
                                {r.referenceRange}
                              </td>
                              <td
                                className={`py-1.5 text-right font-medium ${
                                  r.flag === 'Critical'
                                    ? 'text-red-400'
                                    : r.flag === 'High' || r.flag === 'Low'
                                    ? 'text-amber-400'
                                    : 'text-emerald-400'
                                }`}
                              >
                                {r.flag}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB: BILLING */}
          {activeTab === 'billing' && (
            <div className="space-y-3">
              {bundle.invoices.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400 border border-[#1F2937] rounded-md">
                  No billing invoices found for this patient.
                </div>
              ) : (
                <div className="border border-[#1F2937] rounded-md overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-[#111827] text-slate-400 border-b border-[#1F2937]">
                      <tr>
                        <th className="text-left px-3 py-2.5 font-medium">Invoice</th>
                        <th className="text-left px-3 py-2.5 font-medium">Issued</th>
                        <th className="text-right px-3 py-2.5 font-medium">Due</th>
                        <th className="text-right px-3 py-2.5 font-medium">Paid</th>
                        <th className="text-right px-3 py-2.5 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1F2937] bg-[#0F172A]">
                      {bundle.invoices.map((inv) => (
                        <tr key={inv._id}>
                          <td className="px-3 py-2.5 font-mono text-slate-100">
                            {inv.invoiceNumber}
                          </td>
                          <td className="px-3 py-2.5 font-mono tabular-nums text-slate-400">
                            {formatShortDate(inv.issuedAt)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-slate-200">
                            {formatCurrency(inv.totalDue)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums text-emerald-400">
                            {formatCurrency(inv.amountPaid)}
                          </td>
                          <td
                            className={`px-3 py-2.5 text-right font-medium capitalize ${
                              inv.status === 'paid'
                                ? 'text-emerald-400'
                                : inv.status === 'overdue'
                                ? 'text-red-400'
                                : 'text-amber-400'
                            }`}
                          >
                            {inv.status}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}
    </SlideOver>
  );
}
