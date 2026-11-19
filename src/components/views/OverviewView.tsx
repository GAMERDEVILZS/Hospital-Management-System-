import {
  ArrowRight,
  BedDouble,
  CalendarClock,
  FlaskConical,
  Pill,
  Receipt,
  Users,
} from 'lucide-react';
import { api } from '../../lib/api';
import { formatCurrency } from '../../lib/format';
import type { AppointmentStatus, DashboardSummary, StaffUser } from '../../types/hms';

interface OverviewViewProps {
  summary: DashboardSummary | null;
  loading: boolean;
  currentUser: StaffUser;
  onNavigate: (tab: string) => void;
  onOpenEHR: (patientId: string) => void;
  onRefresh: () => void;
  onNotify: (type: 'success' | 'error', text: string) => void;
}

export function OverviewView({
  summary,
  loading,
  onNavigate,
  onOpenEHR,
  onRefresh,
  onNotify,
}: OverviewViewProps) {
  async function advanceQueue(id: string, nextStatus: AppointmentStatus) {
    try {
      await api.updateAppointment(id, { status: nextStatus });
      onNotify('success', `Appointment updated to ${nextStatus.replace('_', ' ')}.`);
      onRefresh();
    } catch (err) {
      onNotify('error', (err as Error).message);
    }
  }

  if (loading && !summary) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-lg bg-[#111827] border border-[#1F2937] animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 h-80 rounded-lg bg-[#111827] border border-[#1F2937] animate-pulse" />
          <div className="h-80 rounded-lg bg-[#111827] border border-[#1F2937] animate-pulse" />
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const { kpis, wardBreakdown, activeQueue, recentLabAlerts, lowStockItems } = summary;
  const occupancyPct = kpis.totalBeds > 0 ? Math.round((kpis.occupiedBeds / kpis.totalBeds) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Top KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigate('patients')}
          className="text-left p-5 rounded-lg bg-[#111827] border border-[#1F2937] hover:border-[#334155] transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Active Patients</span>
            <Users className="w-4 h-4 text-slate-500" />
          </div>
          <div className="mt-3 font-mono tabular-nums text-2xl font-semibold text-slate-50">
            {kpis.totalPatients}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            <span className="font-mono tabular-nums text-sky-400">{kpis.admittedPatients}</span>{' '}
            inpatients ·{' '}
            <span className="font-mono tabular-nums text-slate-300">
              {kpis.onDutyDoctors}/{kpis.totalDoctors}
            </span>{' '}
            physicians on duty
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('appointments')}
          className="text-left p-5 rounded-lg bg-[#111827] border border-[#1F2937] hover:border-[#334155] transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Outpatient Queue Today</span>
            <CalendarClock className="w-4 h-4 text-slate-500" />
          </div>
          <div className="mt-3 font-mono tabular-nums text-2xl font-semibold text-slate-50">
            {kpis.appointmentsToday}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            <span className="font-mono tabular-nums text-amber-400">{kpis.waitingQueue}</span>{' '}
            waiting ·{' '}
            <span className="font-mono tabular-nums text-emerald-400">{kpis.inConsultation}</span>{' '}
            in consultation
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('wards')}
          className="text-left p-5 rounded-lg bg-[#111827] border border-[#1F2937] hover:border-[#334155] transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Inpatient Bed Occupancy</span>
            <BedDouble className="w-4 h-4 text-slate-500" />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-2xl font-semibold text-slate-50">
              {occupancyPct}%
            </span>
            <span className="font-mono tabular-nums text-xs text-slate-400">
              ({kpis.occupiedBeds}/{kpis.totalBeds} beds)
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            <span className="font-mono tabular-nums text-emerald-400">{kpis.availableBeds}</span>{' '}
            beds open for immediate admission
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('billing')}
          className="text-left p-5 rounded-lg bg-[#111827] border border-[#1F2937] hover:border-[#334155] transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Revenue Collected</span>
            <Receipt className="w-4 h-4 text-slate-500" />
          </div>
          <div className="mt-3 font-mono tabular-nums text-2xl font-semibold text-slate-50">
            {formatCurrency(kpis.totalRevenueCollected)}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            <span className="font-mono tabular-nums text-amber-400">
              {formatCurrency(kpis.outstandingBalance)}
            </span>{' '}
            outstanding balance
          </div>
        </button>
      </div>

      {/* Main Split: Live Outpatient Queue + Ward Capacity */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Live Outpatient Queue */}
        <section className="xl:col-span-2 rounded-lg bg-[#111827] border border-[#1F2937] flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1F2937]">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Active Outpatient Queue</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Today&apos;s live check-ins and consultations across departments
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('appointments')}
              className="flex items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300 whitespace-nowrap"
            >
              <span>Full Schedule</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {activeQueue.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-400">
              All scheduled outpatient appointments for today have been completed.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-slate-400 border-b border-[#1F2937]">
                  <tr>
                    <th className="text-left font-medium px-5 py-2.5">Token</th>
                    <th className="text-left font-medium px-3 py-2.5">Patient</th>
                    <th className="text-left font-medium px-3 py-2.5">Physician</th>
                    <th className="text-left font-medium px-3 py-2.5">Time</th>
                    <th className="text-left font-medium px-3 py-2.5">Status</th>
                    <th className="text-right font-medium px-5 py-2.5">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1F2937]">
                  {activeQueue.map((apt) => (
                    <tr key={apt._id} className="hover:bg-[#1E293B]/45 transition-colors">
                      <td className="px-5 py-3 font-mono tabular-nums font-medium text-sky-400 whitespace-nowrap">
                        {apt.tokenNumber}
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => onOpenEHR(apt.patientId)}
                          className="text-left hover:text-sky-300 transition-colors"
                        >
                          <div className="font-medium text-slate-100">{apt.patientName}</div>
                          <div className="font-mono text-[11px] text-slate-400">
                            {apt.patientMrn} · {apt.type}
                          </div>
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-slate-200">{apt.doctorName}</div>
                        <div className="text-[11px] text-slate-400">{apt.department}</div>
                      </td>
                      <td className="px-3 py-3 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        {apt.timeSlot}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span
                          className={`font-medium ${
                            apt.status === 'in_consultation'
                              ? 'text-emerald-400'
                              : apt.status === 'checked_in'
                              ? 'text-amber-400'
                              : 'text-slate-300'
                          }`}
                        >
                          {apt.status === 'in_consultation'
                            ? 'In Consultation'
                            : apt.status === 'checked_in'
                            ? 'Checked In'
                            : 'Scheduled'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        {apt.status === 'scheduled' && (
                          <button
                            type="button"
                            onClick={() => advanceQueue(apt._id, 'checked_in')}
                            className="px-2.5 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/15 border border-amber-500/30 rounded transition-colors"
                          >
                            Check In
                          </button>
                        )}
                        {apt.status === 'checked_in' && (
                          <button
                            type="button"
                            onClick={() => advanceQueue(apt._id, 'in_consultation')}
                            className="px-2.5 py-1 text-xs font-medium text-sky-300 hover:bg-sky-500/15 border border-sky-500/30 rounded transition-colors"
                          >
                            Start Consult
                          </button>
                        )}
                        {apt.status === 'in_consultation' && (
                          <button
                            type="button"
                            onClick={() => advanceQueue(apt._id, 'completed')}
                            className="px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/15 border border-emerald-500/30 rounded transition-colors"
                          >
                            Complete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Ward Capacity Breakdown */}
        <section className="rounded-lg bg-[#111827] border border-[#1F2937] flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1F2937]">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">Ward Capacity</h2>
              <p className="text-xs text-slate-400 mt-0.5">Live census across inpatient units</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('wards')}
              className="flex items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300 whitespace-nowrap"
            >
              <span>Bed Map</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="p-5 space-y-5 flex-1">
            {wardBreakdown.map((ward) => {
              const pct = ward.total > 0 ? Math.round((ward.occupied / ward.total) * 100) : 0;
              return (
                <div key={ward.wardName} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-200 truncate pr-2">
                      {ward.wardName}
                    </span>
                    <span className="font-mono tabular-nums text-slate-300 shrink-0">
                      {ward.occupied}/{ward.total}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-sm bg-[#1E293B] overflow-hidden">
                    <div
                      className={`h-full transition-all duration-200 ${
                        pct >= 80 ? 'bg-red-500' : pct >= 55 ? 'bg-amber-500' : 'bg-sky-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                    {ward.available} available
                    {ward.reserved > 0 ? ` · ${ward.reserved} reserved` : ''}
                    {ward.maintenance > 0 ? ` · ${ward.maintenance} maintenance` : ''}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Bottom Split: Lab Priority Feed + Pharmacy Reorder Watch */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-lg bg-[#111827] border border-[#1F2937]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1F2937]">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-100">
                Diagnostic Queue &amp; Critical Results
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('pharmacy_labs')}
              className="text-xs font-medium text-sky-400 hover:text-sky-300 whitespace-nowrap"
            >
              Open Labs
            </button>
          </div>
          <div className="divide-y divide-[#1F2937]">
            {recentLabAlerts.map((order) => {
              const hasCritical = order.results.some((r) => r.flag === 'Critical');
              return (
                <div
                  key={order._id}
                  className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-[#1E293B]/40"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-100 truncate">
                      {order.testName}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                      <span className="font-mono">{order.orderCode}</span> · {order.patientName} ·{' '}
                      {order.priority}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={`text-xs font-medium capitalize ${
                        hasCritical
                          ? 'text-red-400'
                          : order.status === 'completed'
                          ? 'text-emerald-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {hasCritical ? 'Critical Flag' : order.status.replace('_', ' ')}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg bg-[#111827] border border-[#1F2937]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#1F2937]">
            <div className="flex items-center gap-2">
              <Pill className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-100">
                Pharmacy Reorder Watch ({kpis.lowStockMedications})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('pharmacy_labs')}
              className="text-xs font-medium text-sky-400 hover:text-sky-300 whitespace-nowrap"
            >
              Manage Stock
            </button>
          </div>
          {lowStockItems.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              All formulary medications are above their reorder thresholds.
            </div>
          ) : (
            <div className="divide-y divide-[#1F2937]">
              {lowStockItems.map((item) => (
                <div
                  key={item._id}
                  className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-[#1E293B]/40"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-slate-100 truncate">{item.name}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                      {item.sku} · Batch {item.batchNumber} · {item.category}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono tabular-nums text-xs font-semibold text-amber-400">
                      {item.stockQty} left
                    </div>
                    <div className="font-mono tabular-nums text-[11px] text-slate-500">
                      Min {item.reorderLevel}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
