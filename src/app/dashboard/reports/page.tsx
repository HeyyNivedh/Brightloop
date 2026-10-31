'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Navbar, NavbarUser } from '@/components/Navbar';
import { StatCard } from '@/components/StatCard';
import { Badge, StatusBadge } from '@/components/Badge';
import { StatCardSkeleton, TableSkeleton } from '@/components/LoadingSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import {
  BarChart3,
  TrendingUp,
  CreditCard,
  AlertCircle,
  Calendar,
  Layers,
  ArrowLeft,
  Download,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

interface ReportData {
  period: string;
  dateRange: {
    startDate: string | null;
    endDate: string;
  };
  subscriptions: {
    total: number;
    byStatus: Record<string, number>;
  };
  revenue: {
    totalCollected: number;
    successfulPaymentsCount: number;
    byPaymentMethod: Array<{
      method: string;
      count: number;
      total: number;
    }>;
    recentPayments: Array<{
      id: string;
      paymentNumber: string;
      amount: number;
      currency: string;
      status: string;
      method: string;
      paidAt: string | null;
      customerName: string;
      customerCompany: string | null;
      invoiceNumber: string;
    }>;
  };
  invoices: {
    totalInvoiced: number;
    totalOutstanding: number;
    totalOverdue: number;
    overdueCount: number;
    byStatus: Record<
      string,
      { count: number; totalAmount: number; amountDue: number; amountPaid: number }
    >;
    overdueList: Array<{
      id: string;
      invoiceNumber: string;
      customerName: string;
      companyName: string | null;
      dueDate: string;
      amountDue: number;
      currency: string;
      status: string;
    }>;
  };
  planPerformance: Array<{
    id: string;
    code: string;
    name: string;
    productName: string;
    billingInterval: string;
    price: number;
    currency: string;
    subscriberCount: number;
    active: boolean;
  }>;
}

