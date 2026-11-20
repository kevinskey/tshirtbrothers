import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Send, Upload, X, FileImage } from 'lucide-react';
import SendToVendorDialog, { type VendorSendPayload } from '../components/gangsheet/SendToVendorDialog';
import Layout from '../components/layout/Layout';

// Copied idiom from AdminDtfOrdersPage.tsx rather than imported — page
// modules in this app don't import helpers from each other.
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('tsb_token') || '';
  return { Authorization: `Bearer ${token}` };
}

const MAX_FILES = 20;
/**
 * Above this, upload straight to Spaces instead of through the API.
 *
 * Cloudflare's hard ceiling is 100 MB; 60 leaves room for multipart overhead
 * and for several files going up in one send, without moving the everyday
 * small-file case off the path that already works.
 */
const DIRECT_UPLOAD_OVER_BYTES = 60 * 1024 * 1024;
// Keep in step with the multer limit on /admin/vendor-send-file.
// NOTE: Cloudflare proxies tshirtbrothers.com and rejects request bodies
// over 100 MB with its own 413 before they reach the origin, so uploads
// above that fail regardless of this number.
const MAX_MB_EACH = 300;

function mb(n: number): string {
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The server accepts the three print formats by MIME, but browsers leave
 * File.type empty for some .tif/.tiff picks — fall back to the extension so
 * a valid file isn't rejected as "not PNG, PDF, or TIFF".
 */
function mimeFor(f: File): string {
  if (f.type) return f.type;
  const ext = f.name.toLowerCase().split('.').pop() || '';
  if (ext === 'png') return 'image/png';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'tif' || ext === 'tiff') return 'image/tiff';
  return '';
}

/**
 * Send a body with upload progress.
 *
 * fetch() reports nothing until the whole body is on the wire, so a 200 MB
 * send showed a frozen "Sending…" for minutes with no way to tell a slow
 * upload from a stalled one. XHR gives per-byte progress, a real timeout,
 * and a distinguishable network error.
 */
function sendWithProgress(opts: {
  method: string;
  url: string;
  body: XMLHttpRequestBodyInit;
  headers?: Record<string, string>;
  onProgress?: (frac: number) => void;
}): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(opts.method, opts.url);
    for (const [k, v] of Object.entries(opts.headers || {})) xhr.setRequestHeader(k, v);
    // Big print files on a slow upstream are legitimately slow; only give up
    // after half an hour, and say so rather than hanging forever.
    xhr.timeout = 30 * 60 * 1000;
    if (opts.onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) opts.onProgress!(e.loaded / e.total);
      };
    }
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText || '' });
    xhr.onerror = () => reject(new Error('The connection dropped during the upload — check your internet and try again'));
    xhr.ontimeout = () => reject(new Error('The upload timed out after 30 minutes'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));
    xhr.send(opts.body);
  });
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Admin gate — cloned from AdminDtfOrdersPage.tsx                        */
/* ────────────────────────────────────────────────────────────────────── */

export default function AdminVendorSendPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('tsb_token');
    if (!token) {
      navigate('/auth?redirect=/admin/vendor-send&reason=admin');
      return;
    }
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((user) => {
        if (user.role !== 'admin') {
          navigate('/auth?reason=admin');
        } else {
          setChecking(false);
        }
      })
      .catch(() => navigate('/auth?redirect=/admin/vendor-send&reason=admin'));
  }, [navigate]);

  if (checking) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return <VendorFileSender />;
}

/* ────────────────────────────────────────────────────────────────────── */
/*  File sender                                                            */
/* ────────────────────────────────────────────────────────────────────── */

type SentFile = { name: string; key: string; bytes?: number | null; widthPx?: number | null; heightPx?: number | null };
type VendorSendRow = {
  id: number;
  vendor_name: string | null;
  vendor_email: string;
  source: string; // 'upload' | 'builder' | 'order'
  reference: string | null;
  note: string | null;
  files: SentFile[];
  sent_at: string;
};

const SOURCE_LABEL: Record<string, string> = { upload: 'From computer', builder: 'Gang sheet builder', order: 'Customer order' };

