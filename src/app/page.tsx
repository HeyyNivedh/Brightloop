import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getCurrentUserSession } from '@/lib/auth/server-session';
import { Navbar } from '@/components/Navbar';
import {
  LayoutDashboard,
  BarChart3,
  ExternalLink,
  LogIn,
  UserPlus,
  Users,
} from 'lucide-react';

export const instant = false;

export default async function Home() {
  const { user } = await getCurrentUserSession();

  let dbStatus = 'CONNECTING';
  let counts = {
    users: 0,
    customers: 0,
    products: 0,
    plans: 0,
    subscriptions: 0,
    invoices: 0,
    auditLogs: 0,
  };

  try {
    const [u, c, p, pl, s, i, a] = await Promise.all([
      prisma.user.count(),
      prisma.customer.count(),
      prisma.product.count(),
      prisma.subscriptionPlan.count(),
      prisma.subscription.count(),
      prisma.invoice.count(),
      prisma.auditLog.count(),
    ]);
    counts = { users: u, customers: c, products: p, plans: pl, subscriptions: s, invoices: i, auditLogs: a };
    dbStatus = 'ONLINE';
  } catch {
    dbStatus = 'OFFLINE';
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-indigo-500 selection:text-white flex flex-col">
      {/* Dynamic Role Navigation */}
      <Navbar user={user} />

      {/* Background Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl"></div>
        <div className="absolute top-20 right-0 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl"></div>
      </div>

      <div className="relative max-w-6xl w-full mx-auto px-6 py-10 flex-1">
        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto mb-10 pt-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-950/80 border border-indigo-800/60 text-xs text-indigo-300 font-medium mb-4">
            <span className={`w-2 h-2 rounded-full ${dbStatus === 'ONLINE' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`}></span>
            <span>Database: <strong className={dbStatus === 'ONLINE' ? 'text-emerald-400' : 'text-rose-400'}>{dbStatus}</strong></span>
            <span>·</span>
            <span>Member 4: Dashboard & Portal</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            Software Subscription & Billing Management
          </h1>
          <p className="text-sm sm:text-base text-slate-400 mt-3 max-w-2xl mx-auto">
            Complete platform for subscription lifecycles, automated invoicing, customer self-service, and financial reporting.
          </p>

          {/* Role-Specific CTA Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            {user ? (
              user.role === 'CUSTOMER' ? (
                <Link
                  href="/portal"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open Customer Portal</span>
                </Link>
              ) : (
                <>
                  <Link
                    href="/dashboard"
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition"
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    <span>Go to Operations Dashboard</span>
                  </Link>
                  <Link
                    href="/dashboard/reports"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-semibold transition"
                  >
                    <BarChart3 className="w-4 h-4" />
                    <span>Financial Analytics</span>
                  </Link>
                </>
              )
            ) : (
              <>
                <Link
                  href="/login"
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Sign In</span>
                </Link>
                <Link
                  href="/register"
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-semibold transition"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Customer Register</span>
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Live Metrics Grid */}
        <section className="my-8">
          <h2 className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-4">
            Live Database Metrics
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { label: 'Users', count: counts.users, color: 'text-indigo-400' },
              { label: 'Customers', count: counts.customers, color: 'text-emerald-400' },
              { label: 'Products', count: counts.products, color: 'text-sky-400' },
              { label: 'Plans', count: counts.plans, color: 'text-cyan-400' },
              { label: 'Subscriptions', count: counts.subscriptions, color: 'text-purple-400' },
              { label: 'Invoices', count: counts.invoices, color: 'text-amber-400' },
              { label: 'Audit Logs', count: counts.auditLogs, color: 'text-rose-400' },
            ].map((metric) => (
              <div key={metric.label} className="p-4 rounded-xl bg-slate-900/70 border border-slate-800/80 backdrop-blur-sm">
                <div className="text-xs text-slate-400">{metric.label}</div>
                <div className={`text-2xl font-bold mt-1 ${metric.color}`}>{metric.count}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Product & Pricing Management Quick Access */}
        <section className="my-8 p-6 rounded-2xl bg-gradient-to-r from-indigo-950/80 via-slate-900 to-violet-950/80 border border-indigo-800/80 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider">
                Module 3 Ready
              </span>
              <span className="text-sm font-semibold text-white">Product & Pricing Management Portal</span>
            </div>
            <p className="text-sm text-slate-300 max-w-2xl">
              Manage products, configurable variants, recurring subscription plans, regional tax rules, and promotional discounts with the interactive pricing calculation sandbox.
            </p>
          </div>
          <a
            href="/admin"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition shadow-lg shadow-indigo-600/30 whitespace-nowrap"
          >
            <span>Launch Management Console</span>
            <span>&rarr;</span>
          </a>
        </section>

        {/* 3-Role Demo Credentials Card */}
        <section className="my-8 p-6 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-900/50 border border-slate-800 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <span>🔑</span> Seeded Demo Accounts & RBAC Roles
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Pre-configured accounts ready for testing across all application areas.
              </p>
            </div>
            <Link
              href="/login"
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
            >
              Sign in with demo accounts →
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  ADMIN
                </span>
                <span className="text-xs text-slate-500">Superuser</span>
              </div>
              <div className="text-sm font-mono text-slate-200">admin@brightloop.com</div>
              <div className="text-xs font-mono text-slate-400 mt-1">Pass: Admin123!@#</div>
              <p className="text-xs text-slate-500 mt-2">Full access to dashboard, reports, audit logs, and customer directory.</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  STAFF
                </span>
                <span className="text-xs text-slate-500">Operations</span>
              </div>
              <div className="text-sm font-mono text-slate-200">staff@brightloop.com</div>
              <div className="text-xs font-mono text-slate-400 mt-1">Pass: Staff123!@#</div>
              <p className="text-xs text-slate-500 mt-2">Manage customers, view subscriptions, financial reports, and invoices.</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  CUSTOMER
                </span>
                <span className="text-xs text-slate-500">Self-Service</span>
              </div>
              <div className="text-sm font-mono text-slate-200">customer@acme.com</div>
              <div className="text-xs font-mono text-slate-400 mt-1">Pass: Customer123!@#</div>
              <p className="text-xs text-slate-500 mt-2">Strictly isolated to Acme customer profile, own subscriptions, and invoices.</p>
            </div>
          </div>
        </section>

        {/* Feature Areas Grid */}
        <section className="my-8 grid md:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 flex items-center justify-center text-indigo-400 mb-3">
              <LayoutDashboard className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-white">Operations Dashboard</h3>
            <p className="text-xs text-slate-400 mt-1">
              Executive overview for Admin and Staff with live KPI cards, recent subscriptions, invoices, and system alerts.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 flex items-center justify-center text-emerald-400 mb-3">
              <BarChart3 className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-white">Financial & Plan Reports</h3>
            <p className="text-xs text-slate-400 mt-1">
              Authoritative reporting engine with period filtering (7d, 30d, 90d, 1y, all-time), overdue tracking, and payment method breakdowns.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
            <div className="w-10 h-10 rounded-xl bg-sky-600/20 flex items-center justify-center text-sky-400 mb-3">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-white">Customer Self-Service Portal</h3>
            <p className="text-xs text-slate-400 mt-1">
              Secure, IDOR-protected customer area to inspect subscriptions, quotations, open and paid invoices, and receipts.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
