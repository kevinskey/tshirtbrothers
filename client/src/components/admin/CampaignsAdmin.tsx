import { useEffect, useRef, useState } from 'react';
import { Loader2, Send, Sparkles, X, Check, Mail, MousePointerClick, UserMinus, Eye, Upload } from 'lucide-react';

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
  open_count: number;
  click_count: number;
  unsub_count: number;
}

interface Overview {
  campaigns_sent: number;
  total_sent: number;
  total_failed: number;
  unique_opens: number;
  unique_clicks: number;
  total_unsubscribed: number;
}

interface UnsubscribeRow {
  email: string;
  unsubscribed_at: string;
  source_campaign_id: number | null;
  campaign_subject: string | null;
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
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [history, setHistory] = useState<CampaignRow[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [unsubs, setUnsubs] = useState<UnsubscribeRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load art library once on mount.
  useEffect(() => {
    fetch('/api/admin/designs-library', { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : [])
      .then(setLibrary)
      .catch(() => {});
  }, []);

  // Poll campaign history + overview + unsubscribes. Refresh fast while any
  // campaign is still sending (the worker runs in the background and
  // updates sent_count/failed_count + opens/clicks live); slow once
  // everything is settled.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [hRes, oRes, uRes] = await Promise.all([
          fetch('/api/admin/campaigns', { headers: authHeaders() }),
          fetch('/api/admin/campaigns/overview', { headers: authHeaders() }),
          fetch('/api/admin/campaigns/unsubscribes', { headers: authHeaders() }),
        ]);
        if (cancelled) return;
        if (hRes.ok) setHistory(await hRes.json());
        if (oRes.ok) setOverview(await oRes.json());
        if (uRes.ok) setUnsubs(await uRes.json());
      } catch {
        // ignore — next tick will try again
      }
    }
    load();
    const anySending = history.some((c) => c.status === 'sending');
    const intervalMs = anySending ? 3000 : 30000;
    const id = setInterval(load, intervalMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [history.some((c) => c.status === 'sending')]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function handleUpload(file: File) {
    if (examples.length >= 6) {
      alert('You can attach up to 6 example designs.');
      return;
    }
    const isHeic = /\.(heic|heif)$/i.test(file.name) || /heic|heif/i.test(file.type);
    if (!isHeic && !file.type.startsWith('image/')) {
      alert('Only image files are supported.');
      return;
    }
    setUploading(true);
    try {
      // HEIC (iPhone default) doesn't render in Gmail/Outlook/most clients —
      // convert to JPEG in the browser before upload so recipients can see it.
      let blob: Blob = file;
      let outName = file.name;
      if (isHeic) {
        const { default: heic2any } = await import('heic2any');
        const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.85 });
        const first = Array.isArray(result) ? result[0] : result;
        if (!first) throw new Error('HEIC conversion produced no output');
        blob = first;
        outName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
      }
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      const res = await fetch('/api/admin/campaigns/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ imageBase64: base64, filename: outName }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error || 'Upload failed');
        return;
      }
      const { url } = await res.json();
      setExamples([
        ...examples,
        { id: -Date.now(), name: outName, thumbnail_url: url, image_url: url },
      ]);
    } catch (err) {
      console.error('[campaign upload]', err);
      alert(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleTestSend() {
    if (!subject.trim() || !bodyHtml.trim()) {
      alert('Subject and body are required');
      return;
    }
    if (!testEmail.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(testEmail)) {
      alert('Enter a valid email');
      return;
    }
    setSendingTest(true);
    try {
      const res = await fetch('/api/admin/campaigns/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          subject,
          body_html: bodyHtml,
          example_image_urls: examples.map((e) => e.image_url),
          test_email: testEmail.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(body.error || 'Test send failed');
        return;
      }
      alert(`Test email queued — check ${testEmail.trim()} in a moment.`);
    } finally {
      setSendingTest(false);
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

  const openRate = overview && overview.total_sent > 0 ? (overview.unique_opens / overview.total_sent) * 100 : 0;
  const clickRate = overview && overview.total_sent > 0 ? (overview.unique_clicks / overview.total_sent) * 100 : 0;
  const unsubRate = overview && overview.total_sent > 0 ? (overview.total_unsubscribed / overview.total_sent) * 100 : 0;

  return (
    <div className="pt-6 space-y-6 max-w-5xl">
      <div>
        <h2 className="text-lg md:text-xl font-display font-bold text-gray-900">Email & Marketing</h2>
        <p className="text-sm text-gray-500 mt-1">Draft a marketing email with AI, attach examples from the Art Library, and send to a customer segment. Live performance metrics below.</p>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium"><Mail className="w-3.5 h-3.5" /> Sent</div>
          <p className="text-2xl font-bold text-gray-900 mt-1">{overview?.total_sent ?? '—'}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{overview?.campaigns_sent ?? 0} campaign{overview?.campaigns_sent === 1 ? '' : 's'}{overview && overview.total_failed > 0 ? ` · ${overview.total_failed} failed` : ''}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium"><Eye className="w-3.5 h-3.5" /> Opens</div>
          <p className="text-2xl font-bold text-gray-900 mt-1">{overview?.unique_opens ?? '—'}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{overview ? `${openRate.toFixed(1)}% open rate` : ''}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium"><MousePointerClick className="w-3.5 h-3.5" /> Clicks</div>
          <p className="text-2xl font-bold text-gray-900 mt-1">{overview?.unique_clicks ?? '—'}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{overview ? `${clickRate.toFixed(1)}% click rate` : ''}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium"><UserMinus className="w-3.5 h-3.5" /> Unsubscribed</div>
          <p className="text-2xl font-bold text-gray-900 mt-1">{overview?.total_unsubscribed ?? '—'}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{overview ? `${unsubRate.toFixed(2)}% of sent` : ''}</p>
        </div>
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
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-semibold text-gray-900 text-sm">3. Add example designs ({examples.length}/6)</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || examples.length >= 6}
              className="flex items-center gap-1 text-xs font-medium text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploading ? 'Uploading…' : 'Upload file'}
            </button>
            <button
              onClick={() => setPickerOpen(true)}
              className="text-xs font-medium text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg"
            >
              Pick from Art Library
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.heic,.heif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = '';
              }}
            />
          </div>
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

      {/* Send a test to a single email */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <h3 className="font-semibold text-gray-900 text-sm">Send a test first (optional)</h3>
        <p className="text-xs text-gray-500">Send the campaign to a single address to preview rendering and verify tracking. Counts as its own campaign in the dashboard.</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="you@example.com"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            style={{ fontSize: '16px' }}
          />
          <button
            onClick={handleTestSend}
            disabled={sendingTest || !subject || !bodyHtml || !testEmail.trim()}
            className="flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50 whitespace-nowrap"
          >
            {sendingTest ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sendingTest ? 'Sending…' : 'Send test'}
          </button>
        </div>
      </div>

      {/* Send to the full filter */}
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
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 text-sm">Recent campaigns</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500 text-xs">
                <th className="px-3 py-2 font-medium">Subject</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Sent</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Opens</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Clicks</th>
                <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Unsubs</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Status</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {history.map((c) => {
                const oRate = c.sent_count > 0 ? (c.open_count / c.sent_count) * 100 : 0;
                const cRate = c.sent_count > 0 ? (c.click_count / c.sent_count) * 100 : 0;
                return (
                  <tr key={c.id}>
                    <td className="px-3 py-2"><div className="max-w-[320px] truncate" title={c.subject}>{c.subject}</div></td>
                    <td className="px-3 py-2 text-right text-xs whitespace-nowrap">
                      <span className="text-green-700 font-medium">{c.sent_count}</span>
                      {c.failed_count > 0 && <span className="text-red-600 ml-1">/{c.failed_count}f</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-xs whitespace-nowrap">
                      <span className="font-medium">{c.open_count}</span>
                      <span className="text-gray-400 ml-1">{oRate.toFixed(0)}%</span>
                    </td>
                    <td className="px-3 py-2 text-right text-xs whitespace-nowrap">
                      <span className="font-medium">{c.click_count}</span>
                      <span className="text-gray-400 ml-1">{cRate.toFixed(0)}%</span>
                    </td>
                    <td className="px-3 py-2 text-right text-xs whitespace-nowrap">
                      <span className={c.unsub_count > 0 ? 'text-orange-600 font-medium' : 'text-gray-400'}>{c.unsub_count}</span>
                    </td>
                    <td className="px-3 py-2 text-xs capitalize whitespace-nowrap">
                      {c.status === 'sending' ? <span className="text-blue-600 inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Sending</span> : c.status}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{new Date(c.sent_at || c.created_at).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent unsubscribes */}
      {unsubs.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900 text-sm">Recent unsubscribes</h3>
            <p className="text-xs text-gray-500 mt-0.5">These addresses are excluded from all future campaigns automatically.</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500 text-xs">
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Source campaign</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {unsubs.map((u) => (
                <tr key={u.email}>
                  <td className="px-3 py-2"><div className="max-w-[260px] truncate">{u.email}</div></td>
                  <td className="px-3 py-2 text-xs text-gray-600"><div className="max-w-[320px] truncate" title={u.campaign_subject || ''}>{u.campaign_subject || <span className="text-gray-400">—</span>}</div></td>
                  <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{new Date(u.unsubscribed_at).toLocaleString()}</td>
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
