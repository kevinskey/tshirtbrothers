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
      className="fixed bottom-4 right-4 z-50 w-64 max-w-[calc(100vw-2rem)]"
      style={{ animation: 'fadeIn 0.3s ease-out' }}
    >
      <div
        className="relative bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-1.5 right-1.5 p-0.5 text-gray-400 hover:text-gray-600 z-10"
          aria-label="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {/* Orange header */}
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-3 py-2.5 text-center text-white">
          <p className="text-lg mb-0.5">{promo.emoji}</p>
          <h3 className="text-sm font-bold leading-tight">{promo.headline}</h3>
          {promo.subtext && <p className="text-orange-100 text-[10px] mt-0.5">{promo.subtext}</p>}
        </div>

        {/* Content */}
        <div className="px-3 py-3 text-center">
          {/* Discount badge */}
          <div className="inline-block bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5 mb-2">
            <p className="text-sm font-black text-orange-600">{promo.discount}</p>
          </div>

          {/* Promo code */}
          {promo.code && (
            <div className="mb-2">
              <p className="text-[10px] text-gray-500 mb-0.5">Code:</p>
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1 bg-gray-100 hover:bg-gray-200 border border-dashed border-gray-300 rounded px-2 py-1 transition"
              >
                <span className="font-mono font-bold text-xs text-gray-900 tracking-wide">{promo.code}</span>
                {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-gray-400" />}
              </button>
              {copied && <p className="text-[10px] text-green-600 mt-0.5">Copied!</p>}
            </div>
          )}

          {/* Urgency */}
          {promo.urgency && (
            <p className="text-[10px] text-red-600 font-semibold mb-2">⏰ {promo.urgency}</p>
          )}

          {/* CTA button */}
          <a
            href="/quote"
            className="block w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-1.5 rounded-lg text-xs transition"
          >
            {promo.cta || 'Get Quote'}
          </a>

          <button
            onClick={handleDismiss}
            className="mt-1.5 text-[10px] text-gray-400 hover:text-gray-600"
          >
            No thanks
          </button>
        </div>
      </div>
    </div>
  );
}
