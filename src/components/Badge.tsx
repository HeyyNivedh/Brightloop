import React from 'react';
import { cn } from '@/lib/utils';

export type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'purple';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  danger: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  info: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  neutral: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
};

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string | undefined | null }) {
  if (!status) return <Badge variant="neutral">UNKNOWN</Badge>;

  const s = status.toUpperCase();
  switch (s) {
    case 'ACTIVE':
    case 'PAID':
    case 'SUCCEEDED':
    case 'ACCEPTED':
      return <Badge variant="success">{s}</Badge>;

    case 'TRIALING':
    case 'SENT':
      return <Badge variant="info">{s}</Badge>;

    case 'OPEN':
    case 'PENDING':
    case 'PAUSED':
      return <Badge variant="warning">{s}</Badge>;

    case 'PAST_DUE':
    case 'CANCELLED':
    case 'EXPIRED':
    case 'FAILED':
    case 'REFUNDED':
    case 'VOID':
    case 'UNCOLLECTIBLE':
    case 'REJECTED':
    case 'SUSPENDED':
      return <Badge variant="danger">{s}</Badge>;

    case 'DRAFT':
    case 'INACTIVE':
    case 'ARCHIVED':
      return <Badge variant="neutral">{s}</Badge>;

    case 'ADMIN':
      return <Badge variant="danger">ADMIN</Badge>;
    case 'STAFF':
      return <Badge variant="info">STAFF</Badge>;
    case 'CUSTOMER':
      return <Badge variant="success">CUSTOMER</Badge>;

    default:
      return <Badge variant="neutral">{s}</Badge>;
  }
}

