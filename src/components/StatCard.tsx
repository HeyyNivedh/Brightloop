import React from 'react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    value: string;
    isPositive?: boolean;
  };
  className?: string;
}

export function StatCard({ title, value, subtitle, icon, trend, className }: StatCardProps) {
  return (
    <div
      className={cn(
        'p-5 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-sm relative overflow-hidden transition-all hover:border-slate-700/80',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{title}</p>
        {icon && (
          <div className="w-9 h-9 rounded-xl bg-slate-800/80 flex items-center justify-center text-slate-300">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-3">
        <div className="text-2xl font-bold tracking-tight text-white">{value}</div>
        {(subtitle || trend) && (
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
            {trend && (
              <span
                className={cn(
                  'font-medium',
                  trend.isPositive ? 'text-emerald-400' : 'text-rose-400'
                )}
              >
                {trend.value}
              </span>
            )}
            {subtitle && <span>{subtitle}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

