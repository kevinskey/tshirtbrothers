import { useEffect, useState } from 'react';
import { Loader2, Send, Sparkles, X, Check } from 'lucide-react';

type Filter = 'all' | 'recent_quoted' | 'past_invoiced' | 'new_30';

interface CampaignRow {
  id: number;
  subject: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  status: string;
  created_at: string;
  sent_at: string | null;
}

interface ArtLibraryItem {
  id: number;
  name: string;
  thumbnail_url: string;
  image_url: string;
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem('tsb_token') || ''}` };
}

const FILTER_LABELS: Record<Filter, string> = {
  all: 'All customers',
  recent_quoted: 'Quoted in last 90 days',
  past_invoiced: 'Past customers (have invoice)',
  new_30: 'New (joined last 30 days)',
};

export default function CampaignsAdmin() {
  const [prompt, setPrompt] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [examples, setExamples] = useState<ArtLibraryItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [library, setLibrary] = useState<ArtLibraryItem[]>([]);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [sample, setSample] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<CampaignRow[]>([]);

  // Load campaign history + art library on mount.
  useEffect(() => {
    fetch('/api/admin/campaigns', { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : [])
      .then(setHistory)
      .catch(() => {});
    fetch('/api/admin/designs-library', { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : [])
      .then(setLibrary)
      .catch(() => {});
  }, []);

  // Refresh recipient preview whenever the filter changes.
  useEffect(() => {
    fetch('/api/admin/campaigns/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ filter }),
    })
      .then((r) => r.ok ? r.json() : { count: 0, sample: [] })
      .then((d) => { setRecipientCount(d.count); setSample(d.sample || []); })
      .catch(() => { setRecipientCount(null); });
  }, [filter]);

  async function handleDraft() {
    if (!prompt.trim()) return;
    setDrafting(true);
    try {
      const res = await fetch('/api/deepseek/draft-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) {
        alert('Draft failed');
        return;
      }
      const data = await res.json();
      setSubject(data.subject || '');
      setBodyHtml(data.body_html || '');
    } finally {
      setDrafting(false);
    }
  }

  async function handleSend() {
    if (!subject.trim() || !bodyHtml.trim()) {
      alert('Subject and body are required');
      return;
    }
    if (!recipientCount) {
      alert('No recipients match this filter');
      return;
    }
    if (!confirm(`Send to ${recipientCount} recipients? This cannot be undone.`)) return;
    setSending(true);
    try {
      const res = await fetch('/api/admin/campaigns/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          subject,
          body_html: bodyHtml,
          example_image_urls: examples.map((e) => e.image_url),
          filter,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error || 'Send failed');
        return;
      }
      const data = await res.json();
      alert(`Campaign queued — sending to ${data.recipient_count} recipients in the background.`);
      setSubject('');
      setBodyHtml('');
      setPrompt('');
      setExamples([]);
      // Refresh history.
      const list = await fetch('/api/admin/campaigns', { headers: authHeaders() })
        .then((r) => r.ok ? r.json() : []);
      setHistory(list);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="pt-6 space-y-6 max-w-5xl">
      <div>
        <h2 className="text-lg md:text-xl font-display font-bold text-gray-900">Email Blasts</h2>
        <p className="text-sm text-gray-500 mt-1">Draft a marketing email with AI, attach examples from the Art Library, and send to a customer segment.</p>
      </div>

      {/* Step 1: AI draft */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 text-sm">1. What's the email about?</h3>
          <span className="text-xs text-gray-500">DeepSeek will draft it for you</span>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Mother's Day is in 3 days — there's still time to order custom shirts. Same-day pickup in Tyrone."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-red-500"
          style={{ fontSize: '16px' }}
        />
        <button
          onClick={handleDraft}
          disabled={drafting || !prompt.trim()}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {drafting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {drafting ? 'Drafting…' : 'Draft with AI'}
        </button>
      </div>

      {/* Step 2: edit */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h3 className="font-semibold text-gray-900 text-sm">2. Edit the email</h3>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Subject line</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            style={{ fontSize: '16px' }}
            placeholder="e.g. Last chance for Mother's Day shirts"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Body (HTML allowed)</label>
          <textarea
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm min-h-[160px] font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
            style={{ fontSize: '14px' }}
            placeholder="<p>Hi there,</p><p>...</p>"
          />
        </div>
      </div>

      {/* Step 3: examples */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 text-sm">3. Add example designs ({examples.length}/6)</h3>
          <button
            onClick={() => setPickerOpen(true)}
            className="text-xs font-medium text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg"
          >
            Pick from Art Library
          </button>
        </div>
        {examples.length === 0 ? (
          <p className="text-xs text-gray-400">Optional. Up to 6 thumbnails will appear in the email body.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {examples.map((e) => (
              <div key={e.id} className="relative w-20 h-20 bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                <img src={e.thumbnail_url || e.image_url} alt={e.name} className="w-full h-full object-contain" />
                <button
                  onClick={() => setExamples(examples.filter((x) => x.id !== e.id))}
                  className="absolute top-0 right-0 bg-black/60 text-white rounded-bl px-1"
                  title="Remove"
                ><X className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Step 4: recipients */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h3 className="font-semibold text-gray-900 text-sm">4. Who gets it?</h3>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                filter === f ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
        <div className="text-sm text-gray-700">
          {recipientCount === null ? (
            <Loader2 className="w-4 h-4 animate-spin inline" />
          ) : (
            <>
              <strong>{recipientCount}</strong> recipient{recipientCount === 1 ? '' : 's'}
              {sample.length > 0 && (
                <span className="text-xs text-gray-500 ml-2">e.g. {sample.slice(0, 3).join(', ')}{recipientCount > 3 ? '…' : ''}</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Send */}
      <div className="flex justify-end">
        <button
          onClick={handleSend}
          disabled={sending || !subject || !bodyHtml || !recipientCount}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {sending ? 'Sending…' : `Send to ${recipientCount ?? 0}`}
        </button>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 text-sm">Recent campaigns</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500 text-xs">
                <th className="px-3 py-2 font-medium">Subject</th>
                <th className="px-3 py-2 font-medium text-right">Sent / Failed</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {history.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2"><div className="max-w-[400px] truncate">{c.subject}</div></td>
                  <td className="px-3 py-2 text-right text-xs">
                    <span className="text-green-700">{c.sent_count}</span>
                    {c.failed_count > 0 && <span className="text-red-600 ml-1">/ {c.failed_count} failed</span>}
                    <span className="text-gray-400 ml-1">of {c.recipient_count}</span>
                  </td>
                  <td className="px-3 py-2 text-xs capitalize">{c.status}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{new Date(c.sent_at || c.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Art Library picker modal */}
      {pickerOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setPickerOpen(false)}>
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Pick designs ({examples.length}/6)</h3>
              <button onClick={() => setPickerOpen(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-4 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {library.length === 0 ? (
                <div className="col-span-full text-center py-12 text-gray-400 text-sm">Art Library is empty. Send a quote graphic to the Art Library first.</div>
              ) : library.map((d) => {
                const picked = examples.some((e) => e.id === d.id);
                return (
                  <button
                    key={d.id}
                    onClick={() => {
                      if (picked) {
                        setExamples(examples.filter((e) => e.id !== d.id));
                      } else if (examples.length < 6) {
                        setExamples([...examples, d]);
                      }
                    }}
                    className={`relative aspect-square bg-gray-50 border-2 rounded-lg overflow-hidden ${picked ? 'border-red-500' : 'border-gray-200 hover:border-gray-300'}`}
                    title={d.name}
                  >
                    <img src={d.thumbnail_url || d.image_url} alt={d.name} className="w-full h-full object-contain" />
                    {picked && <span className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center"><Check className="w-3 h-3" /></span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
