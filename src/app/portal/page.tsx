import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUserSession } from '@/lib/auth/server-session';
import { prisma } from '@/lib/db';
import { Navbar } from '@/components/Navbar';
import { StatCard } from '@/components/StatCard';
import { StatusBadge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import {
  CreditCard,
  FileText,
  DollarSign,
  Building,
  Mail,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Layers,
  AlertCircle,
} from 'lucide-react';
import { SubscriptionStatus, InvoiceStatus, PaymentStatus } from '@prisma/client';

export const instant = false;

interface PortalPageProps {
  searchParams: Promise<{
    tab?: string;
    customerId?: string;
  }>;
}

export default async function CustomerPortalPage({ searchParams }: PortalPageProps) {
  const { session, user } = await getCurrentUserSession();

  if (!session || !user) {
    redirect('/login');
  }

  const resolvedParams = await searchParams;
  const currentTab = resolvedParams.tab || 'overview';

  // Strict Customer Isolation:
  // If the user is a CUSTOMER, they are locked to their own linked customer ID.
  // Any query parameter ?customerId=... from a customer is explicitly ignored.
  let targetCustomerId: string | null = null;

  if (user.role === 'CUSTOMER') {
    if (!user.customer?.id) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
          <Navbar user={user} />
          <main className="flex-1 flex items-center justify-center p-6">
            <EmptyState
              title="No Customer Profile Linked"
              description="Your account is not currently linked to an active customer profile. Please contact support."
            />
          </main>
        </div>
      );
    }
    targetCustomerId = user.customer.id;
  } else {
    // ADMIN or STAFF previewing customer portal
    if (resolvedParams.customerId) {
      targetCustomerId = resolvedParams.customerId;
    } else {
      const firstCustomer = await prisma.customer.findFirst({
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      targetCustomerId = firstCustomer?.id ?? null;
    }
  }

  if (!targetCustomerId) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <Navbar user={user} />
        <main className="flex-1 flex items-center justify-center p-6">
          <EmptyState
            title="Customer Not Found"
            description="No customer record was found to display in the portal."
          />
        </main>
      </div>
    );
  }

  // Fetch complete customer domain data
  const customer = await prisma.customer.findUnique({
    where: { id: targetCustomerId },
    include: {
      subscriptions: {
        include: {
          plan: {
            include: {
              product: true,
              pricing: { where: { active: true } },
            },
          },
          lines: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      quotations: {
        include: {
          lines: {
            include: {
              product: true,
              plan: true,
            },
          },
          template: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      invoices: {
        include: {
          lines: true,
        },
        orderBy: { issueDate: 'desc' },
      },
      payments: {
        include: {
          invoice: {
            select: {
              invoiceNumber: true,
              issueDate: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!customer) {
    redirect('/login');
  }

  // Authoritative aggregations
  const activeSubscription = customer.subscriptions.find(
    (s) => s.status === SubscriptionStatus.ACTIVE || s.status === SubscriptionStatus.TRIALING
  );
  const openInvoices = customer.invoices.filter((i) => i.status === InvoiceStatus.OPEN);
  const totalDue = openInvoices.reduce((sum, inv) => sum + Number(inv.amountDue), 0);
  const totalPaid = customer.payments
    .filter((p) => p.status === PaymentStatus.SUCCEEDED)
    .reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar user={user} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Admin/Staff preview mode indicator */}
        {user.role !== 'CUSTOMER' && (
          <div className="mb-6 p-3 rounded-xl bg-indigo-950/60 border border-indigo-800/80 text-xs text-indigo-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              <span>
                <strong>Staff Portal View:</strong> Viewing as customer{' '}
                <strong className="text-white">{customer.contactName} ({customer.customerNumber})</strong>
              </span>
            </div>
            <Link
              href="/dashboard/customers"
              className="text-indigo-400 hover:text-white underline text-xs"
            >
              Switch Customer
            </Link>
          </div>
        )}

        {/* Customer Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-800/80 mb-6 gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white">
                {customer.companyName || customer.contactName}
              </h1>
              <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                {customer.customerNumber}
              </span>
              <StatusBadge status={customer.status} />
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Customer Self-Service Hub — Manage active subscriptions, invoices, quotes, and payment receipts.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
              <Mail className="w-3.5 h-3.5 text-slate-500" />
              <span>{customer.email}</span>
            </span>
            <span className="flex items-center gap-1.5 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
              <DollarSign className="w-3.5 h-3.5 text-slate-500" />
              <span>Currency: <strong>{customer.currency}</strong></span>
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 mb-8 overflow-x-auto gap-2">
          {[
            { id: 'overview', label: 'Overview', icon: <Layers className="w-4 h-4" /> },
            {
              id: 'subscriptions',
              label: `Subscriptions (${customer.subscriptions.length})`,
              icon: <CreditCard className="w-4 h-4" />,
            },
            {
              id: 'invoices',
              label: `Invoices (${customer.invoices.length})`,
              icon: <FileText className="w-4 h-4" />,
            },
            {
              id: 'quotations',
              label: `Quotations (${customer.quotations.length})`,
              icon: <FileText className="w-4 h-4" />,
            },
            {
              id: 'payments',
              label: `Payments (${customer.payments.length})`,
              icon: <Clock className="w-4 h-4" />,
            },
            {
              id: 'profile',
              label: 'Account Details',
              icon: <Building className="w-4 h-4" />,
            },
          ].map((tab) => (
            <Link
              key={tab.id}
              href={`/portal?tab=${tab.id}${user.role !== 'CUSTOMER' ? `&customerId=${customer.id}` : ''}`}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition -mb-px ${
                currentTab === tab.id
                  ? 'border-indigo-500 text-white bg-slate-900/40 rounded-t-lg'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </Link>
          ))}
        </div>

        {/* Tab 1: Overview */}
        {currentTab === 'overview' && (
          <div className="space-y-8">
            {/* Top Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Active Subscription"
                value={activeSubscription ? activeSubscription.plan.name : 'No Active Plan'}
                subtitle={
                  activeSubscription
                    ? `Renews on ${formatDate(activeSubscription.currentPeriodEnd)}`
                    : 'Browse plans to subscribe'
                }
                icon={<CreditCard className="w-5 h-5 text-indigo-400" />}
              />
              <StatCard
                title="Open Balance Due"
                value={formatCurrency(totalDue, customer.currency)}
                subtitle={
                  openInvoices.length > 0
                    ? `${openInvoices.length} open invoice(s) awaiting payment`
                    : 'All accounts up to date'
                }
                icon={<AlertCircle className={`w-5 h-5 ${totalDue > 0 ? 'text-amber-400' : 'text-emerald-400'}`} />}
              />
              <StatCard
                title="Lifetime Settled"
                value={formatCurrency(totalPaid, customer.currency)}
                subtitle={`${customer.payments.length} successful payment receipts`}
                icon={<CheckCircle2 className="w-5 h-5 text-emerald-400" />}
              />
              <StatCard
                title="Active Quotes"
                value={customer.quotations.filter((q) => q.status === 'SENT' || q.status === 'DRAFT').length}
                subtitle={`${customer.quotations.length} total formal quotations`}
                icon={<FileText className="w-5 h-5 text-sky-400" />}
              />
            </div>

            {/* Current Active Plan Spotlight */}
            {activeSubscription && (
              <section className="p-6 rounded-2xl bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-900 border border-indigo-900/50 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-indigo-900/40 gap-3">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-indigo-400 font-semibold">
                      Your Current Plan
                    </span>
                    <h2 className="text-xl font-bold text-white mt-1">
                      {activeSubscription.plan.name}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {activeSubscription.plan.description || activeSubscription.plan.product.description}
                    </p>
                  </div>
                  <div className="text-right">
                    <StatusBadge status={activeSubscription.status} />
                    <div className="text-sm font-semibold text-white mt-2">
                      Billing Interval: {activeSubscription.plan.billingInterval}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 text-xs">
                  <div>
                    <span className="text-slate-400">Subscription Number:</span>
                    <p className="font-mono text-slate-200 mt-0.5">{activeSubscription.subscriptionNumber}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Current Period:</span>
                    <p className="text-slate-200 mt-0.5">
                      {formatDate(activeSubscription.currentPeriodStart)} — {formatDate(activeSubscription.currentPeriodEnd)}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Auto Renewal:</span>
                    <p className="text-slate-200 mt-0.5">
                      {activeSubscription.autoRenew ? 'Enabled (Automatic)' : 'Manual Renewal'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Plan Rate:</span>
                    <p className="text-emerald-400 font-bold text-sm mt-0.5">
                      {formatCurrency(Number(activeSubscription.plan.pricing[0]?.amount ?? 0), customer.currency)} / {activeSubscription.plan.billingInterval.toLowerCase()}
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* Open Invoices Notice if any */}
            {openInvoices.length > 0 && (
              <section className="p-6 rounded-2xl bg-amber-950/20 border border-amber-900/40">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-400" />
                    <h3 className="text-sm font-semibold text-amber-200">
                      Open Invoices Awaiting Payment
                    </h3>
                  </div>
                  <Link
                    href={`/portal?tab=invoices${user.role !== 'CUSTOMER' ? `&customerId=${customer.id}` : ''}`}
                    className="text-xs text-amber-400 hover:text-amber-300 font-medium"
                  >
                    View details →
                  </Link>
                </div>
                <div className="space-y-2">
                  {openInvoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-amber-900/30 text-xs"
                    >
                      <div>
                        <span className="font-mono text-slate-300 font-semibold">{inv.invoiceNumber}</span>
                        <span className="text-slate-400 ml-3">Due: {formatDate(inv.dueDate)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-amber-400">
                          {formatCurrency(Number(inv.amountDue), inv.currency)}
                        </span>
                        <StatusBadge status={inv.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {/* Tab 2: Subscriptions */}
        {currentTab === 'subscriptions' && (
          <div className="space-y-6">
            {customer.subscriptions.length === 0 ? (
              <EmptyState
                title="No Subscriptions Found"
                description="You do not have any subscription records attached to your account."
              />
            ) : (
              <div className="space-y-4">
                {customer.subscriptions.map((sub) => (
                  <div
                    key={sub.id}
                    className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800/80 gap-3">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h3 className="text-base font-bold text-white">{sub.plan.name}</h3>
                          <StatusBadge status={sub.status} />
                        </div>
                        <p className="text-xs font-mono text-indigo-400 mt-1">
                          #{sub.subscriptionNumber} · Code: {sub.plan.code}
                        </p>
                      </div>

                      <div className="text-right">
                        <div className="text-lg font-bold text-emerald-400">
                          {formatCurrency(Number(sub.plan.pricing[0]?.amount ?? 0), sub.currency)}
                          <span className="text-xs text-slate-400 font-normal"> / {sub.plan.billingInterval.toLowerCase()}</span>
                        </div>
                      </div>
                    </div>

                    {/* Subscription Metadata Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-b border-slate-800/60 text-xs">
                      <div>
                        <span className="text-slate-400">Current Period Start:</span>
                        <p className="text-slate-200 mt-0.5">{formatDate(sub.currentPeriodStart)}</p>
                      </div>
                      <div>
                        <span className="text-slate-400">Current Period End:</span>
                        <p className="text-slate-200 mt-0.5">{formatDate(sub.currentPeriodEnd)}</p>
                      </div>
                      <div>
                        <span className="text-slate-400">Auto Renewal:</span>
                        <p className="text-slate-200 mt-0.5">{sub.autoRenew ? 'Active' : 'Disabled'}</p>
                      </div>
                      <div>
                        <span className="text-slate-400">Product:</span>
                        <p className="text-slate-200 mt-0.5">{sub.plan.product.name}</p>
                      </div>
                    </div>

                    {/* Line Items Breakdown */}
                    {sub.lines.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-xs font-semibold text-slate-400 mb-2">Subscription Line Items</h4>
                        <div className="space-y-1.5">
                          {sub.lines.map((line) => (
                            <div
                              key={line.id}
                              className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs"
                            >
                              <span className="text-slate-300">
                                {line.description} (x{line.quantity})
                              </span>
                              <span className="font-mono text-white font-medium">
                                {formatCurrency(Number(line.amount), sub.currency)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Invoices */}
        {currentTab === 'invoices' && (
          <div className="space-y-6">
            {customer.invoices.length === 0 ? (
              <EmptyState
                title="No Invoices Recorded"
                description="You do not have any invoices billed yet."
              />
            ) : (
              <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="pb-3 font-medium">Invoice #</th>
                      <th className="pb-3 font-medium">Issue Date</th>
                      <th className="pb-3 font-medium">Due Date</th>
                      <th className="pb-3 font-medium text-right">Subtotal</th>
                      <th className="pb-3 font-medium text-right">Tax</th>
                      <th className="pb-3 font-medium text-right">Total</th>
                      <th className="pb-3 font-medium text-right">Amount Due</th>
                      <th className="pb-3 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {customer.invoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-800/30">
                        <td className="py-3 font-mono font-medium text-indigo-400">{inv.invoiceNumber}</td>
                        <td className="py-3 text-slate-300">{formatDate(inv.issueDate)}</td>
                        <td className="py-3 text-slate-400">{formatDate(inv.dueDate)}</td>
                        <td className="py-3 text-right text-slate-300">
                          {formatCurrency(Number(inv.subtotal), inv.currency)}
                        </td>
                        <td className="py-3 text-right text-slate-400">
                          {formatCurrency(Number(inv.taxAmount), inv.currency)}
                        </td>
                        <td className="py-3 text-right font-semibold text-white">
                          {formatCurrency(Number(inv.totalAmount), inv.currency)}
                        </td>
                        <td className="py-3 text-right font-semibold">
                          <span className={Number(inv.amountDue) > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                            {formatCurrency(Number(inv.amountDue), inv.currency)}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <StatusBadge status={inv.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Quotations */}
        {currentTab === 'quotations' && (
          <div className="space-y-6">
            {customer.quotations.length === 0 ? (
              <EmptyState
                title="No Quotations Available"
                description="There are currently no formal quotes issued for your account."
              />
            ) : (
              <div className="space-y-4">
                {customer.quotations.map((quote) => (
                  <div key={quote.id} className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800/80 gap-3">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h3 className="text-base font-bold text-white font-mono">{quote.quotationNumber}</h3>
                          <StatusBadge status={quote.status} />
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          Valid until: <strong className="text-slate-200">{formatDate(quote.validUntil)}</strong>
                        </p>
                      </div>

                      <div className="text-right">
                        <div className="text-lg font-bold text-white">
                          {formatCurrency(Number(quote.totalAmount), quote.currency)}
                        </div>
                        <span className="text-[11px] text-slate-400">Total Quoted Value</span>
                      </div>
                    </div>

                    {/* Quotation lines */}
                    <div className="mt-4">
                      <h4 className="text-xs font-semibold text-slate-400 mb-2">Quotation Line Items</h4>
                      <div className="space-y-1.5">
                        {quote.lines.map((line) => (
                          <div
                            key={line.id}
                            className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs"
                          >
                            <span className="text-slate-300">
                              {line.description} (Qty: {line.quantity})
                            </span>
                            <span className="font-mono text-white font-medium">
                              {formatCurrency(Number(line.lineTotal), quote.currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {quote.terms && (
                      <div className="mt-4 p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400">
                        <strong className="text-slate-300">Terms & Conditions:</strong> {quote.terms}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Payments */}
        {currentTab === 'payments' && (
          <div className="space-y-6">
            {customer.payments.length === 0 ? (
              <EmptyState
                title="No Payments Recorded"
                description="No payment transactions have been processed yet."
              />
            ) : (
              <div className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="pb-3 font-medium">Payment #</th>
                      <th className="pb-3 font-medium">Invoice #</th>
                      <th className="pb-3 font-medium">Date</th>
                      <th className="pb-3 font-medium">Method</th>
                      <th className="pb-3 font-medium text-right">Amount</th>
                      <th className="pb-3 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {customer.payments.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-800/30">
                        <td className="py-3 font-mono text-indigo-400">{p.paymentNumber}</td>
                        <td className="py-3 font-mono text-slate-300">{p.invoice.invoiceNumber}</td>
                        <td className="py-3 text-slate-400">{formatDateTime(p.paidAt || p.createdAt)}</td>
                        <td className="py-3 text-slate-300 font-mono text-[11px]">{p.paymentMethod}</td>
                        <td className="py-3 text-right font-semibold text-emerald-400">
                          {formatCurrency(Number(p.amount), p.currency)}
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
          </div>
        )}

        {/* Tab 6: Account Profile */}
        {currentTab === 'profile' && (
          <div className="max-w-2xl">
            <section className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-4">
              <h2 className="text-sm font-semibold text-white mb-2">Company & Billing Profile</h2>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400">Contact Name</span>
                  <p className="font-medium text-white mt-1">{customer.contactName}</p>
                </div>
                <div>
                  <span className="text-slate-400">Company Name</span>
                  <p className="font-medium text-white mt-1">{customer.companyName || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Email Address</span>
                  <p className="font-mono text-slate-300 mt-1">{customer.email}</p>
                </div>
                <div>
                  <span className="text-slate-400">Phone</span>
                  <p className="text-slate-300 mt-1">{customer.phone || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-slate-400">Billing Currency</span>
                  <p className="font-mono text-slate-200 mt-1">{customer.currency}</p>
                </div>
                <div>
                  <span className="text-slate-400">Tax Exemption</span>
                  <p className="text-slate-200 mt-1">{customer.taxExempt ? 'Tax Exempt' : 'Standard Taxation'}</p>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
