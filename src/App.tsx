import { useCallback, useEffect, useState } from 'react';
import {
  BedDouble,
  CalendarClock,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Receipt,
  ShieldCheck,
  Stethoscope,
  Users,
  X,
} from 'lucide-react';
import { LoginView } from './components/LoginView';
import { PatientEHRDrawer } from './components/PatientEHRDrawer';
import { ToastStack, type ToastMessage } from './components/ui/Toast';
import { AppointmentsView } from './components/views/AppointmentsView';
import { BillingView } from './components/views/BillingView';
import { DoctorsView } from './components/views/DoctorsView';
import { OverviewView } from './components/views/OverviewView';
import { PatientsView } from './components/views/PatientsView';
import { PharmacyLabsView } from './components/views/PharmacyLabsView';
import { StaffView } from './components/views/StaffView';
import { WardsView, type DischargeBillingDraft } from './components/views/WardsView';
import { api, getStoredToken, setStoredToken } from './lib/api';
import { getInitials } from './lib/format';
import type { DashboardSummary, StaffRole, StaffUser } from './types/hms';

type NavId =
  | 'overview'
  | 'patients'
  | 'appointments'
  | 'wards'
  | 'doctors'
  | 'pharmacy_labs'
  | 'billing'
  | 'staff';

interface NavItem {
  id: NavId;
  label: string;
  breadcrumb: string;
  icon: typeof LayoutDashboard;
  roles: StaffRole[];
}

const NAV_ITEMS: NavItem[] = [
  {
    id: 'overview',
    label: 'Operations Overview',
    breadcrumb: 'Operations Overview',
    icon: LayoutDashboard,
    roles: ['admin', 'doctor', 'reception'],
  },
  {
    id: 'patients',
    label: 'Patients & EHR',
    breadcrumb: 'Patients & EHR',
    icon: Users,
    roles: ['admin', 'doctor', 'reception'],
  },
  {
    id: 'appointments',
    label: 'Appointments & Queue',
    breadcrumb: 'Appointments & Queue',
    icon: CalendarClock,
    roles: ['admin', 'doctor', 'reception'],
  },
  {
    id: 'wards',
    label: 'Wards & Beds',
    breadcrumb: 'Inpatient Wards & Beds',
    icon: BedDouble,
    roles: ['admin', 'doctor', 'reception'],
  },
  {
    id: 'doctors',
    label: 'Doctors & Shifts',
    breadcrumb: 'Doctors & Shift Schedules',
    icon: Stethoscope,
    roles: ['admin', 'doctor', 'reception'],
  },
  {
    id: 'pharmacy_labs',
    label: 'Pharmacy & Labs',
    breadcrumb: 'Pharmacy & Diagnostics',
    icon: FlaskConical,
    roles: ['admin', 'doctor', 'reception'],
  },
  {
    id: 'billing',
    label: 'Billing & Invoices',
    breadcrumb: 'Billing & Invoices',
    icon: Receipt,
    roles: ['admin', 'reception'],
  },
  {
    id: 'staff',
    label: 'Staff Accounts',
    breadcrumb: 'Staff Access Management',
    icon: ShieldCheck,
    roles: ['admin'],
  },
];

