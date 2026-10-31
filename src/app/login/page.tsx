'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Lock, Mail, ArrowRight, AlertCircle } from 'lucide-react';
import { Navbar } from '@/components/Navbar';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        credentials: 'include',
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Invalid email or password');
      }

      // Check user role to redirect appropriately
      const role = data.data?.user?.role;
      if (role === 'CUSTOMER') {
        router.push('/portal');
      } else {
        router.push('/dashboard');
      }
      router.refresh();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar user={null} />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md">
          {/* Card Container */}
          <div className="p-8 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-2xl backdrop-blur-xl">
            <div className="text-center mb-8">
              <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 mx-auto flex items-center justify-center mb-3">
                <Lock className="w-6 h-6" />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Sign in to Brightloop</h1>
              <p className="text-xs text-slate-400 mt-1.5">
                Software Subscription & Billing Portal
              </p>
            </div>

            {error && (
              <div className="mb-6 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 transition"
              >
                {isLoading ? (
                  <span>Signing in...</span>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Quick Demo Logins */}
            <div className="mt-8 pt-6 border-t border-slate-800">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-center mb-3">
                Quick Demo Accounts
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickLogin('admin@brightloop.com', 'Admin123!@#')}
                  className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-rose-500/40 text-center transition group"
                >
                  <div className="text-[11px] font-semibold text-rose-400 group-hover:text-rose-300">Admin</div>
                  <div className="text-[9px] text-slate-500 truncate">admin@brightloop</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickLogin('staff@brightloop.com', 'Staff123!@#')}
                  className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-blue-500/40 text-center transition group"
                >
                  <div className="text-[11px] font-semibold text-blue-400 group-hover:text-blue-300">Staff</div>
                  <div className="text-[9px] text-slate-500 truncate">staff@brightloop</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleQuickLogin('customer@acme.com', 'Customer123!@#')}
                  className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500/40 text-center transition group"
                >
                  <div className="text-[11px] font-semibold text-emerald-400 group-hover:text-emerald-300">Customer</div>
                  <div className="text-[9px] text-slate-500 truncate">customer@acme</div>
                </button>
              </div>
            </div>

            <div className="mt-6 text-center text-xs text-slate-400">
              Need a new customer account?{' '}
              <Link href="/register" className="text-indigo-400 hover:text-indigo-300 font-medium">
                Register here
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