function VendorFileSender() {
  const [files, setFiles] = useState<File[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [log, setLog] = useState<VendorSendRow[] | null>(null);
  // Live upload status shown in the dialog — large sends take minutes.
  const [progress, setProgress] = useState<{ label: string; pct: number | null } | null>(null);
  const say = (label: string, pct: number | null = null) => setProgress({ label, pct });

  async function refreshLog() {
    try {
      const r = await fetch('/api/gangsheet-store/admin/vendor-sends', { headers: authHeaders() });
      if (r.ok) setLog(await r.json());
    } catch {
      // Best-effort — the sender still works without history.
    }
  }

  useEffect(() => { refreshLog(); }, []);

  // The 7-day links in the original vendor email expire — this mints a
  // fresh one on demand and opens it.
  async function openFileLink(key: string) {
    try {
      const r = await fetch(`/api/gangsheet-store/admin/vendor-file-link?key=${encodeURIComponent(key)}`, { headers: authHeaders() });
      const body = await r.json().catch(() => ({}));
      if (!r.ok || !body.url) throw new Error(body.error || 'Could not create link');
      window.open(body.url, '_blank', 'noopener');
    } catch (err: any) {
      toast.error(err?.message || 'Could not create link');
    }
  }

  function addFiles(picked: File[]) {
    const ok: File[] = [];
    for (const f of picked) {
      const ext = f.name.toLowerCase().split('.').pop() || '';
      if (!['png', 'pdf', 'tif', 'tiff'].includes(ext)) {
        toast.error(`${f.name}: only PNG, PDF, or TIFF files`);
        continue;
      }
      if (f.size > MAX_MB_EACH * 1024 * 1024) {
        toast.error(`${f.name} is ${mb(f.size)} — the limit is ${MAX_MB_EACH} MB per file`);
        continue;
      }
      ok.push(f);
    }
    setFiles((prev) => {
      const merged = [...prev, ...ok];
      if (merged.length > MAX_FILES) {
        toast.error(`Max ${MAX_FILES} files per send`);
        return merged.slice(0, MAX_FILES);
      }
      return merged;
    });
  }

  async function handleSend(payload: VendorSendPayload) {
    // Cloudflare refuses a request body over 100 MB and answers with its own
    // HTML 413, which never reaches the origin — so anything near that goes
    // straight to Spaces with a presigned PUT and the API is only told the
    // key. Smaller files keep the proven multipart path.
    const needsDirect = files.some((f) => f.size > DIRECT_UPLOAD_OVER_BYTES);

    if (needsDirect) {
      const uploaded = [];
      for (const [i, f] of files.entries()) {
        const which = files.length > 1 ? ` (${i + 1} of ${files.length})` : '';
        const ctype = mimeFor(f);
        say(`Preparing ${f.name}${which}…`);
        const signRes = await fetch('/api/gangsheet-store/admin/vendor-upload-url', {
          method: 'POST',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: f.name, content_type: ctype }),
        });
        const signed = await signRes.json().catch(() => ({}));
        if (!signRes.ok) throw new Error(signed.error || 'Could not start the upload');
        say(`Uploading ${f.name}${which} — 0% of ${mb(f.size)}`, 0);
        const put = await sendWithProgress({
          method: 'PUT',
          url: signed.url,
          body: f,
          // Must match what the server signed, or Spaces rejects the PUT.
          headers: { 'Content-Type': ctype, 'x-amz-acl': 'private' },
          onProgress: (frac) =>
            say(`Uploading ${f.name}${which} — ${Math.round(frac * 100)}% of ${mb(f.size)}`, frac),
        });
        if (put.status < 200 || put.status >= 300) {
          throw new Error(`Upload failed for ${f.name} (${put.status})`);
        }
        uploaded.push({ key: signed.key, name: signed.name, bytes: f.size, content_type: ctype });
      }
      say('Emailing the vendor…');
      const r = await fetch('/api/gangsheet-store/admin/vendor-send-uploaded', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: uploaded,
          vendor_name: payload.vendor_name,
          vendor_email: payload.vendor_email,
          note: payload.note,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || `Send failed (${r.status})`);
      toast.success(
        files.length === 1
          ? `Sent to ${payload.vendor_email}`
          : `${files.length} files sent to ${payload.vendor_email}`
      );
      setFiles([]);
      refreshLog();
      return;
    }

    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    fd.append('vendor_name', payload.vendor_name);
    fd.append('vendor_email', payload.vendor_email);
    fd.append('note', payload.note);
    say(`Uploading ${mb(totalBytes)} — 0%`, 0);
    const r = await sendWithProgress({
      method: 'POST',
      url: '/api/gangsheet-store/admin/vendor-send-file',
      body: fd,
      headers: authHeaders(), // Authorization only — browser sets multipart Content-Type
      onProgress: (frac) =>
        (frac >= 1
          ? say('Emailing the vendor…')
          : say(`Uploading ${mb(totalBytes)} — ${Math.round(frac * 100)}%`, frac)),
    });
    // A 413 here comes from Cloudflare as HTML, so there is no JSON error to
    // read — saying "Send failed" left the real limit invisible.
    let body: any = {};
    try { body = JSON.parse(r.text); } catch { /* HTML error page */ }
    if (r.status === 413) throw new Error('That file is too big to send through the site — it will upload directly instead; try again.');
    if (r.status < 200 || r.status >= 300) throw new Error(body.error || `Send failed (${r.status})`);
    toast.success(
      files.length === 1
        ? `Sent to ${payload.vendor_email}`
        : `${files.length} files sent to ${payload.vendor_email}`
    );
    setFiles([]);
    refreshLog();
  }

  const totalBytes = files.reduce((s, f) => s + f.size, 0);

  return (
    <Layout>
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-1">
          <Link to="/admin" className="text-xs font-semibold text-gray-500 hover:text-orange-600">
            ← Admin Dashboard
          </Link>
        </div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-xl font-bold text-gray-900">Send Files to Vendor</h1>
          <Link to="/admin/dtf-orders" className="text-xs font-semibold text-orange-600 hover:underline">
            DTF order queue →
          </Link>
        </div>
        <p className="mb-4 text-sm text-gray-600">
          Pick print files from your computer and email them straight to a vendor. Each file gets a
          private download link that stays live for 7 days; the vendor email includes size and DPI
          specs, and you're BCC'd a copy.
        </p>

        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(Array.from(e.dataTransfer.files || []));
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition ${
            dragOver ? 'border-orange-500 bg-orange-50' : 'border-gray-300 bg-white hover:border-orange-400'
          }`}
        >
          <Upload className="h-8 w-8 text-orange-500" />
          <span className="text-sm font-semibold text-gray-900">Click to choose files, or drag them here</span>
          <span className="text-xs text-gray-500">PNG, PDF, or TIFF — up to {MAX_FILES} files, {MAX_MB_EACH} MB each</span>
          <input
            type="file"
            multiple
            accept=".png,.pdf,.tif,.tiff,image/png,application/pdf,image/tiff"
            className="hidden"
            onChange={(e) => {
              addFiles(Array.from(e.target.files || []));
              e.target.value = '';
            }}
          />
        </label>

        {files.length > 0 && (
          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-900">
                {files.length} file{files.length === 1 ? '' : 's'} · {mb(totalBytes)}
              </p>
              <button type="button" onClick={() => setFiles([])} className="text-xs font-semibold text-gray-500 hover:text-red-600">
                Clear all
              </button>
            </div>
            <ul className="divide-y divide-gray-100">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-3 py-2">
                  <FileImage className="h-4 w-4 flex-shrink-0 text-gray-400" />
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-700">{f.name}</span>
                  <span className="text-xs text-gray-400">{mb(f.size)}</span>
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700"
            >
              <Send className="h-4 w-4" /> Send to vendor…
            </button>
          </div>
        )}
        <div className="mt-8">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">Send history</h2>
          {log === null ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : log.length === 0 ? (
            <p className="text-sm text-gray-400">Nothing sent to a vendor yet.</p>
          ) : (
            <ul className="space-y-2">
              {log.map((row) => (
                <li key={row.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-sm font-semibold text-gray-900">
                        {row.vendor_name || row.vendor_email}
                      </span>
                      <span className="ml-2 text-xs text-gray-500">{row.vendor_email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                        {SOURCE_LABEL[row.source] || row.source}
                      </span>
                      <span className="text-xs text-gray-500">{new Date(row.sent_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {(row.files || []).map((f, i) => (
                      <li key={`${row.id}-${i}`} className="flex items-center gap-2 text-sm">
                        <FileImage className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                        <button
                          type="button"
                          onClick={() => openFileLink(f.key)}
                          className="truncate text-left text-orange-600 hover:underline"
                          title="Open a fresh download link"
                        >
                          {f.name}
                        </button>
                        {typeof f.bytes === 'number' && <span className="text-xs text-gray-400">{mb(f.bytes)}</span>}
                        {f.widthPx && f.heightPx && (
                          <span className="text-xs text-gray-400">
                            {(f.widthPx / 300).toFixed(1)}in × {(f.heightPx / 300).toFixed(1)}in
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  {row.note && <p className="mt-1.5 text-xs italic text-gray-500">“{row.note}”</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <SendToVendorDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSend={async (p) => {
          try { await handleSend(p); } finally { setProgress(null); }
        }}
        progressLabel={progress?.label ?? null}
        progressPct={progress?.pct ?? null}
        subject={
          files.length === 1
            ? `${files.map((f) => f.name).join('')} (${mb(totalBytes)})`
            : `${files.length} files (${mb(totalBytes)} total)`
        }
      />
    </div>
    </Layout>
  );
}
