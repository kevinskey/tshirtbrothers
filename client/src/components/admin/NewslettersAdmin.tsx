import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Loader2, Plus, Copy, Trash2, ChevronDown, ChevronRight, Mail, Send,
  Monitor, Smartphone, Save, ArrowLeft, LayoutTemplate, Search, X, Eye, EyeOff,
} from 'lucide-react';

/* ── Types ─────────────────────────────────────────────────────────────── */

type Filter = 'all' | 'recent_quoted' | 'past_invoiced' | 'new_30';
const FILTER_LABELS: Record<Filter, string> = {
  all: 'All customers',
  recent_quoted: 'Quoted in last 90 days',
  past_invoiced: 'Past customers (have invoice)',
  new_30: 'New (joined last 30 days)',
};

interface Block { id: string; type: string; enabled: boolean; data: Record<string, unknown> }
interface NewsletterRow {
  id: number; name: string; subject: string; status: string; is_template: boolean;
  updated_at: string; sent_count: number | null; recipient_count: number | null; sent_at: string | null;
}
interface Newsletter extends NewsletterRow { preheader: string; blocks: Block[] }

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem('tsb_token') || ''}` };
}
const jsonHeaders = () => ({ ...authHeaders(), 'Content-Type': 'application/json' });

/* ── Block editor schemas — the admin edits content, the server owns design ── */

type FieldKind = 'text' | 'textarea' | 'image' | 'url';
interface Field { key: string; label: string; kind: FieldKind; hint?: string }
interface ItemList { key: string; label: string; max: number; fields: Field[]; productPicker?: boolean }
interface BlockSchema { type: string; label: string; locked?: boolean; fields: Field[]; lists?: ItemList[] }

const SCHEMAS: BlockSchema[] = [
  { type: 'header', label: '1 · Header', locked: true, fields: [
    { key: 'logo_url', label: 'Logo', kind: 'image' },
    { key: 'company', label: 'Company name', kind: 'text' },
    { key: 'subtitle', label: 'Subtitle', kind: 'text' },
    { key: 'right_message', label: 'Right-side handwritten message', kind: 'textarea', hint: 'One thought per line' },
    { key: 'right_image_url', label: 'Right-side image (replaces message)', kind: 'image' },
  ] },
  { type: 'hero', label: '2 · Hero', fields: [
    { key: 'eyebrow', label: 'Eyebrow text', kind: 'text' },
    { key: 'headline', label: 'Main headline', kind: 'text' },
    { key: 'highlight', label: 'Highlighted headline', kind: 'text' },
    { key: 'body', label: 'Supporting paragraph', kind: 'textarea' },
    { key: 'image_url', label: 'Hero image', kind: 'image' },
    { key: 'image_alt', label: 'Hero image alt text', kind: 'text' },
    { key: 'cta_label', label: 'CTA label', kind: 'text' },
    { key: 'cta_url', label: 'CTA URL', kind: 'url' },
    { key: 'tagline', label: 'Small tagline', kind: 'text' },
    { key: 'side_note', label: 'Handwritten side note', kind: 'textarea' },
  ] },
  { type: 'events', label: "3 · What's Coming Up", fields: [
    { key: 'title', label: 'Section title', kind: 'text' },
    { key: 'intro', label: 'Intro (optional)', kind: 'textarea' },
    { key: 'cta_label', label: 'CTA label', kind: 'text' },
    { key: 'cta_url', label: 'CTA URL', kind: 'url' },
    { key: 'cta_note', label: 'Small note under CTA', kind: 'text' },
  ], lists: [{ key: 'items', label: 'Opportunities (1–6)', max: 6, fields: [
    { key: 'icon', label: 'Emoji icon', kind: 'text' },
    { key: 'image_url', label: 'Icon image (optional)', kind: 'image' },
    { key: 'title', label: 'Title', kind: 'text' },
    { key: 'description', label: 'Short description', kind: 'textarea' },
    { key: 'date', label: 'Date (optional)', kind: 'text' },
    { key: 'url', label: 'Link (optional)', kind: 'url' },
  ] }] },
  { type: 'products', label: '4 · Featured Products', fields: [
    { key: 'title', label: 'Section title', kind: 'text' },
  ], lists: [{ key: 'items', label: 'Products (up to 3)', max: 3, productPicker: true, fields: [
    { key: 'name', label: 'Product name', kind: 'text' },
    { key: 'description', label: 'Short description', kind: 'textarea' },
    { key: 'image_url', label: 'Product image', kind: 'image' },
    { key: 'price', label: 'Price text (optional)', kind: 'text', hint: 'e.g. "from $12.99"' },
    { key: 'cta_label', label: 'CTA label', kind: 'text' },
    { key: 'cta_url', label: 'CTA URL', kind: 'url' },
  ] }] },
  { type: 'didyouknow', label: '5 · Did You Know?', fields: [
    { key: 'title', label: 'Section title', kind: 'text' },
    { key: 'right_message', label: 'Handwritten right-side message', kind: 'textarea' },
    { key: 'cta_label', label: 'CTA label (optional)', kind: 'text' },
    { key: 'cta_url', label: 'CTA URL', kind: 'url' },
  ], lists: [{ key: 'items', label: 'Services (2–6)', max: 6, fields: [
    { key: 'icon', label: 'Emoji icon', kind: 'text' },
    { key: 'image_url', label: 'Icon image (optional)', kind: 'image' },
    { key: 'title', label: 'Title', kind: 'text' },
    { key: 'description', label: 'Description (optional)', kind: 'text' },
    { key: 'url', label: 'Link (optional)', kind: 'url' },
  ] }] },
  { type: 'special', label: '6 · Past Customer Special', fields: [
    { key: 'headline', label: 'Headline', kind: 'text' },
    { key: 'highlight', label: 'Highlighted word', kind: 'text' },
    { key: 'description', label: 'Description', kind: 'textarea' },
    { key: 'image_url', label: 'Promo image', kind: 'image' },
    { key: 'image_alt', label: 'Promo image alt text', kind: 'text' },
    { key: 'cta_label', label: 'CTA label', kind: 'text' },
    { key: 'cta_url', label: 'CTA URL', kind: 'url' },
    { key: 'coupon_code', label: 'Coupon code (optional)', kind: 'text' },
    { key: 'expires', label: 'Expiration text (optional)', kind: 'text' },
    { key: 'terms', label: 'Terms (optional)', kind: 'text' },
    { key: 'note', label: 'Handwritten note', kind: 'textarea' },
  ] },
  { type: 'closing', label: '7 · What Are You Printing Next?', fields: [
    { key: 'headline', label: 'Headline', kind: 'text' },
  ], lists: [
    { key: 'buttons', label: 'CTA buttons (1–3)', max: 3, fields: [
      { key: 'label', label: 'Label', kind: 'text' },
      { key: 'url', label: 'URL', kind: 'url' },
    ] },
    { key: 'values', label: 'Trust items (up to 3)', max: 3, fields: [
      { key: 'icon', label: 'Emoji icon', kind: 'text' },
      { key: 'title', label: 'Title', kind: 'text' },
    ] },
  ] },
  { type: 'footer', label: '8 · Footer', locked: true, fields: [
    { key: 'logo_url', label: 'Logo', kind: 'image' },
    { key: 'company', label: 'Company name', kind: 'text' },
    { key: 'tagline', label: 'Tagline', kind: 'text' },
    { key: 'email', label: 'Email', kind: 'text' },
    { key: 'phone', label: 'Phone', kind: 'text' },
    { key: 'website', label: 'Website', kind: 'url' },
    { key: 'address', label: 'Address (optional)', kind: 'text' },
    { key: 'facebook', label: 'Facebook URL', kind: 'url' },
    { key: 'instagram', label: 'Instagram URL', kind: 'url' },
    { key: 'tiktok', label: 'TikTok URL', kind: 'url' },
    { key: 'youtube', label: 'YouTube URL', kind: 'url' },
  ] },
];
const schemaFor = (type: string) => SCHEMAS.find((s) => s.type === type);

/* ── Image upload (reuses the campaign upload endpoint + Spaces) ───────── */

async function uploadImage(file: File): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const res = await fetch('/api/admin/campaigns/upload-image', {
    method: 'POST', headers: jsonHeaders(),
    body: JSON.stringify({ imageBase64: dataUrl, filename: file.name }),
  });
  if (!res.ok) throw new Error('Upload failed');
  const d = await res.json();
  return d.url;
}

function ImageField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2">
      {value ? (
        <img src={value} alt="" className="h-10 w-10 rounded border border-gray-200 object-contain bg-gray-50" />
      ) : (
        <div className="h-10 w-10 rounded border border-dashed border-gray-300 flex items-center justify-center text-gray-300 text-xs">—</div>
      )}
      <input
        type="text" value={value} onChange={(ev) => onChange(ev.target.value)}
        placeholder="Image URL or upload →"
        className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 text-xs"
      />
      <button
        type="button" disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="text-xs font-semibold text-red-600 hover:text-red-700 whitespace-nowrap disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Upload'}
      </button>
      {value && (
        <button type="button" onClick={() => onChange('')} className="text-gray-400 hover:text-red-600" aria-label="Remove image">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <input
        ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={async (ev) => {
          const f = ev.target.files?.[0];
          if (!f) return;
          setBusy(true);
          try { onChange(await uploadImage(f)); } catch { alert('Image upload failed'); }
          setBusy(false);
          ev.target.value = '';
        }}
      />
    </div>
  );
}

/* ── Field + list editors ──────────────────────────────────────────────── */

function FieldEditor({ field, value, onChange }: { field: Field; value: unknown; onChange: (v: string) => void }) {
  const v = typeof value === 'string' ? value : '';
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 mb-1">{field.label}</label>
      {field.kind === 'textarea' ? (
        <textarea value={v} onChange={(ev) => onChange(ev.target.value)} rows={2}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
      ) : field.kind === 'image' ? (
        <ImageField value={v} onChange={onChange} />
      ) : (
        <input type="text" value={v} onChange={(ev) => onChange(ev.target.value)}
          placeholder={field.kind === 'url' ? 'https://… or /quote' : ''}
          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs" />
      )}
      {field.hint && <p className="mt-0.5 text-[10px] text-gray-400">{field.hint}</p>}
    </div>
  );
}

function ProductPicker({ onPick }: { onPick: (p: { name: string; image_url: string; url: string }) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ id: number; name: string; brand: string; image_url: string; url: string }[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/admin/newsletters/product-search?q=${encodeURIComponent(q)}`, { headers: authHeaders() });
      if (res.ok) setResults((await res.json()).products);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="rounded-lg bg-gray-50 border border-gray-200 p-2">
      <div className="flex items-center gap-1.5">
        <Search className="h-3.5 w-3.5 text-gray-400" />
        <input value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Search catalog to auto-fill…"
          className="flex-1 bg-transparent text-xs outline-none" />
      </div>
      {results.length > 0 && (
        <div className="mt-1.5 max-h-40 overflow-y-auto divide-y divide-gray-100">
          {results.map((p) => (
            <button key={p.id} type="button"
              onClick={() => { onPick({ name: p.name, image_url: p.image_url, url: p.url }); setQ(''); setResults([]); }}
              className="w-full flex items-center gap-2 py-1.5 text-left hover:bg-white rounded">
              {p.image_url && <img src={p.image_url} alt="" className="h-8 w-8 object-contain" />}
              <span className="text-xs text-gray-700">{p.brand} · {p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main component ────────────────────────────────────────────────────── */

export default function NewslettersAdmin() {
  const [list, setList] = useState<NewsletterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Newsletter | null>(null);
  const [openBlock, setOpenBlock] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [sendFilter, setSendFilter] = useState<Filter>('past_invoiced');
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [busyAction, setBusyAction] = useState('');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const flash = (kind: 'ok' | 'err', text: string) => {
    setNotice({ kind, text });
    setTimeout(() => setNotice(null), 5000);
  };

  const loadList = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/admin/newsletters', { headers: authHeaders() });
    if (res.ok) setList(await res.json());
    setLoading(false);
  }, []);
  useEffect(() => { void loadList(); }, [loadList]);

  // Debounced live preview from the CURRENT editor state (unsaved edits show).
  useEffect(() => {
    if (!editing) return;
    const t = setTimeout(async () => {
      const res = await fetch('/api/admin/newsletters/preview', {
        method: 'POST', headers: jsonHeaders(),
        body: JSON.stringify({ blocks: editing.blocks, preheader: editing.preheader }),
      });
      if (res.ok) setPreviewHtml((await res.json()).html);
    }, 450);
    return () => clearTimeout(t);
  }, [editing]);

  // Audience count via the existing campaigns preview endpoint.
  useEffect(() => {
    if (!editing) return;
    (async () => {
      setAudienceCount(null);
      const res = await fetch('/api/admin/campaigns/preview', {
        method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ filter: sendFilter }),
      });
      if (res.ok) setAudienceCount((await res.json()).count);
    })();
  }, [sendFilter, editing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async (fromId?: number) => {
    const name = prompt('Internal name for this newsletter?', fromId ? undefined : `${new Date().toLocaleString('en-US', { month: 'long' })} Newsletter`);
    if (name === null) return;
    const res = await fetch('/api/admin/newsletters', {
      method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ name, from_id: fromId }),
    });
    if (!res.ok) return flash('err', 'Could not create newsletter');
    const nl = await res.json();
    setEditing(nl);
    setOpenBlock(null);
    setDirty(false);
    void loadList();
  };

  const openEditor = async (id: number) => {
    const res = await fetch(`/api/admin/newsletters/${id}`, { headers: authHeaders() });
    if (!res.ok) return flash('err', 'Could not load newsletter');
    setEditing(await res.json());
    setOpenBlock(null);
    setDirty(false);
  };

  const save = async (silent = false): Promise<boolean> => {
    if (!editing) return false;
    setSaving(true);
    const res = await fetch(`/api/admin/newsletters/${editing.id}`, {
      method: 'PUT', headers: jsonHeaders(),
      body: JSON.stringify({ name: editing.name, subject: editing.subject, preheader: editing.preheader, blocks: editing.blocks }),
    });
    setSaving(false);
    if (!res.ok) { flash('err', 'Save failed'); return false; }
    setDirty(false);
    if (!silent) flash('ok', 'Saved');
    return true;
  };

  const mutate = (fn: (nl: Newsletter) => Newsletter) => {
    setEditing((prev) => (prev ? fn(prev) : prev));
    setDirty(true);
  };
  const setBlockData = (blockId: string, key: string, value: unknown) =>
    mutate((nl) => ({
      ...nl,
      blocks: nl.blocks.map((b) => (b.id === blockId ? { ...b, data: { ...b.data, [key]: value } } : b)),
    }));

  const sendTest = async () => {
    if (!editing || !testEmail.trim()) return;
    if (!(await save(true))) return;
    setBusyAction('test');
    const res = await fetch(`/api/admin/newsletters/${editing.id}/send`, {
      method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ test_email: testEmail.trim() }),
    });
    setBusyAction('');
    const d = await res.json();
    if (!res.ok) return flash('err', d.details ? d.details.join(' ') : d.error || 'Test send failed');
    flash('ok', `Test sent to ${testEmail.trim()}`);
  };

  const sendReal = async () => {
    if (!editing) return;
    if (!(await save(true))) return;
    if (!confirm(`Send "${editing.subject || editing.name}" to ${FILTER_LABELS[sendFilter]}${audienceCount != null ? ` (${audienceCount} recipients)` : ''}?`)) return;
    setBusyAction('send');
    const res = await fetch(`/api/admin/newsletters/${editing.id}/send`, {
      method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ filter: sendFilter }),
    });
    setBusyAction('');
    const d = await res.json();
    if (!res.ok) return flash('err', d.details ? d.details.join(' ') : d.error || 'Send failed');
    flash('ok', `Sending to ${d.recipient_count} recipients — watch Email Blasts for results.`);
    setEditing(null);
    void loadList();
  };

  /* ── List view ── */
  if (!editing) {
    const templates = list.filter((n) => n.is_template);
    const drafts = list.filter((n) => !n.is_template);
    return (
      <div className="space-y-6">
        {notice && <Notice notice={notice} />}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Newsletters</h2>
            <p className="text-sm text-gray-500">Modular block newsletters — sent through the same pipeline and analytics as Email Blasts.</p>
          </div>
          <button onClick={() => void create()} className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg">
            <Plus className="h-4 w-4" /> Create Newsletter
          </button>
        </div>

        {templates.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-1.5"><LayoutTemplate className="h-4 w-4" /> Templates</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {templates.map((t) => (
                <div key={t.id} className="rounded-xl border border-gray-200 p-4 bg-white">
                  <p className="font-semibold text-sm text-gray-900">{t.name}</p>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => void create(t.id)} className="text-xs font-semibold text-red-600 hover:text-red-700">Use template</button>
                    <button onClick={() => void openEditor(t.id)} className="text-xs font-semibold text-gray-500 hover:text-gray-700">Edit</button>
                    <button onClick={async () => { if (confirm('Delete this template?')) { await fetch(`/api/admin/newsletters/${t.id}`, { method: 'DELETE', headers: authHeaders() }); void loadList(); } }} className="text-xs text-gray-400 hover:text-red-600 ml-auto">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
          ) : drafts.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-400">
              No newsletters yet. Create one — it starts from the polished TSB template with sample content.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-left text-xs text-gray-500">
                <th className="px-4 py-2.5">Name</th><th className="px-4 py-2.5">Subject</th>
                <th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Sent</th><th className="px-4 py-2.5"></th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {drafts.map((n) => (
                  <tr key={n.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-semibold text-gray-900">{n.name}</td>
                    <td className="px-4 py-2.5 text-gray-600 truncate max-w-[220px]">{n.subject || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${n.status === 'sent' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{n.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{n.sent_count != null ? `${n.sent_count}/${n.recipient_count}` : '—'}</td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <button onClick={() => void openEditor(n.id)} className="text-xs font-semibold text-red-600 hover:text-red-700 mr-3">Edit</button>
                      <button
                        onClick={async () => { await fetch(`/api/admin/newsletters/${n.id}/duplicate`, { method: 'POST', headers: jsonHeaders() }); void loadList(); }}
                        className="text-xs font-semibold text-gray-500 hover:text-gray-700 mr-3" title="Duplicate">
                        <Copy className="h-3.5 w-3.5 inline" />
                      </button>
                      <button
                        onClick={async () => { if (confirm(`Delete "${n.name}"?`)) { await fetch(`/api/admin/newsletters/${n.id}`, { method: 'DELETE', headers: authHeaders() }); void loadList(); } }}
                        className="text-xs text-gray-400 hover:text-red-600" title="Delete">
                        <Trash2 className="h-3.5 w-3.5 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  /* ── Editor view ── */
  return (
    <div className="space-y-4">
      {notice && <Notice notice={notice} />}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => { if (!dirty || confirm('Discard unsaved changes?')) setEditing(null); }}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <input
          value={editing.name}
          onChange={(ev) => mutate((nl) => ({ ...nl, name: ev.target.value }))}
          className="font-bold text-gray-900 text-lg bg-transparent border-b border-transparent focus:border-gray-300 outline-none flex-1 min-w-[180px]"
        />
        <button
          onClick={async () => {
            const name = prompt('Template name?', `${editing.name} template`);
            if (!name) return;
            await save(true);
            await fetch(`/api/admin/newsletters/${editing.id}/save-as-template`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ name }) });
            flash('ok', 'Saved as template');
            void loadList();
          }}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg px-3 py-1.5">
          <LayoutTemplate className="h-3.5 w-3.5" /> Save as template
        </button>
        <button onClick={() => void save()} disabled={saving}
          className="inline-flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save{dirty ? ' *' : ''}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4 items-start">
        {/* Left — settings + block panels */}
        <div className="space-y-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Newsletter settings</p>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Email subject *</label>
              <input value={editing.subject} onChange={(ev) => mutate((nl) => ({ ...nl, subject: ev.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" placeholder="Fall orders start now 🍂" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 mb-1">Preheader (preview text)</label>
              <input value={editing.preheader} onChange={(ev) => mutate((nl) => ({ ...nl, preheader: ev.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm" placeholder="Homecoming, Halloween, and team gear — plan your order." />
            </div>
          </div>

          {editing.blocks.map((block) => {
            const schema = schemaFor(block.type);
            if (!schema) return null;
            const open = openBlock === block.id;
            return (
              <div key={block.id} className={`rounded-xl border bg-white ${block.enabled ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button onClick={() => setOpenBlock(open ? null : block.id)} className="flex items-center gap-2 flex-1 text-left">
                    {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                    <span className="text-sm font-semibold text-gray-800">{schema.label}</span>
                  </button>
                  {!schema.locked && (
                    <button
                      onClick={() => mutate((nl) => ({ ...nl, blocks: nl.blocks.map((b) => (b.id === block.id ? { ...b, enabled: !b.enabled } : b)) }))}
                      className="text-gray-400 hover:text-gray-700" title={block.enabled ? 'Disable block' : 'Enable block'}>
                      {block.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                  )}
                </div>
                {open && (
                  <div className="px-3 pb-3 space-y-2.5 border-t border-gray-100 pt-3">
                    {schema.fields.map((f) => (
                      <FieldEditor key={f.key} field={f} value={block.data[f.key]}
                        onChange={(v) => setBlockData(block.id, f.key, v)} />
                    ))}
                    {(schema.lists || []).map((listDef) => {
                      const items = Array.isArray(block.data[listDef.key]) ? (block.data[listDef.key] as Record<string, string>[]) : [];
                      return (
                        <div key={listDef.key} className="space-y-2">
                          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider pt-1">{listDef.label}</p>
                          {items.map((item, idx) => (
                            <div key={idx} className="rounded-lg border border-gray-100 bg-gray-50/60 p-2.5 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-gray-400">#{idx + 1}</span>
                                <button
                                  onClick={() => setBlockData(block.id, listDef.key, items.filter((_, i) => i !== idx))}
                                  className="text-gray-300 hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
                              </div>
                              {listDef.productPicker && (
                                <ProductPicker onPick={(p) => {
                                  const next = items.slice();
                                  next[idx] = { ...next[idx], name: p.name, image_url: p.image_url, cta_url: p.url, cta_label: next[idx]?.cta_label || 'Shop now' };
                                  setBlockData(block.id, listDef.key, next);
                                }} />
                              )}
                              {listDef.fields.map((f) => (
                                <FieldEditor key={f.key} field={f} value={item[f.key]}
                                  onChange={(v) => {
                                    const next = items.slice();
                                    next[idx] = { ...next[idx], [f.key]: v };
                                    setBlockData(block.id, listDef.key, next);
                                  }} />
                              ))}
                            </div>
                          ))}
                          {items.length < listDef.max && (
                            <button
                              onClick={() => setBlockData(block.id, listDef.key, [...items, {}])}
                              className="text-xs font-semibold text-red-600 hover:text-red-700 inline-flex items-center gap-1">
                              <Plus className="h-3.5 w-3.5" /> Add item
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Send panel */}
          <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Send</p>
            <div className="flex gap-2">
              <input value={testEmail} onChange={(ev) => setTestEmail(ev.target.value)} placeholder="you@email.com"
                className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
              <button onClick={() => void sendTest()} disabled={busyAction !== '' || !testEmail.trim()}
                className="inline-flex items-center gap-1.5 border border-gray-300 text-gray-700 hover:bg-gray-50 text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50">
                {busyAction === 'test' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Send test
              </button>
            </div>
            <div className="flex gap-2 items-center">
              <select value={sendFilter} onChange={(ev) => setSendFilter(ev.target.value as Filter)}
                className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
                  <option key={f} value={f}>{FILTER_LABELS[f]}{audienceCount != null && f === sendFilter ? ` (${audienceCount})` : ''}</option>
                ))}
              </select>
              <button onClick={() => void sendReal()} disabled={busyAction !== ''}
                className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50">
                {busyAction === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
              </button>
            </div>
            <p className="text-[11px] text-gray-400">Delivery, open/click tracking, and unsubscribe run through the existing Email Blasts pipeline — results appear there.</p>
          </div>
        </div>

        {/* Right — live preview */}
        <div className="rounded-xl border border-gray-200 bg-gray-100 overflow-hidden lg:sticky lg:top-4">
          <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-200">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Live preview</p>
            <div className="flex gap-1">
              <button onClick={() => setPreviewMode('desktop')}
                className={`p-1.5 rounded ${previewMode === 'desktop' ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-700'}`} title="Desktop">
                <Monitor className="h-4 w-4" />
              </button>
              <button onClick={() => setPreviewMode('mobile')}
                className={`p-1.5 rounded ${previewMode === 'mobile' ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-700'}`} title="Mobile">
                <Smartphone className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex justify-center p-3 overflow-auto" style={{ maxHeight: '78vh' }}>
            <iframe
              title="Newsletter preview"
              srcDoc={previewHtml}
              sandbox=""
              className="bg-white border border-gray-300 rounded-lg shadow-sm"
              style={{ width: previewMode === 'desktop' ? 680 : 390, height: '74vh' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Notice({ notice }: { notice: { kind: 'ok' | 'err'; text: string } }) {
  return (
    <div className={`rounded-lg px-4 py-2.5 text-sm font-medium ${notice.kind === 'ok' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
      {notice.text}
    </div>
  );
}
