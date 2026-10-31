import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUserSession } from '@/lib/auth/server-session';
import { prisma } from '@/lib/db';
import { Navbar } from '@/components/Navbar';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/Badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  Users,
  CreditCard,
  TrendingUp,
  AlertCircle,
  BarChart3,
  ExternalLink,
  ShieldCheck,
  ArrowUpRight,
  Clock,
  Layers,
} from 'lucide-react';
import { PaymentStatus, InvoiceStatus } from '@prisma/client';

export const instant = false;

export default async function DashboardPage() {
  const { session, user } = await getCurrentUserSession();

  if (!session || !user) {
    redirect('/login');
  }

  if (user.role === 'CUSTOMER') {
    redirect('/portal');
  }

  // Authoritative server-side calculations
  const [
    totalCustomers,
    activeSubscriptionsCount,
    trialingSubscriptionsCount,
    paymentsAggregate,
    invoicesAggregate,
    overdueInvoices,
    recentSubscriptions,
    recentInvoices,
    recentAuditLogs,
  ] = await Promise.all([
    prisma.customer.count(),
    prisma.subscription.count({ where: { status: 'ACTIVE' } }),
    prisma.subscription.count({ where: { status: 'TRIALING' } }),
    prisma.payment.aggregate({
      where: { status: PaymentStatus.SUCCEEDED },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.invoice.aggregate({
      where: { status: InvoiceStatus.OPEN },
      _sum: { amountDue: true },
      _count: { _all: true },
    }),
    prisma.invoice.count({
      where: {
        status: InvoiceStatus.OPEN,
        dueDate: { lt: new Date() },
      },
    }),
    prisma.subscription.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { contactName: true, companyName: true } },
        plan: { select: { name: true, billingInterval: true } },
      },
    }),
    prisma.invoice.findMany({
      take: 5,
      orderBy: { issueDate: 'desc' },
      include: {
        customer: { select: { contactName: true, companyName: true } },
      },
    }),
    prisma.auditLog.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { name: true, role: true } },
      },
    }),
  ]);

  const totalCollectedRevenue = Number(paymentsAggregate._sum.amount ?? 0);
  const totalOutstandingDue = Number(invoicesAggregate._sum.amountDue ?? 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar user={user} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-800/80 gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Operations & Executive Dashboard
              </h1>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                {user.role}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Welcome back, <strong className="text-slate-200">{user.name}</strong>. Real-time overview of subscriptions, revenue, and invoices.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/reports"
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition"
            >
              <BarChart3 className="w-4 h-4" />
              <span>Full Financial Reports</span>
            </Link>
            <Link
              href="/portal"
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-semibold transition"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Customer Portal View</span>
            </Link>
          </div>
        </div>

        {/* Core KPI Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 my-8">
          <StatCard
            title="Collected Revenue"
            value={formatCurrency(totalCollectedRevenue)}
            subtitle={`${paymentsAggregate._count._all} settled transactions`}
            icon={<TrendingUp className="w-5 h-5 text-emerald-400" />}
          />
          <StatCard
            title="Active Subscriptions"
            value={activeSubscriptionsCount}
            subtitle={trialingSubscriptionsCount > 0 ? `+${trialingSubscriptionsCount} in trial` : 'Recurring plans active'}
            icon={<CreditCard className="w-5 h-5 text-indigo-400" />}
          />
          <StatCard
            title="Outstanding Balance"
            value={formatCurrency(totalOutstandingDue)}
            subtitle={`${invoicesAggregate._count._all} open invoices (${overdueInvoices} overdue)`}
            icon={<AlertCircle className="w-5 h-5 text-amber-400" />}
          />
          <StatCard
            title="Total Customers"
            value={totalCustomers}
            subtitle="Verified customer profiles"
            icon={<Users className="w-5 h-5 text-sky-400" />}
          />
        </section>

        {/* Quick Links / Operations Hub */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Link
            href="/dashboard/reports"
            className="p-5 rounded-2xl bg-gradient-to-br from-indigo-950/40 to-slate-900 border border-indigo-900/40 hover:border-indigo-500/40 transition group"
          >
            <div className="flex items-center justify-between">
              <span className="p-2.5 rounded-xl bg-indigo-600/20 text-indigo-400">
                <BarChart3 className="w-5 h-5" />
              </span>
              <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition" />
            </div>
            <h3 className="text-sm font-semibold text-white mt-4">Financial & Plan Reports</h3>
            <p className="text-xs text-slate-400 mt-1">
              Detailed breakdown of revenue, payment methods, overdue balances, and plan performance.
            </p>
          </Link>

          <Link
            href="/dashboard/customers"
            className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/60 border border-slate-800 hover:border-slate-700 transition group"
          >
            <div className="flex items-center justify-between">
              <span className="p-2.5 rounded-xl bg-sky-600/20 text-sky-400">
                <Users className="w-5 h-5" />
              </span>
              <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-sky-400 transition" />
            </div>
            <h3 className="text-sm font-semibold text-white mt-4">Customer Directory</h3>
            <p className="text-xs text-slate-400 mt-1">
              Search and inspect customer accounts, linked subscriptions, and billing currencies.
            </p>
          </Link>

          <Link
            href={user.role === 'ADMIN' ? '/dashboard/audit-logs' : '/portal'}
            className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/60 border border-slate-800 hover:border-slate-700 transition group"
          >
            <div className="flex items-center justify-between">
              <span className="p-2.5 rounded-xl bg-purple-600/20 text-purple-400">
                {user.role === 'ADMIN' ? <ShieldCheck className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
              </span>
              <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-purple-400 transition" />
            </div>
            <h3 className="text-sm font-semibold text-white mt-4">
              {user.role === 'ADMIN' ? 'Security & Audit Logs' : 'Customer Portal Preview'}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {user.role === 'ADMIN'
                ? 'Review immutable activity logs and system changes across all tenant operations.'
                : 'Preview the customer-facing portal and view invoices, quotes, and payment records.'}
            </p>
          </Link>
        </section>

        {/* Recent Data Tables Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Latest Subscriptions */}
          <section className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-indigo-400" />
                <span>Recent Subscriptions</span>
              </h2>
              <Link href="/dashboard/reports" className="text-xs text-indigo-400 hover:text-indigo-300">
                View breakdown →
              </Link>
            </div>

            {recentSubscriptions.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No subscriptions recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="pb-2.5 font-medium">Subscription</th>
                      <th className="pb-2.5 font-medium">Customer</th>
                      <th className="pb-2.5 font-medium">Plan</th>
                      <th className="pb-2.5 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {recentSubscriptions.map((sub) => (
                      <tr key={sub.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 font-mono text-slate-300">{sub.subscriptionNumber}</td>
                        <td className="py-2.5 text-slate-200">
                          {sub.customer.companyName || sub.customer.contactName}
                        </td>
                        <td className="py-2.5 text-slate-400">
                          {sub.plan.name} ({sub.plan.billingInterval})
                        </td>
                        <td className="py-2.5 text-right">
                          <StatusBadge status={sub.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Latest Invoices */}
          <section className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span>Recent Invoices</span>
              </h2>
              <Link href="/dashboard/reports" className="text-xs text-indigo-400 hover:text-indigo-300">
                View all →
              </Link>
            </div>

            {recentInvoices.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">No invoices recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="pb-2.5 font-medium">Invoice #</th>
                      <th className="pb-2.5 font-medium">Customer</th>
                      <th className="pb-2.5 font-medium">Due Date</th>
                      <th className="pb-2.5 font-medium text-right">Total</th>
                      <th className="pb-2.5 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {recentInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 font-mono text-slate-300">{inv.invoiceNumber}</td>
                        <td className="py-2.5 text-slate-200">
                          {inv.customer.companyName || inv.customer.contactName}
                        </td>
                        <td className="py-2.5 text-slate-400">{formatDate(inv.dueDate)}</td>
                        <td className="py-2.5 text-right font-medium text-white">
                          {formatCurrency(Number(inv.totalAmount), inv.currency)}
                        </td>
                        <td className="py-2.5 text-right">
                          <StatusBadge status={inv.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Audit Logs Quick View (for Admin / Staff) */}
        <section className="mt-6 p-6 rounded-2xl bg-slate-900/70 border border-slate-800 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-400" />
              <span>Recent System Activity</span>
            </h2>
            {user.role === 'ADMIN' && (
              <Link href="/dashboard/audit-logs" className="text-xs text-indigo-400 hover:text-indigo-300">
                View audit logs →
              </Link>
            )}
          </div>

          <div className="space-y-2">
            {recentAuditLogs.map((log) => (
              <div
                key={log.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs gap-2"
              >
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-indigo-400 font-semibold px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">
                    {log.action}
                  </span>
                  <span className="text-slate-300">
                    {log.entityType} ({log.entityId})
                  </span>
                </div>
                <div className="flex items-center gap-4 text-slate-400 text-[11px]">
                  <span>By: {log.user?.name ?? 'System'}</span>
                  <span>{formatDate(log.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
