import { useEffect, useState } from 'react';
import { api, type AIBudget } from '@/lib/api';

export default function AIBudgetBadge() {
  const [budget, setBudget] = useState<AIBudget | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const b = await api.getBudget();
        if (!cancelled) setBudget(b);
      } catch { /* noop */ }
    }
    load();
    const id = setInterval(load, 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (!budget) return null;

  const pct = budget.limit > 0 ? budget.used / budget.limit : 0;
  const color =
    pct >= 1 ? 'text-red-700 bg-red-50 border-red-200' :
    pct > 0.8 ? 'text-amber-700 bg-amber-50 border-amber-200' :
    'text-meadow-600 bg-meadow-50 border-meadow-200';

  return (
    <div
      className={`hidden md:inline-flex items-center gap-1.5 text-[11px] border rounded-full px-2.5 py-1 ${color}`}
      title={`AI calls used today: ${budget.used} of ${budget.limit}`}
    >
      <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
        <path d="M6 1 L7.2 4.2 L10.5 4.5 L8 6.7 L8.8 10 L6 8.3 L3.2 10 L4 6.7 L1.5 4.5 L4.8 4.2 Z" />
      </svg>
      <span>
        {budget.remaining}/{budget.limit}
      </span>
    </div>
  );
}
