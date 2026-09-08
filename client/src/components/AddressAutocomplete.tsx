import { useEffect, useRef, useState } from 'react';
import { MapPin, CheckCircle2, AlertTriangle } from 'lucide-react';

/**
 * Google-backed address entry, shared by every address field on the site.
 *
 * <AddressAutocompleteInput> — a text input that shows Places suggestions
 * while typing. mode="line1" keeps only the street line in the field and
 * hands the rest to onResolved; mode="full" writes the whole formatted
 * address into the field.
 *
 * <AddressVerify> — renders a badge under a structured address form once
 * line1+zip (or line1+city+state) are filled: green "verified", or a
 * yellow "did you mean" card with one-tap apply of Google's corrected
 * version.
 */

export type ResolvedAddress = { line1: string; city: string; state: string; zip: string; formatted: string };

type Suggestion = { placeId: string; text: string };

export function AddressAutocompleteInput({
  value,
  onChange,
  onResolved,
  mode = 'line1',
  placeholder = 'Street address',
  className = '',
  inputStyle,
}: {
  value: string;
  onChange: (v: string) => void;
  onResolved?: (addr: ResolvedAddress) => void;
  mode?: 'line1' | 'full';
  placeholder?: string;
  className?: string;
  inputStyle?: React.CSSProperties;
}) {
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const debounce = useRef<ReturnType<typeof setTimeout>>();
  // Suppress the lookup triggered by our own onChange after a pick
  const justPicked = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (justPicked.current) { justPicked.current = false; return; }
    clearTimeout(debounce.current);
    if (value.trim().length < 4) { setSugs([]); setOpen(false); return; }
    debounce.current = setTimeout(async () => {
      try {
        const r = await fetch('/api/address/autocomplete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: value }),
        });
        const d = await r.json();
        setSugs(d.suggestions || []);
        setOpen((d.suggestions || []).length > 0);
        setHi(-1);
      } catch { /* suggestions are best-effort */ }
    }, 250);
    return () => clearTimeout(debounce.current);
  }, [value]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  async function pick(s: Suggestion) {
    setOpen(false);
    setSugs([]);
    justPicked.current = true;
    onChange(s.text); // instant feedback while details load
    try {
      const r = await fetch(`/api/address/place/${encodeURIComponent(s.placeId)}`);
      if (!r.ok) return;
      const addr: ResolvedAddress = await r.json();
      justPicked.current = true;
      onChange(mode === 'line1' ? addr.line1 || s.text : addr.formatted || s.text);
      onResolved?.(addr);
    } catch { /* keep the raw suggestion text */ }
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, sugs.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          if (e.key === 'Enter' && hi >= 0 && sugs[hi]) { e.preventDefault(); void pick(sugs[hi]!); }
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={placeholder}
        className={className}
        style={inputStyle}
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-30 left-0 right-0 top-full mt-1 rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden">
          {sugs.map((s, i) => (
            <button
              key={s.placeId}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); void pick(s); }}
              onMouseEnter={() => setHi(i)}
              className={`w-full flex items-start gap-2 px-3 py-2.5 text-left text-sm ${i === hi ? 'bg-orange-50' : 'bg-white'}`}
            >
              <MapPin className="h-4 w-4 mt-0.5 text-orange-500 shrink-0" />
              <span className="text-gray-800">{s.text}</span>
            </button>
          ))}
          <p className="px-3 py-1.5 text-[10px] text-gray-400 border-t border-gray-100">Suggestions by Google</p>
        </div>
      )}
    </div>
  );
}

type VerifyState =
  | { status: 'idle' | 'checking' | 'ok' | 'unknown' }
  | { status: 'fixed' | 'unconfirmed'; formatted: string; components: Omit<ResolvedAddress, 'formatted'> };

export function AddressVerify({
  line1, city, state, zip, onApply,
}: {
  line1: string; city: string; state: string; zip: string;
  onApply: (a: { line1: string; city: string; state: string; zip: string }) => void;
}) {
  const [st, setSt] = useState<VerifyState>({ status: 'idle' });
  const debounce = useRef<ReturnType<typeof setTimeout>>();
  const lastApplied = useRef('');

  const ready = line1.trim().length >= 4 && (zip.trim().length >= 5 || (city.trim() && state.trim()));
  const key = [line1, city, state, zip].map((s) => s.trim().toLowerCase()).join('|');

  useEffect(() => {
    clearTimeout(debounce.current);
    if (!ready) { setSt({ status: 'idle' }); return; }
    if (key === lastApplied.current) return; // don't re-flag what we just applied
    setSt({ status: 'checking' });
    debounce.current = setTimeout(async () => {
      try {
        const r = await fetch('/api/address/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ line1, city, state, zip }),
        });
        const d = await r.json();
        if (d.verdict === 'ok') setSt({ status: 'ok' });
        else if (d.verdict === 'fixed' || d.verdict === 'unconfirmed') {
          setSt({ status: d.verdict, formatted: d.formatted, components: d.components });
        } else setSt({ status: 'unknown' });
      } catch { setSt({ status: 'unknown' }); }
    }, 700);
    return () => clearTimeout(debounce.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);

  if (st.status === 'idle' || st.status === 'unknown') return null;
  if (st.status === 'checking') {
    return <p className="mt-1.5 text-xs text-gray-400">Checking address…</p>;
  }
  if (st.status === 'ok') {
    return (
      <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-green-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> Address verified
      </p>
    );
  }
  const flagged = st as Extract<VerifyState, { status: 'fixed' | 'unconfirmed' }>;
  const apply = () => {
    lastApplied.current = [flagged.components.line1, flagged.components.city, flagged.components.state, flagged.components.zip]
      .map((s) => s.trim().toLowerCase()).join('|');
    onApply(flagged.components);
    setSt({ status: 'ok' });
  };
  return (
    <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
      <p className="flex items-start gap-1.5 text-xs font-semibold text-amber-800">
        <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
        {st.status === 'fixed' ? 'Google suggests a small correction:' : "We couldn't fully confirm this address. Did you mean:"}
      </p>
      <p className="mt-1 text-sm text-gray-800">{flagged.formatted}</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={apply}
          className="rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 transition"
        >
          Use suggested
        </button>
        <button
          type="button"
          onClick={() => setSt({ status: 'unknown' })}
          className="rounded-lg border border-amber-300 text-amber-800 text-xs font-bold px-3 py-1.5 hover:bg-amber-100 transition"
        >
          Keep what I typed
        </button>
      </div>
    </div>
  );
}