export default function App() {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [activeTab, setActiveTab] = useState<NavId>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [ehrPatientId, setEhrPatientId] = useState<string | null>(null);
  const [dischargeDraft, setDischargeDraft] = useState<DischargeBillingDraft | null>(null);
  const [registerTrigger, setRegisterTrigger] = useState(0);
  const [bookTrigger, setBookTrigger] = useState(0);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const notify = useCallback((type: 'success' | 'error', text: string) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const refreshSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const data = await api.getDashboard();
      setSummary(data);
    } catch {
      // ignore if signed out
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setAuthChecking(false);
      return;
    }
    api
      .me()
      .then((res) => {
        setUser(res.user);
      })
      .catch(() => {
        setStoredToken(null);
      })
      .finally(() => {
        setAuthChecking(false);
      });
  }, []);

  useEffect(() => {
    if (user) {
      refreshSummary();
    }
  }, [user, refreshSummary]);

  function handleSignOut() {
    setStoredToken(null);
    setUser(null);
    setSummary(null);
    setEhrPatientId(null);
    setActiveTab('overview');
  }

  function handleQuickAction() {
    if (activeTab === 'appointments') {
      setBookTrigger((n) => n + 1);
      return;
    }
    setActiveTab('patients');
    setRegisterTrigger((n) => n + 1);
  }

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#0B1120] flex items-center justify-center text-xs text-slate-400">
        Verifying Meridian Clinical session...
      </div>
    );
  }

  if (!user) {
    return (
      <LoginView
        onSuccess={(signedInUser) => {
          setUser(signedInUser);
          setActiveTab('overview');
        }}
      />
    );
  }

  const allowedNav = NAV_ITEMS.filter((item) => item.roles.includes(user.role));
  const currentNav = allowedNav.find((item) => item.id === activeTab) || allowedNav[0];

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 bg-[#111827] border-r border-[#1F2937] flex-col sticky top-0 h-screen no-print">
        <div className="h-16 px-5 flex items-center gap-3 border-b border-[#1F2937] shrink-0">
          <div className="w-8 h-8 rounded-md bg-sky-500/15 border border-sky-500/40 flex items-center justify-center text-sky-400 font-display font-bold text-sm shrink-0">
            M
          </div>
          <span className="font-display font-semibold text-sm tracking-tight text-slate-100 whitespace-nowrap">
            Meridian Clinical
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {allowedNav.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-sky-500/12 text-sky-300 border border-sky-500/25'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-[#1E293B]/60 border border-transparent'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#1F2937] space-y-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-[#1E293B] border border-[#334155] flex items-center justify-center text-xs font-display font-semibold text-sky-300 shrink-0">
              {getInitials(user.name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-slate-100 truncate">{user.name}</div>
              <div className="text-[11px] text-slate-400 truncate capitalize">
                {user.role} · {user.department}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium text-slate-300 hover:text-slate-100 bg-[#0B1120] hover:bg-[#1E293B] border border-[#1F2937] rounded-md transition-colors whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden bg-black/70 flex no-print"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="w-64 bg-[#111827] border-r border-[#1F2937] h-full flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="h-16 px-5 flex items-center justify-between border-b border-[#1F2937]">
              <span className="font-display font-semibold text-sm text-slate-100">
                Meridian Clinical
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {allowedNav.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-medium whitespace-nowrap ${
                      active
                        ? 'bg-sky-500/12 text-sky-300 border border-sky-500/25'
                        : 'text-slate-400 hover:text-slate-100 hover:bg-[#1E293B]/60'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-[#1F2937]">
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-medium text-slate-300 bg-[#0B1120] border border-[#1F2937] rounded-md"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out ({user.name})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Operations Viewport */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Header Bar */}
        <header className="h-16 px-4 sm:px-8 bg-[#111827] border-b border-[#1F2937] flex items-center justify-between gap-4 sticky top-0 z-30 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 text-slate-400 hover:text-slate-100 hover:bg-[#1E293B] rounded-md"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-xs sm:text-sm min-w-0">
              <span className="text-slate-500 hidden sm:inline whitespace-nowrap">
                Meridian Clinical
              </span>
              <span className="text-slate-600 hidden sm:inline">/</span>
              <h1 className="font-display font-semibold text-slate-100 truncate">
                {currentNav.breadcrumb}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleQuickAction}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-md whitespace-nowrap transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{activeTab === 'appointments' ? 'Book Appointment' : 'Register Patient'}</span>
            </button>
          </div>
        </header>

        {/* Active Module Workspace */}
        <main className="flex-1 p-4 sm:p-8 max-w-[1440px] w-full mx-auto">
          {activeTab === 'overview' && (
            <OverviewView
              summary={summary}
              loading={summaryLoading}
              currentUser={user}
              onNavigate={(tab) => setActiveTab(tab as NavId)}
              onOpenEHR={setEhrPatientId}
              onRefresh={refreshSummary}
              onNotify={notify}
            />
          )}

          {activeTab === 'patients' && (
            <PatientsView
              currentUser={user}
              onOpenEHR={setEhrPatientId}
              onNotify={notify}
              onGlobalChange={refreshSummary}
              registerTrigger={registerTrigger}
            />
          )}

          {activeTab === 'appointments' && (
            <AppointmentsView
              currentUser={user}
              onOpenEHR={setEhrPatientId}
              onNotify={notify}
              onGlobalChange={refreshSummary}
              bookTrigger={bookTrigger}
            />
          )}

          {activeTab === 'wards' && (
            <WardsView
              currentUser={user}
              onOpenEHR={setEhrPatientId}
              onNotify={notify}
              onGlobalChange={refreshSummary}
              onCreateDischargeInvoice={(draft) => {
                setDischargeDraft(draft);
                setActiveTab('billing');
              }}
            />
          )}

          {activeTab === 'doctors' && (
            <DoctorsView
              currentUser={user}
              onNotify={notify}
              onGlobalChange={refreshSummary}
            />
          )}

          {activeTab === 'pharmacy_labs' && (
            <PharmacyLabsView
              currentUser={user}
              onNotify={notify}
              onGlobalChange={refreshSummary}
            />
          )}

          {activeTab === 'billing' && (
            <BillingView
              currentUser={user}
              onNotify={notify}
              onGlobalChange={refreshSummary}
              dischargeDraft={dischargeDraft}
              onClearDischargeDraft={() => setDischargeDraft(null)}
            />
          )}

          {activeTab === 'staff' && user.role === 'admin' && (
            <StaffView currentUser={user} onNotify={notify} />
          )}
        </main>
      </div>

      {/* Global Slide-Over EHR Drawer */}
      <PatientEHRDrawer
        patientId={ehrPatientId}
        onClose={() => setEhrPatientId(null)}
        currentUser={user}
        onNotify={notify}
        onDataChanged={refreshSummary}
      />

      {/* Non-blocking Action Toasts */}
      <ToastStack
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </div>
  );
}
