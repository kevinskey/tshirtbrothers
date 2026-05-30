import { useState, useEffect } from 'react';
import { X, Copy, Check } from 'lucide-react';

interface Promo {
  holiday: string;
  days_until: number;
  headline: string;
  subtext: string;
  discount: string;
  code: string;
  emoji: string;
  urgency: string;
  cta: string;
}

export default function SalesPopup() {
  const [promo, setPromo] = useState<Promo | null>(null);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Don't show if dismissed recently (within 24 hours)
    const dismissed = localStorage.getItem('tsb_promo_dismissed');
    if (dismissed && Date.now() - parseInt(dismissed) < 24 * 60 * 60 * 1000) return;

    // Delay popup by 3 seconds so it doesn't hit immediately on load
    const timer = setTimeout(() => {
      fetch('/api/deepseek/holiday-promo')
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data && data.headline) {
            setPromo(data);
            setVisible(true);
          }
        })
        .catch(() => {});
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  function handleDismiss() {
    setVisible(false);
    localStorage.setItem('tsb_promo_dismissed', String(Date.now()));
  }

  function handleCopy() {
    if (promo?.code) {
      navigator.clipboard.writeText(promo.code).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (!visible || !promo) return null;

  return (
    <div
      className="fixed bottom-5 right-5 z-50 w-[340px] max-w-[calc(100vw-2rem)]"
      style={{ animation: 'tsbPromoSlideIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) both' }}
    >
      <style>{`
        @keyframes tsbPromoSlideIn {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div
        className="relative overflow-hidden rounded-2xl bg-white/95 backdrop-blur-md ring-1 ring-black/5"
        style={{ boxShadow: '0 20px 50px -12px rgba(249, 115, 22, 0.35), 0 8px 24px -8px rgba(0, 0, 0, 0.18)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Decorative orange glow blob in the top corner */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full opacity-30 blur-3xl"
          style={{ background: 'radial-gradient(circle, #f97316 0%, transparent 70%)' }}
        />

        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative px-5 pt-5 pb-5">
          {/* Holiday chip */}
          <div className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-orange-700 ring-1 ring-orange-200/60">
            <span className="text-sm leading-none">{promo.emoji}</span>
            <span>{promo.holiday || 'Limited time'}</span>
          </div>

          {/* Headline */}
          <h2 className="mt-3 font-display text-xl font-bold leading-tight text-gray-900">
            {promo.headline}
          </h2>
          {promo.subtext && (
            <p className="mt-1.5 text-sm leading-snug text-gray-600">{promo.subtext}</p>
          )}

          {/* Big discount */}
          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-display text-3xl font-black leading-none tracking-tight text-orange-600">
              {promo.discount}
            </span>
          </div>

          {/* Promo code as a copyable pill */}
          {promo.code && (
            <button
              onClick={handleCopy}
              className="group mt-4 flex w-full items-center justify-between gap-2 rounded-xl border border-dashed border-orange-300 bg-gradient-to-br from-orange-50 to-white px-3 py-2.5 text-left transition hover:border-orange-400 hover:from-orange-100"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-700/80">Promo code</p>
                <p className="font-mono text-base font-bold tracking-wide text-gray-900">{promo.code}</p>
              </div>
              <span
                className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition ${
                  copied ? 'bg-green-100 text-green-700' : 'bg-white text-gray-500 ring-1 ring-gray-200 group-hover:text-gray-700'
                }`}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </span>
            </button>
          )}

          {/* Urgency */}
          {promo.urgency && (
            <p className="mt-3 flex items-center gap-1 text-xs font-medium text-red-600">
              <span aria-hidden>⏰</span> {promo.urgency}
            </p>
          )}

          {/* CTA */}
          <a
            href="/quote"
            className="mt-4 block w-full rounded-xl bg-gradient-to-b from-orange-600 to-orange-700 px-4 py-3 text-center text-sm font-bold text-white shadow-sm transition hover:from-orange-700 hover:to-orange-800 hover:shadow-md active:scale-[0.99]"
          >
            {promo.cta || 'Get a Quote'}
          </a>

          <button
            onClick={handleDismiss}
            className="mt-2 block w-full text-center text-xs text-gray-600 hover:text-gray-800"
          >
            No thanks
          </button>
        </div>
      </div>
    </div>
  );
}
