import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Calendar, Gift as GiftIcon, Tag } from 'lucide-react';
import { fetchConfig } from '../lib/api';
import { useCgcPath } from '../lib/base';

// "Who are we celebrating?" — Recipient / Occasion / Budget selectors.
// Options come from /api/cgc/config (curated merchandising metadata);
// Find a Gift lands on /shop with the picks applied.
export default function GiftFinder() {
  const p = useCgcPath();
  const navigate = useNavigate();
  const { data: config } = useQuery({ queryKey: ['cgc-config'], queryFn: fetchConfig });
  const [recipient, setRecipient] = useState('');
  const [occasion, setOccasion] = useState('');
  const [budget, setBudget] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const qs = new URLSearchParams();
    if (recipient) qs.set('recipient', recipient);
    if (occasion) qs.set('occasion', occasion);
    if (budget) qs.set('budget', budget);
    navigate(`${p('/shop')}${qs.toString() ? `?${qs}` : ''}`);
  };

  const selectClass =
    'w-full appearance-none rounded-full border border-cgc-cream-deep bg-white pl-11 pr-9 py-3 text-sm font-medium text-cgc-ink focus:outline-none focus:ring-2 focus:ring-cgc-orange';

  const Field = ({
    id, icon, label, value, onChange, options,
  }: {
    id: string;
    icon: React.ReactNode;
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: { key: string; label: string }[];
  }) => (
    <div className="relative flex-1 min-w-0">
      <label htmlFor={id} className="sr-only">{label}</label>
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-cgc-charcoal pointer-events-none" aria-hidden>
        {icon}
      </span>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        <option value="">{label}</option>
        {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>
      <svg className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-cgc-charcoal pointer-events-none" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );

  return (
    <section className="bg-white py-8 sm:py-10" aria-labelledby="gift-finder-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <form onSubmit={submit} className="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-6">
          <h2 id="gift-finder-heading" className="text-xl sm:text-2xl font-bold text-cgc-ink whitespace-nowrap">
            Who are we celebrating?
          </h2>
          <div className="flex flex-col sm:flex-row flex-1 gap-3">
            <Field id="gf-recipient" icon={<GiftIcon className="h-4 w-4" />} label="Recipient"
              value={recipient} onChange={setRecipient} options={config?.recipients ?? []} />
            <Field id="gf-occasion" icon={<Calendar className="h-4 w-4" />} label="Occasion"
              value={occasion} onChange={setOccasion} options={config?.occasions ?? []} />
            <Field id="gf-budget" icon={<Tag className="h-4 w-4" />} label="Budget"
              value={budget} onChange={setBudget} options={config?.budgets ?? []} />
          </div>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-cgc-orange hover:bg-cgc-orange-dark text-white font-bold px-8 py-3 text-sm transition-colors"
          >
            Find a Gift <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        </form>
      </div>
    </section>
  );
}
