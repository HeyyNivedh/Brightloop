import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUserSession } from '@/lib/auth/server-session';
import { prisma } from '@/lib/db';
import { Navbar } from '@/components/Navbar';
import { StatusBadge } from '@/components/Badge';
import { ArrowLeft, ExternalLink, Building } from 'lucide-react';

export const instant = false;

export default async function CustomersPage() {
  const { session, user } = await getCurrentUserSession();

  if (!session || !user) {
    redirect('/login');
  }

  if (user.role === 'CUSTOMER') {
    redirect('/portal');
  }

  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          subscriptions: true,
          invoices: true,
          payments: true,
          quotations: true,
        },
      },
    },
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar user={user} />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                <h1 className="text-2xl font-bold tracking-tight text-white">Customer Directory</h1>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  {customers.length} Profiles
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Accounts, subscriptions, billing histories, and customer self-service preview.
              </p>
            </div>
          </div>
        </div>

        <section className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-3 font-medium">Customer #</th>
                  <th className="pb-3 font-medium">Contact & Company</th>
                  <th className="pb-3 font-medium">Email</th>
                  <th className="pb-3 font-medium">Currency</th>
                  <th className="pb-3 font-medium text-center">Subscriptions</th>
                  <th className="pb-3 font-medium text-center">Invoices</th>
                  <th className="pb-3 font-medium text-right">Status</th>
                  <th className="pb-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/30">
                    <td className="py-3 font-mono text-indigo-400">{c.customerNumber}</td>
                    <td className="py-3">
                      <div className="font-semibold text-white">{c.contactName}</div>
                      {c.companyName && (
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Building className="w-3 h-3 text-slate-500" />
                          <span>{c.companyName}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 text-slate-300 font-mono text-[11px]">{c.email}</td>
                    <td className="py-3 font-mono text-slate-400">{c.currency}</td>
                    <td className="py-3 text-center">
                      <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 font-mono">
                        {c._count.subscriptions}
                      </span>
                    </td>
                    <td className="py-3 text-center">
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                        {c._count.invoices}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="py-3 text-right">
                      <Link
                        href={`/portal?customerId=${c.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium transition"
                      >
                        <span>Portal View</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