export default function ReportsPage() {
  const [currentUser, setCurrentUser] = useState<NavbarUser | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('30d');
  const [activeTab, setActiveTab] = useState<'overview' | 'revenue' | 'invoices' | 'plans'>('overview');
  const [report, setReport] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // Load current user profile for role verification
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data?.user) {
          setCurrentUser(data.data.user);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let ignore = false;
    fetch(`/api/reports?period=${selectedPeriod}`)
      .then((res) => res.json())
      .then((json) => {
        if (!ignore) {
          if (json.success) {
            setReport(json.data);
            setError(null);
          } else {
            setError(json.error?.message || 'Failed to fetch financial reports');
          }
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Error loading report metrics');
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [selectedPeriod, refreshTrigger]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar user={currentUser} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center justify-between pb-6 border-b border-slate-800/80 mb-6">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition"
              title="Return to Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  Reporting & Financial Analytics
                </h1>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Authoritative Backend Engine
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Authoritative calculations on subscription lifecycles, collected revenue, overdue invoices, and plan performance.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setIsLoading(true);
                setRefreshTrigger((prev) => prev + 1);
              }}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition"
              title="Refresh data"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-semibold transition"
            >
              <Download className="w-4 h-4" />
              <span>Print / Export</span>
            </button>
          </div>
        </div>

        {/* Date Period Selector Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/60 border border-slate-800 mb-8">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-medium text-slate-300">Period:</span>
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              {[
                { label: '7 Days', value: '7d' },
                { label: '30 Days', value: '30d' },
                { label: '90 Days', value: '90d' },
                { label: '1 Year', value: '365d' },
                { label: 'All Time', value: 'all' },
              ].map((p) => (
                <button
                  key={p.value}
                  onClick={() => {
                    setIsLoading(true);
                    setSelectedPeriod(p.value);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                    selectedPeriod === p.value
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="text-xs text-slate-400 font-mono flex items-center gap-2">
            <span>Date Range:</span>
            <span className="text-slate-200 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
              {report?.dateRange.startDate
                ? `${formatDate(report.dateRange.startDate)} — ${formatDate(report.dateRange.endDate)}`
                : report?.dateRange.endDate
                  ? `Up to ${formatDate(report.dateRange.endDate)}`
                  : 'Current Period'}
            </span>
          </div>
        </div>

        {/* Reports Navigation Tabs */}
        <div className="flex border-b border-slate-800 mb-6 gap-2">
          {[
            { id: 'overview', label: 'Executive Summary', icon: <BarChart3 className="w-4 h-4" /> },
            { id: 'revenue', label: 'Revenue & Payments', icon: <TrendingUp className="w-4 h-4" /> },
            { id: 'invoices', label: 'Outstanding & Invoices', icon: <AlertCircle className="w-4 h-4" /> },
            { id: 'plans', label: 'Plan Performance', icon: <Layers className="w-4 h-4" /> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition -mb-px ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-white bg-slate-900/40 rounded-t-lg'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Error Notification */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs mb-6 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </div>
            <TableSkeleton rows={4} cols={4} />
          </div>
        )}

        {/* Tab 1: Executive Summary */}
        {!isLoading && report && activeTab === 'overview' && (
          <div className="space-y-8">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Settled Revenue"
                value={formatCurrency(report.revenue.totalCollected)}
                subtitle={`${report.revenue.successfulPaymentsCount} paid transactions`}
                icon={<TrendingUp className="w-5 h-5 text-emerald-400" />}
              />
              <StatCard
                title="Active Subscriptions"
                value={report.subscriptions.byStatus.ACTIVE || 0}
                subtitle={`${report.subscriptions.total} total subscriptions`}
                icon={<CreditCard className="w-5 h-5 text-indigo-400" />}
              />
              <StatCard
                title="Outstanding Due"
                value={formatCurrency(report.invoices.totalOutstanding)}
                subtitle={`${report.invoices.overdueCount} overdue invoices`}
                icon={<AlertCircle className="w-5 h-5 text-amber-400" />}
              />
              <StatCard
                title="Overdue Amount"
                value={formatCurrency(report.invoices.totalOverdue)}
                subtitle="Requires collections follow-up"
                icon={<AlertCircle className="w-5 h-5 text-rose-400" />}
              />
            </div>

            {/* Subscriptions Status Breakdown */}
            <section className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800">
              <h2 className="text-sm font-semibold text-white mb-1">
                Subscription Status Distribution
              </h2>
              <p className="text-xs text-slate-400 mb-6">
                Current lifecycle distribution across all customer subscriptions
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {Object.entries(report.subscriptions.byStatus).map(([status, count]) => (
                  <div key={status} className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-center">
                    <StatusBadge status={status} />
                    <div className="text-xl font-bold text-white mt-2">{count}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {report.subscriptions.total > 0
                        ? `${Math.round((count / report.subscriptions.total) * 100)}% of total`
                        : '0%'}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Invoice Status Summary */}
            <section className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800">
              <h2 className="text-sm font-semibold text-white mb-1">
                Invoice Breakdown in Period
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                Total invoiced, collected, and open receivables for the selected date range
              </p>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="pb-3 font-medium">Status</th>
                      <th className="pb-3 font-medium text-center">Count</th>
                      <th className="pb-3 font-medium text-right">Invoiced Amount</th>
                      <th className="pb-3 font-medium text-right">Amount Paid</th>
                      <th className="pb-3 font-medium text-right">Amount Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {Object.entries(report.invoices.byStatus).map(([status, val]) => (
                      <tr key={status} className="hover:bg-slate-800/30">
                        <td className="py-3">
                          <StatusBadge status={status} />
                        </td>
                        <td className="py-3 text-center text-slate-300 font-mono">{val.count}</td>
                        <td className="py-3 text-right text-white font-medium">
                          {formatCurrency(val.totalAmount)}
                        </td>
                        <td className="py-3 text-right text-emerald-400 font-medium">
                          {formatCurrency(val.amountPaid)}
                        </td>
                        <td className="py-3 text-right text-amber-400 font-medium">
                          {formatCurrency(val.amountDue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-700 font-semibold text-white">
                      <td className="pt-3">Totals</td>
                      <td className="pt-3 text-center font-mono">
                        {Object.values(report.invoices.byStatus).reduce((s, i) => s + i.count, 0)}
                      </td>
                      <td className="pt-3 text-right">{formatCurrency(report.invoices.totalInvoiced)}</td>
                      <td className="pt-3 text-right text-emerald-400">
                        {formatCurrency(
                          Object.values(report.invoices.byStatus).reduce((s, i) => s + i.amountPaid, 0)
                        )}
                      </td>
                      <td className="pt-3 text-right text-amber-400">
                        {formatCurrency(report.invoices.totalOutstanding)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* Tab 2: Revenue & Payments */}
        {!isLoading && report && activeTab === 'revenue' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard
                title="Total Settled Revenue"
                value={formatCurrency(report.revenue.totalCollected)}
                subtitle="Authoritative sum of SUCCEEDED payments"
                icon={<TrendingUp className="w-5 h-5 text-emerald-400" />}
              />
              <StatCard
                title="Payment Transactions"
                value={report.revenue.successfulPaymentsCount}
                subtitle="Successful transactions in period"
                icon={<CheckCircle2 className="w-5 h-5 text-sky-400" />}
              />
              <StatCard
                title="Average Payment Size"
                value={
                  report.revenue.successfulPaymentsCount > 0
                    ? formatCurrency(
                        report.revenue.totalCollected / report.revenue.successfulPaymentsCount
                      )
                    : '$0.00'
                }
                subtitle="Per transaction average"
                icon={<CreditCard className="w-5 h-5 text-indigo-400" />}
              />
            </div>

            {/* Payment Methods Distribution */}
            <section className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800">
              <h2 className="text-sm font-semibold text-white mb-4">
                Revenue by Payment Method
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {report.revenue.byPaymentMethod.map((pm) => (
                  <div key={pm.method} className="p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                    <div className="text-xs text-slate-400 font-mono">{pm.method}</div>
                    <div className="text-xl font-bold text-white mt-1">{formatCurrency(pm.total)}</div>
                    <div className="text-xs text-slate-500 mt-1">{pm.count} transactions</div>
                  </div>
                ))}
              </div>
            </section>

            {/* Recent Payments Table */}
            <section className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800">
              <h2 className="text-sm font-semibold text-white mb-4">
                Recent Payment Transactions
              </h2>
              {report.revenue.recentPayments.length === 0 ? (
                <EmptyState
                  title="No payments in period"
                  description="No payments were recorded during the selected date range."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="pb-3 font-medium">Payment #</th>
                        <th className="pb-3 font-medium">Invoice #</th>
                        <th className="pb-3 font-medium">Customer</th>
                        <th className="pb-3 font-medium">Method</th>
                        <th className="pb-3 font-medium">Date</th>
                        <th className="pb-3 font-medium text-right">Amount</th>
                        <th className="pb-3 font-medium text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {report.revenue.recentPayments.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-800/30">
                          <td className="py-3 font-mono text-slate-300">{p.paymentNumber}</td>
                          <td className="py-3 font-mono text-slate-400">{p.invoiceNumber}</td>
                          <td className="py-3 text-slate-200">{p.customerCompany || p.customerName}</td>
                          <td className="py-3 text-slate-400 font-mono text-[11px]">{p.method}</td>
                          <td className="py-3 text-slate-400">{formatDateTime(p.paidAt)}</td>
                          <td className="py-3 text-right font-medium text-emerald-400">
                            {formatCurrency(p.amount, p.currency)}
                          </td>
                          <td className="py-3 text-right">
                            <StatusBadge status={p.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}

        {/* Tab 3: Outstanding & Invoices */}
        {!isLoading && report && activeTab === 'invoices' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCard
                title="Total Outstanding"
                value={formatCurrency(report.invoices.totalOutstanding)}
                subtitle="Open unpaid invoice balance"
                icon={<AlertCircle className="w-5 h-5 text-amber-400" />}
              />
              <StatCard
                title="Total Overdue"
                value={formatCurrency(report.invoices.totalOverdue)}
                subtitle={`${report.invoices.overdueCount} past due invoices`}
                icon={<AlertCircle className="w-5 h-5 text-rose-400" />}
              />
              <StatCard
                title="Total Invoiced in Period"
                value={formatCurrency(report.invoices.totalInvoiced)}
                subtitle="Gross invoiced receivables"
                icon={<CreditCard className="w-5 h-5 text-indigo-400" />}
              />
            </div>

            {/* Overdue Invoices Alert Table */}
            <section className="p-6 rounded-2xl bg-slate-900/70 border border-rose-900/30">
              <div className="flex items-center gap-2 mb-4">
                <AlertCircle className="w-4 h-4 text-rose-400" />
                <h2 className="text-sm font-semibold text-rose-200">
                  Overdue Invoices Requiring Action ({report.invoices.overdueCount})
                </h2>
              </div>

              {report.invoices.overdueList.length === 0 ? (
                <div className="p-6 text-center text-xs text-emerald-400 bg-emerald-950/20 border border-emerald-900/40 rounded-xl">
                  ✓ Great news! No invoices are currently overdue.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="pb-3 font-medium">Invoice #</th>
                        <th className="pb-3 font-medium">Customer</th>
                        <th className="pb-3 font-medium">Due Date</th>
                        <th className="pb-3 font-medium text-right">Amount Due</th>
                        <th className="pb-3 font-medium text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {report.invoices.overdueList.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-800/30">
                          <td className="py-3 font-mono text-slate-300">{inv.invoiceNumber}</td>
                          <td className="py-3 text-slate-200">{inv.companyName || inv.customerName}</td>
                          <td className="py-3 text-rose-400 font-medium">{formatDate(inv.dueDate)}</td>
                          <td className="py-3 text-right font-medium text-rose-400">
                            {formatCurrency(inv.amountDue, inv.currency)}
                          </td>
                          <td className="py-3 text-right">
                            <Badge variant="danger">OVERDUE</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}

        {/* Tab 4: Plan Performance */}
        {!isLoading && report && activeTab === 'plans' && (
          <div className="space-y-6">
            <section className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800">
              <h2 className="text-sm font-semibold text-white mb-1">
                Subscription Plan Performance
              </h2>
              <p className="text-xs text-slate-400 mb-6">
                Active subscriber count, billing cadence, and pricing for all available plans
              </p>

              {report.planPerformance.length === 0 ? (
                <EmptyState
                  title="No plans configured"
                  description="No subscription plans are currently active in the catalog."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="pb-3 font-medium">Plan Code</th>
                        <th className="pb-3 font-medium">Plan Name</th>
                        <th className="pb-3 font-medium">Product</th>
                        <th className="pb-3 font-medium">Interval</th>
                        <th className="pb-3 font-medium text-right">Unit Price</th>
                        <th className="pb-3 font-medium text-center">Subscribers</th>
                        <th className="pb-3 font-medium text-right">Catalog Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {report.planPerformance.map((plan) => (
                        <tr key={plan.id} className="hover:bg-slate-800/30">
                          <td className="py-3 font-mono text-indigo-400">{plan.code}</td>
                          <td className="py-3 font-semibold text-white">{plan.name}</td>
                          <td className="py-3 text-slate-300">{plan.productName}</td>
                          <td className="py-3 text-slate-400 font-mono text-[11px]">
                            {plan.billingInterval}
                          </td>
                          <td className="py-3 text-right font-medium text-white">
                            {formatCurrency(plan.price, plan.currency)}
                          </td>
                          <td className="py-3 text-center">
                            <span className="inline-block px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 font-mono font-bold">
                              {plan.subscriberCount}
                            </span>
                          </td>
                          <td className="py-3 text-right">
                            <Badge variant={plan.active ? 'success' : 'neutral'}>
                              {plan.active ? 'ACTIVE' : 'INACTIVE'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
