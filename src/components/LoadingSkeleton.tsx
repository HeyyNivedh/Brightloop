import React from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-lg bg-slate-800/60', className)} />
  );
}

export function StatCardSkeleton() {
  return (
    <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800">
      <div className="flex justify-between items-center mb-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-8 rounded-xl" />
      </div>
      <Skeleton className="h-8 w-32 mb-2" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="w-full space-y-3">
      <div className="flex gap-4 p-4 border-b border-slate-800">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 p-4 items-center border-b border-slate-800/50">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

