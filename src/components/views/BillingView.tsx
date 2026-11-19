import React, { useCallback, useEffect, useState } from 'react';
import { CreditCard, Plus, Printer, Search, Trash2 } from 'lucide-react';
import { api, type EnrichedInvoice } from '../../lib/api';
import { formatCurrency, formatDateTime, formatShortDate } from '../../lib/format';
import type {
  InvoiceLineItem,
  InvoiceStatus,
  Patient,
  PaymentRecord,
  StaffUser,
} from '../../types/hms';
import { Modal } from '../ui/Modal';
import type { DischargeBillingDraft } from './WardsView';

interface BillingViewProps {
  currentUser: StaffUser;
  onNotify: (type: 'success' | 'error', text: string) => void;
  onGlobalChange: () => void;
  dischargeDraft: DischargeBillingDraft | null;
  onClearDischargeDraft: () => void;
}

export function BillingView({
  currentUser,
  onNotify,
  onGlobalChange,
  dischargeDraft,
  onClearDischargeDraft,
}: BillingViewProps) {
  const [invoices, setInvoices] = useState<EnrichedInvoice[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | InvoiceStatus>('all');
  const [search, setSearch] = useState('');

  // Create invoice modal
  const [createOpen, setCreateOpen] = useState(false);
  const [invPatientId, setInvPatientId] = useState('');
  const [insuranceProvider, setInsuranceProvider] = useState('Self-Pay');
  const [insuranceCoverage, setInsuranceCoverage] = useState('0');
  const [lineItems, setLineItems] = useState<
    Array<{
      description: string;
      category: InvoiceLineItem['category'];
      quantity: string;
      unitPrice: string;
    }>
  >([{ description: 'Specialist Consultation', category: 'Consultation', quantity: '1', unitPrice: '240' }]);

  // Payment modal
  const [payInvoice, setPayInvoice] = useState<EnrichedInvoice | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentRecord['method']>('Card');
  const [payRef, setPayRef] = useState('');

  // Receipt modal
  const [receiptInvoice, setReceiptInvoice] = useState<EnrichedInvoice | null>(null);
  const [saving, setSaving] = useState(false);

  const canManageBilling = currentUser.role === 'admin' || currentUser.role === 'reception';

  const loadBilling = useCallback(async () => {
    setLoading(true);
    try {
      const [invData, patData] = await Promise.all([
        api.getBilling({
          status: statusFilter,
          search: search.trim() || undefined,
        }),
        api.getPatients(),
      ]);
      setInvoices(invData);
      setPatients(patData);
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, onNotify]);

  useEffect(() => {
    const t = setTimeout(loadBilling, 120);
    return () => clearTimeout(t);
  }, [loadBilling]);

  // Pre-fill invoice modal if routed from Bed Discharge
  useEffect(() => {
    if (dischargeDraft && patients.length > 0 && canManageBilling) {
      const pat = patients.find((p) => p._id === dischargeDraft.patientId);
      setInvPatientId(dischargeDraft.patientId);
      setInsuranceProvider(pat?.insuranceProvider || 'Self-Pay');
      setInsuranceCoverage('0');
      setLineItems([
        {
          description: `Inpatient Bed Stay (${dischargeDraft.bedNumber})`,
          category: 'Inpatient Bed',
          quantity: String(dischargeDraft.stayDays),
          unitPrice: String(dischargeDraft.dailyRate),
        },
        {
          description: 'Discharge Summary & Clinical Care',
          category: 'Consultation',
          quantity: '1',
          unitPrice: '220',
        },
      ]);
      setCreateOpen(true);
      onClearDischargeDraft();
    }
  }, [dischargeDraft, patients, canManageBilling, onClearDischargeDraft]);

  function openCreateInvoice() {
    const first = patients[0];
    setInvPatientId(first?._id || '');
    setInsuranceProvider(first?.insuranceProvider || 'Self-Pay');
    setInsuranceCoverage('0');
    setLineItems([
      {
        description: 'Outpatient Consultation',
        category: 'Consultation',
        quantity: '1',
        unitPrice: '240',
      },
    ]);
    setCreateOpen(true);
  }

  const draftSubtotal = lineItems.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
    0
  );
  const draftCoverage = Math.min(draftSubtotal, Math.max(0, Number(insuranceCoverage) || 0));
  const draftTotalDue = Math.max(0, draftSubtotal - draftCoverage);

  async function handleCreateInvoice(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const items: InvoiceLineItem[] = lineItems
        .filter((i) => i.description.trim())
        .map((i) => {
          const qty = Math.max(1, Number(i.quantity) || 1);
          const price = Math.max(0, Number(i.unitPrice) || 0);
          return {
            description: i.description.trim(),
            category: i.category,
            quantity: qty,
            unitPrice: price,
            total: qty * price,
          };
        });
      await api.createInvoice({
        patientId: invPatientId,
        items,
        insuranceProvider,
        insuranceCoverage: Number(insuranceCoverage) || 0,
      });
      setCreateOpen(false);
      onNotify('success', 'Invoice generated and added to billing ledger.');
      await loadBilling();
      onGlobalChange();
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payInvoice) return;
    setSaving(true);
    try {
      await api.recordPayment(payInvoice._id, {
        amount: Number(payAmount),
        method: payMethod,
        reference: payRef,
      });
      onNotify('success', `Recorded ${formatCurrency(Number(payAmount))} payment on ${payInvoice.invoiceNumber}.`);
      setPayInvoice(null);
      await loadBilling();
      onGlobalChange();
    } catch (err) {
      onNotify('error', (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const totalCollected = invoices.reduce((s, i) => s + i.amountPaid, 0);
  const totalOutstanding = invoices.reduce((s, i) => s + Math.max(0, i.totalDue - i.amountPaid), 0);
  const totalInsurance = invoices.reduce((s, i) => s + i.insuranceCoverage, 0);
  const overdueCount = invoices.filter((i) => i.status === 'overdue').length;

  return (
    <div className="space-y-5">
      {/* Financial Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-[#111827] border border-[#1F2937]">
          <div className="text-xs text-slate-400">Collected (Filtered)</div>
          <div className="mt-1.5 font-mono tabular-nums text-xl font-semibold text-emerald-400">
            {formatCurrency(totalCollected)}
          </div>
        </div>
        <div className="p-4 rounded-lg bg-[#111827] border border-[#1F2937]">
          <div className="text-xs text-slate-400">Patient Balance Due</div>
          <div className="mt-1.5 font-mono tabular-nums text-xl font-semibold text-amber-400">
            {formatCurrency(totalOutstanding)}
          </div>
        </div>
        <div className="p-4 rounded-lg bg-[#111827] border border-[#1F2937]">
          <div className="text-xs text-slate-400">Insurance Billed</div>
          <div className="mt-1.5 font-mono tabular-nums text-xl font-semibold text-slate-100">
            {formatCurrency(totalInsurance)}
          </div>
        </div>
        <div className="p-4 rounded-lg bg-[#111827] border border-[#1F2937]">
          <div className="text-xs text-slate-400">Overdue Accounts</div>
          <div className="mt-1.5 font-mono tabular-nums text-xl font-semibold text-red-400">
            {overdueCount}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice #, patient, insurer..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-[#111827] border border-[#334155] rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#111827] border border-[#1F2937] rounded-md">
            {(['all', 'unpaid', 'partial', 'paid', 'overdue'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 text-xs font-medium rounded capitalize whitespace-nowrap transition-colors ${
                  statusFilter === st
                    ? 'bg-[#1E293B] text-sky-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {canManageBilling && (
          <button
            type="button"
            onClick={openCreateInvoice}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-md whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Invoice</span>
          </button>
        )}
      </div>

      {/* Invoices Table */}
      <div className="rounded-lg bg-[#111827] border border-[#1F2937] overflow-hidden">
        {loading && invoices.length === 0 ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-[#1E293B]/60 rounded animate-pulse" />
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            No invoices match the current filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#0F172A] text-slate-400 border-b border-[#1F2937]">
                <tr>
                  <th className="text-left font-medium px-5 py-3">Invoice #</th>
                  <th className="text-left font-medium px-3 py-3">Patient &amp; Insurer</th>
                  <th className="text-right font-medium px-3 py-3">Subtotal</th>
                  <th className="text-right font-medium px-3 py-3">Patient Due</th>
                  <th className="text-right font-medium px-3 py-3">Paid</th>
                  <th className="text-left font-medium px-3 py-3">Status</th>
                  <th className="text-right font-medium px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F2937]">
                {invoices.map((inv) => {
                  const balance = Math.max(0, inv.totalDue - inv.amountPaid);
                  return (
                    <tr key={inv._id} className="hover:bg-[#1E293B]/45 transition-colors">
                      <td className="px-5 py-3 font-mono text-sky-400 whitespace-nowrap">
                        {inv.invoiceNumber}
                        <div className="text-[11px] text-slate-500">
                          Due {formatShortDate(inv.dueDate)}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-slate-100">{inv.patientName}</div>
                        <div className="text-[11px] text-slate-400">
                          <span className="font-mono">{inv.patientMrn}</span> · {inv.insuranceProvider}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {formatCurrency(inv.subtotal)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-100 whitespace-nowrap">
                        {formatCurrency(inv.totalDue)}
                      </td>
                      <td className="px-3 py-3 text-right font-mono tabular-nums text-emerald-400 whitespace-nowrap">
                        {formatCurrency(inv.amountPaid)}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span
                          className={`font-medium capitalize ${
                            inv.status === 'paid'
                              ? 'text-emerald-400'
                              : inv.status === 'overdue'
                              ? 'text-red-400'
                              : 'text-amber-400'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {canManageBilling && balance > 0.01 && (
                            <button
                              type="button"
                              onClick={() => {
                                setPayInvoice(inv);
                                setPayAmount(balance.toFixed(2));
                                setPayMethod('Card');
                                setPayRef('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded transition-colors"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              <span>Pay</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setReceiptInvoice(inv)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-[#1E293B] hover:text-sky-300 border border-[#334155] rounded transition-colors"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Receipt</span>
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

      {/* Create Invoice Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Itemized Hospital Invoice"
        subtitle="Combine consultation, inpatient stay, lab diagnostics, and pharmacy charges"
        maxWidth="2xl"
      >
        <form onSubmit={handleCreateInvoice} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-300 mb-1">Patient *</label>
              <select
                required
                value={invPatientId}
                onChange={(e) => {
                  const id = e.target.value;
                  setInvPatientId(id);
                  const found = patients.find((p) => p._id === id);
                  if (found) setInsuranceProvider(found.insuranceProvider);
                }}
                className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100"
              >
                {patients.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.fullName} ({p.mrn})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Insurance Provider</label>
              <input
                type="text"
                value={insuranceProvider}
                onChange={(e) => setInsuranceProvider(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-300 mb-1">Insurance Coverage ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={insuranceCoverage}
                onChange={(e) => setInsuranceCoverage(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded-md text-slate-100"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200">Billable Line Items</span>
              <button
                type="button"
                onClick={() =>
                  setLineItems((prev) => [
                    ...prev,
                    { description: '', category: 'Laboratory', quantity: '1', unitPrice: '100' },
                  ])
                }
                className="text-xs text-sky-400 hover:text-sky-300 font-medium"
              >
                + Add Line Item
              </button>
            </div>

            {lineItems.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <input
                  type="text"
                  required
                  placeholder="Charge description"
                  value={item.description}
                  onChange={(e) =>
                    setLineItems((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, description: e.target.value } : row))
                    )
                  }
                  className="col-span-5 px-2.5 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded text-slate-100"
                />
                <select
                  value={item.category}
                  onChange={(e) =>
                    setLineItems((prev) =>
                      prev.map((row, i) =>
                        i === idx
                          ? { ...row, category: e.target.value as InvoiceLineItem['category'] }
                          : row
                      )
                    )
                  }
                  className="col-span-3 px-2 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded text-slate-100"
                >
                  <option value="Consultation">Consultation</option>
                  <option value="Inpatient Bed">Inpatient Bed</option>
                  <option value="Laboratory">Laboratory</option>
                  <option value="Pharmacy">Pharmacy</option>
                  <option value="Procedure">Procedure</option>
                </select>
                <input
                  type="number"
                  min="1"
                  required
                  value={item.quantity}
                  onChange={(e) =>
                    setLineItems((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, quantity: e.target.value } : row))
                    )
                  }
                  className="col-span-1 px-2 py-2 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded text-slate-100"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={item.unitPrice}
                  onChange={(e) =>
                    setLineItems((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, unitPrice: e.target.value } : row))
                    )
                  }
                  className="col-span-2 px-2 py-2 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded text-slate-100"
                />
                <button
                  type="button"
                  disabled={lineItems.length <= 1}
                  onClick={() => setLineItems((prev) => prev.filter((_, i) => i !== idx))}
                  className="col-span-1 p-1.5 text-slate-500 hover:text-red-400 disabled:opacity-30 flex justify-center"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="p-4 rounded-md bg-[#0B1120] border border-[#1F2937] space-y-1.5 text-xs font-mono tabular-nums">
            <div className="flex justify-between text-slate-400">
              <span>Gross Subtotal</span>
              <span>{formatCurrency(draftSubtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Insurance Deduction</span>
              <span>-{formatCurrency(draftCoverage)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold text-slate-100 pt-2 border-t border-[#1F2937]">
              <span>Patient Balance Due</span>
              <span className="text-sky-400">{formatCurrency(draftTotalDue)}</span>
            </div>
          </div>

          <div className="flex justify-end gap-2">
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
              {saving ? 'Generating...' : 'Issue Invoice'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        open={Boolean(payInvoice)}
        onClose={() => setPayInvoice(null)}
        title={payInvoice ? `Record Payment — ${payInvoice.invoiceNumber}` : 'Record Payment'}
        subtitle={
          payInvoice
            ? `${payInvoice.patientName} · Remaining balance: ${formatCurrency(
                Math.max(0, payInvoice.totalDue - payInvoice.amountPaid)
              )}`
            : undefined
        }
        maxWidth="md"
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-300 mb-1">Payment Amount ($) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono bg-[#0B1120] border border-[#334155] rounded-md text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-300 mb-1">Payment Method</label>
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as PaymentRecord['method'])}
              className="w-full px-3 py-2 text-xs bg-[#0B1120] border border-[#334155] rounded-md text-slate-100"
            >
              <option value="Card">Credit / Debit Card</option>
              <option value="Cash">Cash</option>
              <option value="Insurance">Insurance Settlement</option>
              <option value="Bank Transfer">Bank Wire / ACH</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-300 mb-1">Transaction Reference (Optional)</label>
            <input
              type="text"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              placeholder="Auto-generated if left blank"
              className="w-full px-3 py-2 text-xs font-mono bg-[#0B1120] border border-[#334155] rounded-md text-slate-100"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setPayInvoice(null)}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:bg-[#1E293B] rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-medium bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-md"
            >
              {saving ? 'Recording...' : 'Confirm Payment'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Printable Invoice Receipt Modal */}
      <Modal
        open={Boolean(receiptInvoice)}
        onClose={() => setReceiptInvoice(null)}
        title={receiptInvoice ? `Hospital Statement — ${receiptInvoice.invoiceNumber}` : 'Receipt'}
        maxWidth="xl"
      >
        {receiptInvoice && (
          <div className="space-y-5 print-surface">
            <div className="flex items-start justify-between border-b border-[#1F2937] pb-4">
              <div>
                <div className="font-display text-base font-bold text-slate-100">
                  Meridian Clinical Medical Center
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Patient Billing &amp; Financial Services · San Francisco, CA
                </div>
              </div>
              <div className="text-right text-xs font-mono tabular-nums">
                <div className="text-slate-100 font-semibold">{receiptInvoice.invoiceNumber}</div>
                <div className="text-slate-400">Issued: {formatShortDate(receiptInvoice.issuedAt)}</div>
                <div className="text-slate-400">Due: {formatShortDate(receiptInvoice.dueDate)}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-slate-400">Billed Patient</div>
                <div className="font-medium text-slate-100 mt-0.5">{receiptInvoice.patientName}</div>
                <div className="font-mono text-slate-400">{receiptInvoice.patientMrn}</div>
              </div>
              <div className="text-right">
                <div className="text-slate-400">Coverage</div>
                <div className="font-medium text-slate-100 mt-0.5">
                  {receiptInvoice.insuranceProvider}
                </div>
                <div className="capitalize text-sky-400 font-medium">
                  Status: {receiptInvoice.status}
                </div>
              </div>
            </div>

            <table className="w-full text-xs border-y border-[#1F2937]">
              <thead className="text-slate-400 border-b border-[#1F2937]">
                <tr>
                  <th className="text-left py-2.5 font-medium">Description</th>
                  <th className="text-left py-2.5 font-medium">Category</th>
                  <th className="text-right py-2.5 font-medium">Qty</th>
                  <th className="text-right py-2.5 font-medium">Unit</th>
                  <th className="text-right py-2.5 font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F2937]">
                {receiptInvoice.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-2.5 text-slate-100">{item.description}</td>
                    <td className="py-2.5 text-slate-400">{item.category}</td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-slate-300">
                      {item.quantity}
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-slate-300">
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td className="py-2.5 text-right font-mono tabular-nums text-slate-100">
                      {formatCurrency(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end">
              <div className="w-64 space-y-1.5 text-xs font-mono tabular-nums">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal</span>
                  <span>{formatCurrency(receiptInvoice.subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Insurance Coverage</span>
                  <span>-{formatCurrency(receiptInvoice.insuranceCoverage)}</span>
                </div>
                <div className="flex justify-between text-slate-200 font-semibold pt-1.5 border-t border-[#1F2937]">
                  <span>Patient Due</span>
                  <span>{formatCurrency(receiptInvoice.totalDue)}</span>
                </div>
                <div className="flex justify-between text-emerald-400">
                  <span>Amount Paid</span>
                  <span>{formatCurrency(receiptInvoice.amountPaid)}</span>
                </div>
                <div className="flex justify-between text-slate-100 font-semibold pt-1.5 border-t border-[#1F2937]">
                  <span>Remaining Balance</span>
                  <span>
                    {formatCurrency(Math.max(0, receiptInvoice.totalDue - receiptInvoice.amountPaid))}
                  </span>
                </div>
              </div>
            </div>

            {receiptInvoice.payments.length > 0 && (
              <div className="pt-3 border-t border-[#1F2937] space-y-2">
                <div className="text-xs font-semibold text-slate-200">Payment History</div>
                {receiptInvoice.payments.map((pay) => (
                  <div
                    key={pay._id}
                    className="flex items-center justify-between text-xs text-slate-300"
                  >
                    <span>
                      {pay.method} · <span className="font-mono text-slate-400">{pay.reference}</span> ·{' '}
                      {formatDateTime(pay.paidAt)}
                    </span>
                    <span className="font-mono tabular-nums text-emerald-400">
                      {formatCurrency(pay.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-[#1F2937] no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-md"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Statement</span>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
