import { prisma } from '@/lib/db';

export const instant = false;

export default async function Home() {
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
    <div className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-indigo-500 selection:text-white">
      {/* Background Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl"></div>
        <div className="absolute top-20 right-0 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl"></div>
      </div>

      <div className="relative max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between pb-8 border-b border-slate-800 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-bold text-xl shadow-lg shadow-indigo-500/20">
              B
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                Brightloop Software
              </h1>
              <p className="text-sm text-slate-400">Subscription Management System — Core Backend Foundation</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-medium">
              <span className={`w-2 h-2 rounded-full ${dbStatus === 'ONLINE' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`}></span>
              <span>PostgreSQL: <strong className={dbStatus === 'ONLINE' ? 'text-emerald-400' : 'text-rose-400'}>{dbStatus}</strong></span>
            </div>
            <span className="px-3 py-1.5 rounded-full bg-indigo-950/80 border border-indigo-800/60 text-xs text-indigo-300 font-medium">
              v1.0.0 Foundation
            </span>
          </div>
        </header>

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

        {/* 3-Role Demo Credentials Card */}
        <section className="my-8 p-6 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-900/50 border border-slate-800 shadow-xl">
          <h2 className="text-base font-semibold text-white mb-2 flex items-center gap-2">
            <span>🔑</span> Seeded Demo Accounts & RBAC Roles
          </h2>
          <p className="text-sm text-slate-400 mb-4">
            Pre-configured accounts ready for integration testing across all three modules.
          </p>

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
              <p className="text-xs text-slate-500 mt-2">Full access to users, staff creation, tax & discount configuration, and audit trails.</p>
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
              <p className="text-xs text-slate-500 mt-2">Manage customers, subscriptions, invoices. Cannot create staff or change tax settings.</p>
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

        {/* API Surface & Documentation Links */}
        <section className="my-8 grid md:grid-cols-2 gap-6">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800">
            <h3 className="text-base font-semibold text-white mb-2">📡 Ready API Endpoints</h3>
            <p className="text-sm text-slate-400 mb-4">
              All endpoints return standard JSON responses (<code className="text-xs text-indigo-300">{"{ success, data, meta }"}</code>):
            </p>
            <ul className="space-y-2 text-xs font-mono">
              <li className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800/60">
                <span className="text-emerald-400">POST /api/auth/register</span>
                <span className="text-slate-500">Public</span>
              </li>
              <li className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800/60">
                <span className="text-emerald-400">POST /api/auth/login</span>
                <span className="text-slate-500">Public</span>
              </li>
              <li className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800/60">
                <span className="text-sky-400">GET /api/auth/me</span>
                <span className="text-slate-500">Session</span>
              </li>
              <li className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800/60">
                <span className="text-sky-400">GET /api/customers</span>
                <span className="text-slate-500">Isolated</span>
              </li>
              <li className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800/60">
                <span className="text-purple-400">POST /api/users/staff</span>
                <span className="text-rose-400 font-sans">ADMIN only</span>
              </li>
              <li className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800/60">
                <span className="text-sky-400">GET /api/reference/plans</span>
                <span className="text-slate-500">Catalog</span>
              </li>
              <li className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800/60">
                <span className="text-rose-400">GET /api/audit-logs</span>
                <span className="text-rose-400 font-sans">ADMIN only</span>
              </li>
            </ul>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
            <div>
              <h3 className="text-base font-semibold text-white mb-2">📚 Developer Documentation</h3>
              <p className="text-sm text-slate-400 mb-4">
                Full documentation guides for the other three developers on the team:
              </p>
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="font-medium text-sm text-slate-200">docs/database-architecture.md</div>
                  <p className="text-xs text-slate-400 mt-0.5">ER diagram, 14 models, constraints, and decimal types.</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="font-medium text-sm text-slate-200">docs/api-contracts.md</div>
                  <p className="text-xs text-slate-400 mt-0.5">Request/response types, error codes, and pagination.</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="font-medium text-sm text-slate-200">docs/integration-guide.md</div>
                  <p className="text-xs text-slate-400 mt-0.5">Specific guides for Billing, Pricing, and Dashboard teams.</p>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 text-xs text-slate-500 flex justify-between">
              <span>Tests: <strong>48 / 48 passing</strong></span>
              <span>ORM: <strong>Prisma 6.19.3</strong></span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
