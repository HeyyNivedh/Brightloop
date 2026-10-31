import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUserSession } from '@/lib/auth/server-session';
import { prisma } from '@/lib/db';
import { Navbar } from '@/components/Navbar';
import { StatusBadge } from '@/components/Badge';
import { formatDateTime } from '@/lib/utils';
import { ArrowLeft } from 'lucide-react';

export const instant = false;

export default async function AuditLogsPage() {
  const { session, user } = await getCurrentUserSession();

  if (!session || !user) {
    redirect('/login');
  }

  if (user.role !== 'ADMIN') {
    redirect('/dashboard');
  }

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
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
                <h1 className="text-2xl font-bold tracking-tight text-white">System Audit Trail</h1>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  ADMIN ONLY
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Immutable security and transaction log tracking all modifications across the platform.
              </p>
            </div>
          </div>
        </div>

        <section className="p-6 rounded-2xl bg-slate-900/70 border border-slate-800">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="pb-3 font-medium">Timestamp</th>
                  <th className="pb-3 font-medium">Action</th>
                  <th className="pb-3 font-medium">Target Entity</th>
                  <th className="pb-3 font-medium">Actor</th>
                  <th className="pb-3 font-medium text-right">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/30">
                    <td className="py-3 text-slate-400 font-mono text-[11px]">
                      {formatDateTime(log.createdAt)}
                    </td>
                    <td className="py-3">
                      <span className="font-mono text-indigo-400 font-medium px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 text-slate-200">
                      <span className="font-medium text-white">{log.entityType}</span>
                      <span className="text-slate-500 font-mono text-[11px] ml-1.5">
                        #{log.entityId}
                      </span>
                    </td>
                    <td className="py-3 text-slate-300">
                      {log.user ? log.user.name : 'System Worker'}
                    </td>
                    <td className="py-3 text-right">
                      {log.user ? (
                        <StatusBadge status={log.user.role} />
                      ) : (
                        <span className="text-[10px] text-slate-500 font-mono">SYSTEM</span>
                      )}
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
