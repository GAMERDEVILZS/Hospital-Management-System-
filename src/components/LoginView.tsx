import React, { useState } from 'react';
import { Lock, Mail, ArrowRight, ShieldCheck, Stethoscope, ClipboardList, AlertCircle } from 'lucide-react';
import { api, setStoredToken } from '../lib/api';
import type { StaffUser } from '../types/hms';

interface LoginViewProps {
  onSuccess: (user: StaffUser, storageMode: 'mongodb' | 'local_store') => void;
}

const DEMO_ACCOUNTS = [
  {
    role: 'Admin',
    name: 'Hannah Lindholm',
    department: 'Hospital Operations',
    email: 'admin@meridianclinical.org',
    password: 'Admin@123',
    icon: ShieldCheck,
    scope: 'Full system access, staff accounts, billing, doctors & inventory',
  },
  {
    role: 'Doctor',
    name: 'Dr. Elena Vance',
    department: 'Cardiology',
    email: 'doctor@meridianclinical.org',
    password: 'Doctor@123',
    icon: Stethoscope,
    scope: 'Patient EHR, clinical notes, prescriptions, lab orders & rounds',
  },
  {
    role: 'Reception',
    name: 'Marcus Reid',
    department: 'Admissions & Front Desk',
    email: 'reception@meridianclinical.org',
    password: 'Reception@123',
    icon: ClipboardList,
    scope: 'Patient intake, outpatient queue, bed allocation & invoicing',
  },
] as const;

export function LoginView({ onSuccess }: LoginViewProps) {
  const [email, setEmail] = useState('admin@meridianclinical.org');
  const [password, setPassword] = useState('Admin@123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.login(email, password);
      setStoredToken(res.token);
      onSuccess(res.user, res.storageMode);
    } catch (err) {
      setError((err as Error).message || 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  }

  async function handleQuickSignIn(demoEmail: string, demoPassword: string) {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError(null);
    setLoading(true);
    try {
      const res = await api.login(demoEmail, demoPassword);
      setStoredToken(res.token);
      onSuccess(res.user, res.storageMode);
    } catch (err) {
      setError((err as Error).message || 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex flex-col lg:flex-row">
      {/* Left Brand & Clinical Scope Column */}
      <div className="lg:w-[46%] bg-[#0F172A] border-b lg:border-b-0 lg:border-r border-[#1F2937] px-8 py-10 lg:px-14 lg:py-16 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-sky-500/15 border border-sky-500/40 flex items-center justify-center text-sky-400 font-display font-bold text-base">
              M
            </div>
            <span className="font-display font-semibold text-lg tracking-tight text-slate-100">
              Meridian Clinical
            </span>
          </div>

          <h1 className="mt-12 text-3xl lg:text-4xl font-semibold tracking-tight text-slate-50 leading-tight max-w-md">
            Hospital operations, unified for clinical teams.
          </h1>
          <p className="mt-4 text-sm text-slate-400 leading-relaxed max-w-md">
            Electronic health records, outpatient triage queues, inpatient ward allocation, diagnostic laboratory workflows, pharmacy stock, and billing in one role-secured workstation.
          </p>

          <div className="mt-10 pt-8 border-t border-[#1F2937] grid grid-cols-3 gap-6 max-w-md">
            <div>
              <div className="font-mono tabular-nums text-xl font-semibold text-slate-100">6</div>
              <div className="text-xs text-slate-400 mt-1">Integrated clinical modules</div>
            </div>
            <div>
              <div className="font-mono tabular-nums text-xl font-semibold text-slate-100">3</div>
              <div className="text-xs text-slate-400 mt-1">Staff access tiers</div>
            </div>
            <div>
              <div className="font-mono tabular-nums text-xl font-semibold text-slate-100">24/7</div>
              <div className="text-xs text-slate-400 mt-1">Ward &amp; queue tracking</div>
            </div>
          </div>
        </div>

        <p className="mt-10 text-xs text-slate-500">
          Authorized hospital personnel only · Meridian Clinical Operations Console
        </p>
      </div>

      {/* Right Authentication Column */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 lg:px-14">
        <div className="w-full max-w-md">
          <div>
            <h2 className="text-2xl font-semibold text-slate-100">Staff Sign In</h2>
            <p className="text-sm text-slate-400 mt-1">
              Enter your Meridian Clinical credentials or select a pre-configured staff role below.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            {error && (
              <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="staff-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                Staff Email
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="staff-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@meridianclinical.org"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-[#111827] border border-[#334155] rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="staff-password" className="block text-xs font-medium text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="staff-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-[#111827] border border-[#334155] rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-medium text-slate-950 bg-sky-400 hover:bg-sky-300 disabled:opacity-60 rounded-md transition-colors whitespace-nowrap"
            >
              <span>{loading ? 'Signing in...' : 'Sign In to Console'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-[#1F2937]">
            <div className="text-xs font-medium text-slate-400 mb-3">
              Quick Access by Staff Role
            </div>
            <div className="space-y-2">
              {DEMO_ACCOUNTS.map((acct) => {
                const Icon = acct.icon;
                return (
                  <button
                    key={acct.role}
                    type="button"
                    disabled={loading}
                    onClick={() => handleQuickSignIn(acct.email, acct.password)}
                    className="w-full text-left px-3.5 py-3 rounded-md bg-[#111827] hover:bg-[#1E293B] border border-[#1F2937] hover:border-[#334155] transition-colors flex items-start gap-3 group"
                  >
                    <Icon className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-100">
                          {acct.role} — {acct.name}
                        </span>
                        <span className="text-xs text-sky-400 opacity-80 group-hover:opacity-100 whitespace-nowrap shrink-0">
                          Sign in
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{acct.scope}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
