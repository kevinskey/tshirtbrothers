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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={handleDismiss}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'fadeIn 0.3s ease-out' }}
      >
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 z-10"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Orange header */}
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-6 py-5 text-center text-white">
          <p className="text-3xl mb-1">{promo.emoji}</p>
          <h3 className="text-xl sm:text-2xl font-bold leading-tight">{promo.headline}</h3>
          <p className="text-orange-100 text-sm mt-1">{promo.subtext}</p>
        </div>

        {/* Content */}
        <div className="px-6 py-5 text-center">
          {/* Discount badge */}
          <div className="inline-block bg-orange-50 border-2 border-orange-200 rounded-xl px-6 py-3 mb-4">
            <p className="text-2xl font-black text-orange-600">{promo.discount}</p>
          </div>

          {/* Promo code */}
          {promo.code && (
            <div className="mb-4">
              <p className="text-xs text-gray-500 mb-1">Use code at checkout:</p>
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 border-2 border-dashed border-gray-300 rounded-lg px-5 py-2.5 transition"
              >
                <span className="font-mono font-bold text-lg text-gray-900 tracking-wider">{promo.code}</span>
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-400" />}
              </button>
              {copied && <p className="text-xs text-green-600 mt-1">Copied!</p>}
            </div>
          )}

          {/* Urgency */}
          {promo.urgency && (
            <p className="text-xs text-red-600 font-semibold mb-4">⏰ {promo.urgency}</p>
          )}

          {/* CTA button */}
          <a
            href="/quote"
            className="block w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl text-base transition shadow-lg shadow-orange-500/25"
          >
            {promo.cta || 'Get Your Quote'}
          </a>

          <button
            onClick={handleDismiss}
            className="mt-3 text-xs text-gray-400 hover:text-gray-600"
          >
            No thanks, maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
