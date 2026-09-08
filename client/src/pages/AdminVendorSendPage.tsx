import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Send, Upload, X, FileImage } from 'lucide-react';
import SendToVendorDialog, { type VendorSendPayload } from '../components/gangsheet/SendToVendorDialog';

// Copied idiom from AdminDtfOrdersPage.tsx rather than imported — page
// modules in this app don't import helpers from each other.
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('tsb_token') || '';
  return { Authorization: `Bearer ${token}` };
}

const MAX_FILES = 20;
const MAX_MB_EACH = 200;

function mb(n: number): string {
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
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

function VendorFileSender() {
  const [files, setFiles] = useState<File[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);

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
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    fd.append('vendor_name', payload.vendor_name);
    fd.append('vendor_email', payload.vendor_email);
    fd.append('note', payload.note);
    const r = await fetch('/api/gangsheet-store/admin/vendor-send-file', {
      method: 'POST',
      headers: authHeaders(), // Authorization only — browser sets multipart Content-Type
      body: fd,
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || 'Send failed');
    toast.success(
      files.length === 1
        ? `Sent to ${payload.vendor_email}`
        : `${files.length} files sent to ${payload.vendor_email}`
    );
    setFiles([]);
  }

  const totalBytes = files.reduce((s, f) => s + f.size, 0);

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-2xl">
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
      </div>

      <SendToVendorDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSend={handleSend}
        subject={
          files.length === 1
            ? `${files.map((f) => f.name).join('')} (${mb(totalBytes)})`
            : `${files.length} files (${mb(totalBytes)} total)`
        }
      />
    </div>
  );
}
