import { useState, useEffect } from 'react';
import { Loader2, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';

interface Promo {
  id: number;
  code: string;
  holiday: string | null;
  headline: string | null;
  subtext: string | null;
  discount_type: string;
  discount_value: number;
  max_uses: number | null;
  times_used: number;
  active: boolean;
  ai_generated: boolean;
  expires_at: string | null;
  created_at: string;
}

function getToken() {
  return localStorage.getItem('tsb_token') || '';
}

export default function PromoManager() {
  const [promos, setPromos] = useState<Promo[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchPromos() {
    setLoading(true);
    try {
      const res = await fetch('/api/deepseek/promotions', { headers: { Authorization: `Bearer ${getToken()}` } });
      if (res.ok) setPromos(await res.json());
    } catch {} finally { setLoading(false); }
  }

  useEffect(() => { fetchPromos(); }, []);

  async function toggleActive(id: number, active: boolean) {
    await fetch(`/api/deepseek/promotions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ active }),
    });
    fetchPromos();
  }

  async function deletePromo(id: number) {
    if (!confirm('Delete this promo?')) return;
    await fetch(`/api/deepseek/promotions/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    fetchPromos();
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-4">
      {promos.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-400">No promotions yet. The AI will create one automatically on the next homepage visit.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {promos.map(p => {
            const expired = p.expires_at && new Date(p.expires_at) < new Date();
            const discountLabel = p.discount_type === 'percent' ? `${p.discount_value}% OFF`
              : p.discount_type === 'fixed' ? `$${p.discount_value} OFF`
              : p.discount_type === 'shipping' ? 'FREE SHIPPING' : p.discount_type;

            return (
              <div key={p.id} className={`bg-white rounded-xl border p-4 ${!p.active || expired ? 'border-gray-200 opacity-60' : 'border-orange-200'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-lg text-gray-900">{p.code}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.active && !expired ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {expired ? 'EXPIRED' : p.active ? 'ACTIVE' : 'DISABLED'}
                      </span>
                      {p.ai_generated && (
                        <span className="text-[10px] font-medium text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">AI Generated</span>
                      )}
                    </div>
                    {p.holiday && <p className="text-sm text-gray-600 mt-1">{p.holiday}</p>}
                    {p.headline && <p className="text-sm font-semibold text-gray-800">{p.headline}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xl font-black text-orange-600">{discountLabel}</p>
                    <p className="text-xs text-gray-500 mt-1">Used: <span className="font-bold">{p.times_used}</span>{p.max_uses ? `/${p.max_uses}` : ''} times</p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <div className="text-xs text-gray-400">
                    Created {new Date(p.created_at).toLocaleDateString()}
                    {p.expires_at && ` · Expires ${new Date(p.expires_at).toLocaleDateString()}`}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleActive(p.id, !p.active)}
                      className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
                      title={p.active ? 'Disable' : 'Enable'}
                    >
                      {p.active ? <ToggleRight className="w-5 h-5 text-green-500" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                      {p.active ? 'On' : 'Off'}
                    </button>
                    <button
                      onClick={() => deletePromo(p.id)}
                      className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
