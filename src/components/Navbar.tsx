'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  BarChart3,
  Users,
  ShieldCheck,
  FileText,
  CreditCard,
  LogOut,
  Menu,
  X,
  ExternalLink,
} from 'lucide-react';
import { StatusBadge } from '@/components/Badge';

export interface NavbarUser {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'STAFF' | 'CUSTOMER';
  customer?: {
    id: string;
    customerNumber: string;
    companyName: string | null;
  } | null;
}

interface NavLinkItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
}

interface NavbarProps {
  user?: NavbarUser | null;
}

export function Navbar({ user }: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { credentials: 'include' });
    } catch {
      // Ignore network errors on logout
    } finally {
      setIsLoggingOut(false);
      router.push('/login');
      router.refresh();
    }
  };

  const getNavLinks = (): NavLinkItem[] => {
    if (!user) {
      return [
        { label: 'Home', href: '/' },
        { label: 'Sign In', href: '/login' },
        { label: 'Register', href: '/register' },
      ];
    }

    if (user.role === 'CUSTOMER') {
      return [
        { label: 'My Portal', href: '/portal', icon: <LayoutDashboard className="w-4 h-4" /> },
        { label: 'Subscriptions', href: '/portal?tab=subscriptions', icon: <CreditCard className="w-4 h-4" /> },
        { label: 'Invoices', href: '/portal?tab=invoices', icon: <FileText className="w-4 h-4" /> },
        { label: 'Quotations', href: '/portal?tab=quotations', icon: <FileText className="w-4 h-4" /> },
        { label: 'Payments', href: '/portal?tab=payments', icon: <CreditCard className="w-4 h-4" /> },
      ];
    }

    // ADMIN or STAFF
    const links: NavLinkItem[] = [
      { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
      { label: 'Reports', href: '/dashboard/reports', icon: <BarChart3 className="w-4 h-4" /> },
      { label: 'Customers', href: '/dashboard/customers', icon: <Users className="w-4 h-4" /> },
      { label: 'Customer Portal', href: '/portal', icon: <ExternalLink className="w-4 h-4" /> },
    ];

    if (user.role === 'ADMIN') {
      links.push({
        label: 'Audit Logs',
        href: '/dashboard/audit-logs',
        icon: <ShieldCheck className="w-4 h-4" />,
      });
    }

    return links;
  };

  const navLinks = getNavLinks();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Brand Logo */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-bold text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
                B
              </div>
              <div>
                <span className="font-bold text-base text-white tracking-tight">Brightloop</span>
                <span className="hidden sm:inline-block ml-1.5 text-xs text-slate-400 font-normal">
                  {user?.role === 'CUSTOMER' ? 'Customer Portal' : 'Subscription Hub'}
                </span>
              </div>
            </Link>

            {/* Desktop Navigation Links */}
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => {
                const isCurrent = pathname === link.href;
                return (
                  <Link
                    key={link.label}
                    href={link.href}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      isCurrent
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                    }`}
                  >
                    {link.icon && link.icon}
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Action Area */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-xs font-semibold text-white flex items-center justify-end gap-1.5">
                    <span>{user.name}</span>
                    <StatusBadge status={user.role} />
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {user.customer?.companyName || user.email}
                  </div>
                </div>

                <button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900 hover:bg-rose-950/40 hover:border-rose-900/60 hover:text-rose-300 text-slate-400 text-xs font-medium transition disabled:opacity-50"
                  title="Sign out of Brightloop"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-900 transition"
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 transition"
                >
                  Create Account
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Menu Hamburger Button */}
          <div className="flex md:hidden items-center gap-2">
            {user && (
              <StatusBadge status={user.role} />
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-slate-800 bg-slate-950 px-4 pt-2 pb-4 space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-900 hover:text-white"
            >
              {link.icon && link.icon}
              <span>{link.label}</span>
            </Link>
          ))}

          {user ? (
            <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-white">{user.name}</p>
                <p className="text-[11px] text-slate-400">{user.email}</p>
              </div>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-medium"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <div className="pt-3 mt-3 border-t border-slate-800 grid grid-cols-2 gap-2">
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="text-center py-2 rounded-lg bg-slate-900 text-xs font-medium text-slate-300 border border-slate-800"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                onClick={() => setMobileMenuOpen(false)}
                className="text-center py-2 rounded-lg bg-indigo-600 text-xs font-semibold text-white"
              >
                Register
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
