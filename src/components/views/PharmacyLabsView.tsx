import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  FlaskConical,
  Minus,
  Pill,
  Plus,
  Printer,
  Search,
} from 'lucide-react';
import { api, type EnrichedLabOrder } from '../../lib/api';
import { formatCurrency, formatDateTime, formatShortDate } from '../../lib/format';
import type {
  Doctor,
  LabPriority,
  LabResultParameter,
  LabStatus,
  Patient,
  PharmacyItem,
  StaffUser,
} from '../../types/hms';
import { Modal } from '../ui/Modal';

interface PharmacyLabsViewProps {
  currentUser: StaffUser;
  onNotify: (type: 'success' | 'error', text: string) => void;
  onGlobalChange: () => void;
}

export function PharmacyLabsView({
  currentUser,
  onNotify,
  onGlobalChange,
}: PharmacyLabsViewProps) {
  const [section, setSection] = useState<'pharmacy' | 'labs'>('pharmacy');

  // Pharmacy state
  const [items, setItems] = useState<PharmacyItem[]>([]);
  const [phSearch, setPhSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [addMedOpen, setAddMedOpen] = useState(false);
  const [medForm, setMedForm] = useState({
    name: '',
    genericName: '',
    category: 'Cardiovascular',
    batchNumber: '',
    stockQty: '100',
    reorderLevel: '30',
    unitPrice: '12.50',
    expiryDate: '2027-12-31',
    supplier: 'McKesson Clinical Supply',
  });
  const [adjustItem, setAdjustItem] = useState<PharmacyItem | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('25');

  // Labs state
  const [labOrders, setLabOrders] = useState<EnrichedLabOrder[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [labSearch, setLabSearch] = useState('');
  const [labStatusFilter, setLabStatusFilter] = useState<'all' | LabStatus>('all');

  const [newLabOpen, setNewLabOpen] = useState(false);
  const [labForm, setLabForm] = useState({
    patientId: '',
    doctorId: '',
    testName: '',
    category: 'Biochemistry',
    priority: 'Routine' as LabPriority,
    notes: '',
  });

  const [activeLab, setActiveLab] = useState<EnrichedLabOrder | null>(null);
  const [resultRows, setResultRows] = useState<LabResultParameter[]>([]);
  const [labNotes, setLabNotes] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadPharmacy = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getPharmacy({
        search: phSearch.trim() || undefined,
        lowStock: lowStockOnly,
      });
      setItems(data);
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [phSearch, lowStockOnly, onNotify]);

  const loadLabs = useCallback(async () => {
    setLoading(true);
    try {
      const [orders, pats, docs] = await Promise.all([
        api.getLabs({
          search: labSearch.trim() || undefined,
          status: labStatusFilter,
        }),
        api.getPatients(),
        api.getDoctors(),
      ]);
      setLabOrders(orders);
      setPatients(pats);
      setDoctors(docs);
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [labSearch, labStatusFilter, onNotify]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (section === 'pharmacy') {
        loadPharmacy();
      } else {
        loadLabs();
      }
    }, 120);
    return () => clearTimeout(t);
  }, [section, loadPharmacy, loadLabs]);

  async function handleAddMedication(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createPharmacyItem({
        name: medForm.name,
        genericName: medForm.genericName,
        category: medForm.category,
        batchNumber: medForm.batchNumber,
        stockQty: Number(medForm.stockQty),
        reorderLevel: Number(medForm.reorderLevel),
        unitPrice: Number(medForm.unitPrice),
        expiryDate: medForm.expiryDate,
        supplier: medForm.supplier,
      });
      setAddMedOpen(false);
      setMedForm({
        name: '',
        genericName: '',
        category: 'Cardiovascular',
        batchNumber: '',
        stockQty: '100',
        reorderLevel: '30',
        unitPrice: '12.50',
        expiryDate: '2027-12-31',
        supplier: 'McKesson Clinical Supply',
      });
      onNotify('success', 'Medication added to pharmacy formulary.');
      await loadPharmacy();
      onGlobalChange();
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleStockAdjust(sign: 1 | -1) {
    if (!adjustItem) return;
    const qty = Math.abs(Number(adjustDelta) || 0);
    if (qty <= 0) return;
    setSaving(true);
    try {
      await api.adjustPharmacyStock(adjustItem._id, sign * qty);
      onNotify(
        'success',
        `${sign > 0 ? 'Restocked' : 'Dispensed'} ${qty} units of ${adjustItem.name}.`
      );
      setAdjustItem(null);
      await loadPharmacy();
      onGlobalChange();
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateLab(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createLabOrder(labForm);
      setNewLabOpen(false);
      onNotify('success', 'Diagnostic lab test ordered.');
      await loadLabs();
      onGlobalChange();
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAdvanceLab(order: EnrichedLabOrder, nextStatus: LabStatus) {
    try {
      await api.updateLabOrder(order._id, { status: nextStatus });
      onNotify('success', `${order.orderCode} updated to ${nextStatus.replace('_', ' ')}.`);
      await loadLabs();
      onGlobalChange();
    } catch (err) {
      onNotify('error', (err as Error).message);
    }
  }

  function openLabResultsModal(order: EnrichedLabOrder) {
    setActiveLab(order);
    setLabNotes(order.notes || '');
    setResultRows(
      order.results.length > 0
        ? order.results.map((r) => ({ ...r }))
        : [{ parameter: '', value: '', unit: '', referenceRange: '', flag: 'Normal' }]
    );
  }

  async function handleSaveLabResults(e: React.FormEvent) {
    e.preventDefault();
    if (!activeLab) return;
    const cleanRows = resultRows.filter((r) => r.parameter.trim() && r.value.trim());
    setSaving(true);
    try {
      await api.updateLabOrder(activeLab._id, {
        status: 'completed',
        results: cleanRows,
        notes: labNotes,
      });
      onNotify('success', `Diagnostic report finalized for ${activeLab.orderCode}.`);
      setActiveLab(null);
      await loadLabs();
      onGlobalChange();
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Sub-module Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 bg-[#111827] border border-[#1F2937] rounded-md self-start">
          <button
            type="button"
            onClick={() => setSection('pharmacy')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded whitespace-nowrap transition-colors ${
              section === 'pharmacy'
                ? 'bg-[#1E293B] text-sky-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Pill className="w-3.5 h-3.5" />
            <span>Pharmacy Inventory</span>
          </button>
          <button
            type="button"
            onClick={() => setSection('labs')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded whitespace-nowrap transition-colors ${
              section === 'labs'
                ? 'bg-[#1E293B] text-sky-300'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span>Lab Test Orders &amp; Reports</span>
          </button>
        </div>

        {section === 'pharmacy' ? (
          (currentUser.role === 'admin' || currentUser.role === 'doctor') && (
            <button
              type="button"
              onClick={() => setAddMedOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-md whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Medication</span>
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={() => {
              setLabForm({
                patientId: patients[0]?._id || '',
                doctorId: doctors[0]?._id || '',
                testName: '',
                category: 'Biochemistry',
                priority: 'Routine',
                notes: '',
              });
              setNewLabOpen(true);
            }}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-md whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Order Lab Test</span>
          </button>
        )}
      </div>

      {/* SECTION: PHARMACY INVENTORY */}
      {section === 'pharmacy' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={phSearch}
                onChange={(e) => setPhSearch(e.target.value)}
                placeholder="Search SKU, brand, generic, batch..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#111827] border border-[#334155] rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            <button
              type="button"
              onClick={() => setLowStockOnly((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md border whitespace-nowrap transition-colors ${
                lowStockOnly
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                  : 'bg-[#111827] border-[#334155] text-slate-300 hover:text-slate-100'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Low Stock Only</span>
            </button>
          </div>

          <div className="rounded-lg bg-[#111827] border border-[#1F2937] overflow-hidden">
            {loading && items.length === 0 ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-10 bg-[#1E293B]/60 rounded animate-pulse" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No pharmacy items match this filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#0F172A] text-slate-400 border-b border-[#1F2937]">
                    <tr>
                      <th className="text-left font-medium px-5 py-3">SKU</th>
                      <th className="text-left font-medium px-3 py-3">Medication</th>
                      <th className="text-left font-medium px-3 py-3">Category &amp; Batch</th>
                      <th className="text-right font-medium px-3 py-3">In Stock</th>
                      <th className="text-right font-medium px-3 py-3">Unit Price</th>
                      <th className="text-left font-medium px-3 py-3">Expiry</th>
                      <th className="text-right font-medium px-5 py-3">Adjust</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1F2937]">
                    {items.map((item) => {
                      const isLow = item.stockQty <= item.reorderLevel;
                      return (
                        <tr key={item._id} className="hover:bg-[#1E293B]/45 transition-colors">
                          <td className="px-5 py-3 font-mono text-slate-400 whitespace-nowrap">
                            {item.sku}
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-medium text-slate-100">{item.name}</div>
                            <div className="text-[11px] text-slate-400">{item.genericName}</div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="text-slate-200">{item.category}</div>
                            <div className="font-mono text-[11px] text-slate-500">
                              {item.batchNumber} · {item.supplier}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right whitespace-nowrap">
                            <div
                              className={`font-mono tabular-nums font-semibold ${
                                isLow ? 'text-amber-400' : 'text-emerald-400'
                              }`}
                            >
                              {item.stockQty}
                            </div>
                            <div className="font-mono tabular-nums text-[11px] text-slate-500">
                              {isLow ? `Below min (${item.reorderLevel})` : `Min ${item.reorderLevel}`}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-200 whitespace-nowrap">
                            {formatCurrency(item.unitPrice)}
                          </td>
                          <td className="px-3 py-3 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                            {formatShortDate(item.expiryDate)}
                          </td>
                          <td className="px-5 py-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => {
                                setAdjustItem(item);
                                setAdjustDelta('20');
                              }}
                              className="px-3 py-1.5 text-xs font-medium text-slate-200 hover:text-sky-300 bg-[#1E293B] border border-[#334155] rounded transition-colors"
                            >
                              Restock / Dispense
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION: LABORATORY & DIAGNOSTICS */}
      {section === 'labs' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={labSearch}
                onChange={(e) => setLabSearch(e.target.value)}
                placeholder="Search order code, test, patient..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#111827] border border-[#334155] rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#111827] border border-[#1F2937] rounded-md overflow-x-auto">
              {(
                [
                  ['all', 'All Orders'],
                  ['ordered', 'Ordered'],
                  ['sample_collected', 'Sample Collected'],
                  ['in_analysis', 'In Analysis'],
                  ['completed', 'Completed'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setLabStatusFilter(val)}
                  className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap transition-colors ${
                    labStatusFilter === val
                      ? 'bg-[#1E293B] text-sky-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg bg-[#111827] border border-[#1F2937] overflow-hidden">
            {loading && labOrders.length === 0 ? (
              <div className="p-6 space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-10 bg-[#1E293B]/60 rounded animate-pulse" />
                ))}
              </div>
            ) : labOrders.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No laboratory orders found.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#0F172A] text-slate-400 border-b border-[#1F2937]">
                    <tr>
                      <th className="text-left font-medium px-5 py-3">Order Code</th>
                      <th className="text-left font-medium px-3 py-3">Diagnostic Panel</th>
                      <th className="text-left font-medium px-3 py-3">Patient</th>
                      <th className="text-left font-medium px-3 py-3">Priority</th>
                      <th className="text-left font-medium px-3 py-3">Stage</th>
                      <th className="text-right font-medium px-5 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1F2937]">
                    {labOrders.map((order) => {
                      const hasCritical = order.results.some((r) => r.flag === 'Critical');
                      return (
                        <tr key={order._id} className="hover:bg-[#1E293B]/45 transition-colors">
                          <td className="px-5 py-3 font-mono text-sky-400 whitespace-nowrap">
                            {order.orderCode}
                            <div className="text-[11px] text-slate-500">
                              {formatDateTime(order.orderedAt)}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-medium text-slate-100">{order.testName}</div>
                            <div className="text-[11px] text-slate-400">
                              {order.category} · Ordered by {order.doctorName}
                            </div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <div className="text-slate-100">{order.patientName}</div>
                            <div className="font-mono text-[11px] text-slate-400">
                              {order.patientMrn}
                            </div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span
                              className={`font-mono font-medium ${
                                order.priority === 'STAT'
                                  ? 'text-red-400'
                                  : order.priority === 'Urgent'
                                  ? 'text-amber-400'
                                  : 'text-slate-300'
                              }`}
                            >
                              {order.priority}
                            </span>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span
                              className={`font-medium capitalize ${
                                hasCritical
                                  ? 'text-red-400'
                                  : order.status === 'completed'
                                  ? 'text-emerald-400'
                                  : 'text-amber-400'
                              }`}
                            >
                              {hasCritical ? 'Completed · Critical' : order.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              {order.status === 'ordered' && (
                                <button
                                  type="button"
                                  onClick={() => handleAdvanceLab(order, 'sample_collected')}
                                  className="px-2.5 py-1 text-xs font-medium text-amber-300 border border-amber-500/30 hover:bg-amber-500/15 rounded"
                                >
                                  Collect Sample
                                </button>
                              )}
                              {order.status === 'sample_collected' && (
                                <button
                                  type="button"
                                  onClick={() => handleAdvanceLab(order, 'in_analysis')}
                                  className="px-2.5 py-1 text-xs font-medium text-sky-300 border border-sky-500/30 hover:bg-sky-500/15 rounded"
                                >
                                  Start Analysis
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => openLabResultsModal(order)}
                                className="px-2.5 py-1 text-xs font-medium text-slate-200 bg-[#1E293B] hover:text-sky-300 border border-[#334155] rounded"
                              >
                                {order.status === 'completed' ? 'View Report' : 'Enter Results'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Adjust Stock Modal */}
      <Modal
        open={Boolean(adjustItem)}
        onClose={() => setAdjustItem(null)}
        title={adjustItem ? `Adjust Inventory — ${adjustItem.name}` : 'Adjust Stock'}
        subtitle={
          adjustItem
            ? `SKU ${adjustItem.sku} · Current Stock: ${adjustItem.stockQty} · Reorder Level: ${adjustItem.reorderLevel}`
            : undefined
        }
        maxWidth="md"
      >
        {adjustItem && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Quantity (Units)
              </label>
              <input
                type="number"
                min="1"
                value={adjustDelta}
                onChange={(e) => setAdjustDelta(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => handleStockAdjust(1)}
                className="inline-flex items-center justify-center gap-1.5 py-2.5 px-4 text-xs font-medium bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/35 rounded-md"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Restock (+{adjustDelta || 0})</span>
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleStockAdjust(-1)}
                className="inline-flex items-center justify-center gap-1.5 py-2.5 px-4 text-xs font-medium bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/35 rounded-md"
              >
                <Minus className="w-3.5 h-3.5" />
                <span>Dispense (-{adjustDelta || 0})</span>
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Medication Modal */}
      <Modal
        open={addMedOpen}
        onClose={() => setAddMedOpen(false)}
        title="Add Formulary Medication"
        subtitle="Register new drug SKU into Meridian Clinical pharmacy inventory"
      >
        <form onSubmit={handleAddMedication} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Medication Name *</label>
              <input
                type="text"
                required
                value={medForm.name}
                onChange={(e) => setMedForm({ ...medForm, name: e.target.value })}
                placeholder="e.g. Lisinopril 20mg"
                className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Generic Name</label>
              <input
                type="text"
                value={medForm.genericName}
                onChange={(e) => setMedForm({ ...medForm, genericName: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Category *</label>
              <select
                value={medForm.category}
                onChange={(e) => setMedForm({ ...medForm, category: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              >
                <option value="Cardiovascular">Cardiovascular</option>
                <option value="Antibiotic">Antibiotic</option>
                <option value="Anticoagulant">Anticoagulant</option>
                <option value="Analgesic">Analgesic</option>
                <option value="Respiratory">Respiratory</option>
                <option value="Neurology">Neurology</option>
                <option value="Endocrine">Endocrine</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Batch Number</label>
              <input
                type="text"
                value={medForm.batchNumber}
                onChange={(e) => setMedForm({ ...medForm, batchNumber: e.target.value })}
                placeholder="BT-2612L"
                className="w-full px-3 py-2 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Opening Stock *</label>
              <input
                type="number"
                min="0"
                required
                value={medForm.stockQty}
                onChange={(e) => setMedForm({ ...medForm, stockQty: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Reorder Threshold *</label>
              <input
                type="number"
                min="1"
                required
                value={medForm.reorderLevel}
                onChange={(e) => setMedForm({ ...medForm, reorderLevel: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Unit Price ($) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={medForm.unitPrice}
                onChange={(e) => setMedForm({ ...medForm, unitPrice: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Expiry Date *</label>
              <input
                type="date"
                required
                value={medForm.expiryDate}
                onChange={(e) => setMedForm({ ...medForm, expiryDate: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[#1F2937]">
            <button
              type="button"
              onClick={() => setAddMedOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:bg-[#1E293B] rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-medium bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-md"
            >
              {saving ? 'Saving...' : 'Add to Formulary'}
            </button>
          </div>
        </form>
      </Modal>

      {/* New Lab Order Modal */}
      <Modal
        open={newLabOpen}
        onClose={() => setNewLabOpen(false)}
        title="Order Diagnostic Lab Test"
        subtitle="Queues specimen collection and assigns diagnostic accession number"
      >
        <form onSubmit={handleCreateLab} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Patient *</label>
              <select
                required
                value={labForm.patientId}
                onChange={(e) => setLabForm({ ...labForm, patientId: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              >
                {patients.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.fullName} ({p.mrn})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Ordering Physician *</label>
              <select
                required
                value={labForm.doctorId}
                onChange={(e) => setLabForm({ ...labForm, doctorId: e.target.value })}
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
            <label className="block text-xs text-slate-300 mb-1">Test / Panel Name *</label>
            <input
              type="text"
              required
              value={labForm.testName}
              onChange={(e) => setLabForm({ ...labForm, testName: e.target.value })}
              placeholder="e.g. Complete Metabolic Panel (CMP), HbA1c, Blood Culture"
              className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Lab Division</label>
              <select
                value={labForm.category}
                onChange={(e) => setLabForm({ ...labForm, category: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              >
                <option value="Biochemistry">Biochemistry</option>
                <option value="Hematology">Hematology</option>
                <option value="Microbiology">Microbiology</option>
                <option value="Endocrinology">Endocrinology</option>
                <option value="Immunology">Immunology</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Priority</label>
              <select
                value={labForm.priority}
                onChange={(e) => setLabForm({ ...labForm, priority: e.target.value as LabPriority })}
                className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
              >
                <option value="Routine">Routine</option>
                <option value="Urgent">Urgent</option>
                <option value="STAT">STAT</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-1">Clinical Indication / Specimen Notes</label>
            <textarea
              rows={2}
              value={labForm.notes}
              onChange={(e) => setLabForm({ ...labForm, notes: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[#1F2937]">
            <button
              type="button"
              onClick={() => setNewLabOpen(false)}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:bg-[#1E293B] rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-medium bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-md"
            >
              {saving ? 'Ordering...' : 'Submit Lab Order'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Lab Results Entry & Printable Report Modal */}
      <Modal
        open={Boolean(activeLab)}
        onClose={() => setActiveLab(null)}
        title={activeLab ? `${activeLab.orderCode} — ${activeLab.testName}` : 'Lab Report'}
        subtitle={
          activeLab
            ? `${activeLab.patientName} (${activeLab.patientMrn}) · Ordered by ${activeLab.doctorName} · ${activeLab.priority}`
            : undefined
        }
        maxWidth="2xl"
      >
        {activeLab && (
          <form onSubmit={handleSaveLabResults} className="space-y-4 print-surface">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">Diagnostic Parameters</span>
                <button
                  type="button"
                  onClick={() =>
                    setResultRows((prev) => [
                      ...prev,
                      { parameter: '', value: '', unit: '', referenceRange: '', flag: 'Normal' },
                    ])
                  }
                  className="text-xs text-sky-400 hover:text-sky-300 font-medium no-print"
                >
                  + Add Parameter
                </button>
              </div>

              <div className="space-y-2">
                {resultRows.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2">
                    <input
                      type="text"
                      placeholder="Parameter (e.g. WBC)"
                      value={row.parameter}
                      onChange={(e) =>
                        setResultRows((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, parameter: e.target.value } : r))
                        )
                      }
                      className="col-span-4 px-2.5 py-1.5 text-xs bg-[#0B1120] border border-[#334155] rounded text-slate-100"
                    />
                    <input
                      type="text"
                      placeholder="Value"
                      value={row.value}
                      onChange={(e) =>
                        setResultRows((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, value: e.target.value } : r))
                        )
                      }
                      className="col-span-2 px-2.5 py-1.5 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded text-slate-100"
                    />
                    <input
                      type="text"
                      placeholder="Unit"
                      value={row.unit}
                      onChange={(e) =>
                        setResultRows((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, unit: e.target.value } : r))
                        )
                      }
                      className="col-span-2 px-2.5 py-1.5 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded text-slate-100"
                    />
                    <input
                      type="text"
                      placeholder="Ref Range"
                      value={row.referenceRange}
                      onChange={(e) =>
                        setResultRows((prev) =>
                          prev.map((r, i) =>
                            i === idx ? { ...r, referenceRange: e.target.value } : r
                          )
                        )
                      }
                      className="col-span-2 px-2.5 py-1.5 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded text-slate-100"
                    />
                    <select
                      value={row.flag}
                      onChange={(e) =>
                        setResultRows((prev) =>
                          prev.map((r, i) =>
                            i === idx
                              ? { ...r, flag: e.target.value as LabResultParameter['flag'] }
                              : r
                          )
                        )
                      }
                      className="col-span-2 px-2 py-1.5 text-xs bg-[#0B1120] border border-[#334155] rounded text-slate-100"
                    >
                      <option value="Normal">Normal</option>
                      <option value="High">High</option>
                      <option value="Low">Low</option>
                      <option value="Critical">Critical</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-300 mb-1">Pathologist / Lab Technician Notes</label>
              <textarea
                rows={2}
                value={labNotes}
                onChange={(e) => setLabNotes(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100"
              />
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-[#1F2937] no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 hover:text-slate-100 bg-[#1E293B] border border-[#334155] rounded-md"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Report</span>
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveLab(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-300 hover:bg-[#1E293B] rounded-md"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-xs font-medium bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-md"
                >
                  {saving ? 'Saving...' : 'Finalize & Publish Report'}
                </button>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
