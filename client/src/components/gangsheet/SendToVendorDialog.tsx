import { useEffect, useState } from 'react';
import { X, Send } from 'lucide-react';

// Preset print vendors. A typed-in address is remembered in localStorage
// per vendor and takes precedence over these defaults.
const PRESETS = [
  { key: 'kolormatrix', label: 'KolorMatrix', email: 'order@kolormatrix.com' },
  { key: 'tstg', label: 'TSTG Direct2Film', email: 'tstgdirect2film@gmail.com' },
  { key: 'custom', label: 'Other vendor', email: '' },
] as const;

const SAVED_EMAILS_KEY = 'tsb_vendor_emails';

function loadSavedEmails(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(SAVED_EMAILS_KEY) || '{}'); }
  catch { return {}; }
}

export interface VendorSendPayload {
  vendor_name: string;
  vendor_email: string;
  note: string;
}

interface SendToVendorDialogProps {
  open: boolean;
  onClose: () => void;
  // Caller performs the actual API call; throw with a message on failure.
  onSend: (payload: VendorSendPayload) => Promise<void>;
  // e.g. 'Order #12' or the sheet name — shown so the admin can confirm
  // they're sending the right thing.
  subject: string;
}

export default function SendToVendorDialog({ open, onClose, onSend, subject }: SendToVendorDialogProps) {
  const [presetKey, setPresetKey] = useState<string>('kolormatrix');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSent(false);
    setNote('');
    const saved = loadSavedEmails();
    const preset = PRESETS.find((p) => p.key === presetKey) || PRESETS[0];
    setEmail(saved[preset.key] || preset.email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const preset = PRESETS.find((p) => p.key === presetKey) || PRESETS[0];

  function pickPreset(key: string) {
    setPresetKey(key);
    const p = PRESETS.find((x) => x.key === key)!;
    setEmail(loadSavedEmails()[key] || p.email);
    setError(null);
  }

  async function handleSend() {
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Enter a valid vendor email address');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSend({ vendor_name: preset.label, vendor_email: trimmed, note: note.trim() });
      try {
        localStorage.setItem(SAVED_EMAILS_KEY, JSON.stringify({ ...loadSavedEmails(), [preset.key]: trimmed }));
      } catch { /* best-effort */ }
      setSent(true);
      window.setTimeout(onClose, 1600);
    } catch (err: any) {
      setError(err?.message || 'Send failed — try again');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Send to vendor</h2>
            <p className="mt-0.5 text-sm text-gray-500">{subject}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {sent ? (
          <p className="rounded-lg bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
            Sent to {email.trim()} ✓
          </p>
        ) : (
          <>
            <div className="mb-3 flex gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => pickPreset(p.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    presetKey === p.key ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <label className="mb-1 block text-xs font-medium text-gray-600">Vendor email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="orders@vendor.com"
              className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
            />

            <label className="mb-1 block text-xs font-medium text-gray-600">Note to vendor (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Rush order, ship to shop, etc."
              className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
            />

            <p className="mb-4 text-xs text-gray-500">
              The vendor gets an email with the full spec (300 DPI, size, print count) and a
              download link that stays live for 7 days.
            </p>

            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

            <button
              type="button"
              onClick={handleSend}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-600 disabled:opacity-50"
            >
              <Send className="h-4 w-4" /> {busy ? 'Sending…' : 'Send print order'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
