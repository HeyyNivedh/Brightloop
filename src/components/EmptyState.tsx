import React from 'react';
import { cn } from '@/lib/utils';
import { FileQuestion } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30',
        className
      )}
    >
      <div className="w-12 h-12 rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-400 mb-3">
        {icon || <FileQuestion className="w-6 h-6" />}
      </div>
      <h3 className="text-base font-semibold text-slate-200">{title}</h3>
      <p className="text-sm text-slate-400 max-w-sm mt-1">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

