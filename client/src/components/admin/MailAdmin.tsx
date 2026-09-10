import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Inbox, Loader2, Mail, Paperclip, PenSquare, RefreshCw, Reply, Send, X,
} from 'lucide-react';

// Unified mailbox for *@tshirtbrothers.com — reads the Purelymail catch-all
// synced into mail_messages, and sends as any alias on the domain.

interface MailListItem {
  id: number;
  from_name: string | null;
  from_addr: string | null;
  to_addrs: string[];
  alias: string | null;
  subject: string | null;
  snippet: string | null;
  attachments: Array<{ filename: string; url: string; size: number }>;
  msg_date: string | null;
  seen: boolean;
  outgoing: boolean;
}

interface MailFull extends MailListItem {
  cc_addrs: string[];
  body_text: string | null;
  body_html: string | null;
}

interface AliasRow { alias: string; total: string; unread: string }

interface MailStatusInfo { configured: boolean; syncing: boolean; lastSync: string | null; lastError: string | null }

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${localStorage.getItem('tsb_token') || ''}`,
  };
}

const fmtDate = (d: string | null) => {
  if (!d) return '';
  const dt = new Date(d);
  const today = new Date();
  return dt.toDateString() === today.toDateString()
    ? dt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : dt.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export default function MailAdmin() {
  const [status, setStatus] = useState<MailStatusInfo | null>(null);
  const [aliases, setAliases] = useState<AliasRow[]>([]);
  const [messages, setMessages] = useState<MailListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingNow, setSyncingNow] = useState(false);
  const [folder, setFolder] = useState<'inbox' | 'sent'>('inbox');
  const [aliasFilter, setAliasFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [openMsg, setOpenMsg] = useState<MailFull | null>(null);
  const [compose, setCompose] = useState<null | { from: string; to: string; cc: string; subject: string; body: string; replyToId?: number }>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const loadStatus = useCallback(async () => {
    const r = await fetch('/api/mail/status', { headers: authHeaders() });
    if (r.ok) setStatus(await r.json());
  }, []);

  const loadAliases = useCallback(async () => {
    const r = await fetch('/api/mail/aliases', { headers: authHeaders() });
    if (r.ok) setAliases(await r.json());
  }, []);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ folder });
      if (aliasFilter) params.set('alias', aliasFilter);
      if (search.trim()) params.set('q', search.trim());
      const r = await fetch(`/api/mail/?${params}`, { headers: authHeaders() });
      if (r.ok) setMessages(await r.json());
    } finally {
      setLoading(false);
    }
  }, [folder, aliasFilter, search]);

  useEffect(() => { void loadStatus(); void loadAliases(); }, [loadStatus, loadAliases]);

  // Deep link from the dashboard / order pages:
  // /admin?section=mail&composeTo=<addr>&composeSubject=<subj> opens the
  // composer prefilled.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const to = params.get('composeTo');
    if (to) {
      setCompose({
        from: 'kevin@tshirtbrothers.com',
        to,
        cc: '',
        subject: params.get('composeSubject') || '',
        body: '',
      });
    }
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => void loadMessages(), search ? 300 : 0);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [loadMessages, search]);

  async function checkMailNow() {
    setSyncingNow(true);
    try {
      await fetch('/api/mail/sync', { method: 'POST', headers: authHeaders() });
      await Promise.all([loadMessages(), loadAliases(), loadStatus()]);
    } finally {
      setSyncingNow(false);
    }
  }

  async function openMessage(id: number) {
    const r = await fetch(`/api/mail/${id}`, { headers: authHeaders() });
    if (!r.ok) return;
    const full: MailFull = await r.json();
    setOpenMsg(full);
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, seen: true } : m)));
    void loadAliases();
  }

  function startReply(msg: MailFull) {
    const subj = msg.subject?.startsWith('Re:') ? msg.subject : `Re: ${msg.subject || ''}`;
    const quoted = (msg.body_text || '').split('\n').map((l) => `> ${l}`).join('\n');
    setCompose({
      from: msg.alias || 'kevin@tshirtbrothers.com',
      to: msg.outgoing ? (msg.to_addrs[0] || '') : (msg.from_addr || ''),
      cc: '',
      subject: subj,
      body: `\n\nOn ${msg.msg_date ? new Date(msg.msg_date).toLocaleString() : ''}, ${msg.from_addr} wrote:\n${quoted}`,
      replyToId: msg.id,
    });
    setSendError(null);
  }

  async function doSend() {
    if (!compose) return;
    setSending(true);
    setSendError(null);
    try {
      const r = await fetch('/api/mail/send', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          from: compose.from.trim(),
          to: compose.to.trim(),
          cc: compose.cc.trim() || undefined,
          subject: compose.subject,
          text: compose.body,
          replyToId: compose.replyToId,
        }),
      });
      const data = await r.json();
      if (!r.ok) { setSendError(data.error || `Send failed (HTTP ${r.status})`); return; }
      setCompose(null);
      void loadMessages();
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  const totalUnread = aliases.reduce((s, a) => s + Number(a.unread || 0), 0);

  if (status && !status.configured) {
    return (
      <div className="max-w-xl mx-auto text-center py-16 space-y-3">
        <Mail className="w-10 h-10 mx-auto text-gray-300" />
        <h2 className="text-lg font-semibold">Mailbox not connected</h2>
        <p className="text-sm text-gray-500">
          Set <code className="bg-gray-100 px-1 rounded">MAIL_IMAP_USER</code> and{' '}
          <code className="bg-gray-100 px-1 rounded">MAIL_IMAP_PASS</code> (a Purelymail app password)
          in the server environment, then restart. All *@tshirtbrothers.com mail will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Mail className="w-5 h-5" /> Mail
            {totalUnread > 0 && (
              <span className="text-xs bg-orange-500 text-white rounded-full px-2 py-0.5">{totalUnread}</span>
            )}
          </h2>
          <p className="text-sm text-gray-600">
            Every *@tshirtbrothers.com address, one inbox.
            {status?.lastSync && ` Last checked ${new Date(status.lastSync).toLocaleTimeString()}.`}
            {status?.lastError && <span className="text-red-600"> Sync error: {status.lastError}</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void checkMailNow()}
            disabled={syncingNow}
            className="inline-flex items-center gap-2 px-3 py-2 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {syncingNow ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Check mail
          </button>
          <button
            onClick={() => { setCompose({ from: 'kevin@tshirtbrothers.com', to: '', cc: '', subject: '', body: '' }); setSendError(null); }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600"
          >
            <PenSquare className="w-4 h-4" /> Compose
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-lg border overflow-hidden">
          {(['inbox', 'sent'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFolder(f)}
              className={`px-3 py-1.5 text-sm capitalize ${folder === f ? 'bg-gray-900 text-white' : 'bg-white border-gray-400 text-gray-800 hover:bg-gray-100'}`}
            >
              {f}
            </button>
          ))}
        </div>
        <button
          onClick={() => setAliasFilter('')}
          className={`px-2.5 py-1 rounded-full text-xs border ${!aliasFilter ? 'bg-orange-500 text-white border-orange-500' : 'bg-white border-gray-400 text-gray-800 hover:bg-gray-100'}`}
        >
          All addresses
        </button>
        {aliases.map((a) => (
          <button
            key={a.alias}
            onClick={() => setAliasFilter(aliasFilter === a.alias ? '' : a.alias)}
            className={`px-2.5 py-1 rounded-full text-xs border ${aliasFilter === a.alias ? 'bg-orange-500 text-white border-orange-500' : 'bg-white border-gray-400 text-gray-800 hover:bg-gray-100'}`}
          >
            {a.alias.replace('@tshirtbrothers.com', '@')}
            {Number(a.unread) > 0 && <span className="ml-1 font-semibold">({a.unread})</span>}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sender or subject…"
          className="ml-auto border rounded-lg px-3 py-1.5 text-sm w-56"
        />
      </div>

      {/* List + reader */}
      <div className="grid md:grid-cols-[minmax(280px,380px)_1fr] gap-4 items-start">
        <div className="bg-white border border-gray-300 rounded-xl overflow-hidden divide-y divide-gray-200 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
          ) : messages.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              <Inbox className="w-6 h-6 mx-auto mb-2 text-gray-300" />
              No messages{aliasFilter ? ` for ${aliasFilter}` : ''} yet.
            </div>
          ) : messages.map((m, idx) => (
            <button
              key={m.id}
              onClick={() => void openMessage(m.id)}
              className={`block w-full text-left px-4 py-3 hover:bg-gray-200 ${openMsg?.id === m.id ? 'bg-orange-50' : idx % 2 === 1 ? 'bg-gray-100' : 'bg-white'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-sm truncate ${!m.seen && !m.outgoing ? "font-bold text-gray-900" : "text-gray-800"}`}>
                  {m.outgoing ? `To: ${m.to_addrs?.[0] || ''}` : (m.from_name || m.from_addr || 'Unknown')}
                </span>
                <span className="text-xs text-gray-500 whitespace-nowrap">{fmtDate(m.msg_date)}</span>
              </div>
              <div className={`text-sm truncate ${!m.seen && !m.outgoing ? 'font-semibold' : ''}`}>{m.subject || '(no subject)'}</div>
              <div className="text-xs text-gray-600 truncate flex items-center gap-1">
                {(m.attachments?.length ?? 0) > 0 && <Paperclip className="w-3 h-3 shrink-0" />}
                {m.snippet}
              </div>
              {m.alias && !m.outgoing && (
                <span className="inline-block mt-1 text-[10px] bg-gray-200 text-gray-700 rounded px-1.5 py-0.5">
                  {m.alias.replace('@tshirtbrothers.com', '@')}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="bg-white border border-gray-300 rounded-xl min-h-[300px] max-h-[70vh] overflow-y-auto">
          {!openMsg ? (
            <div className="p-12 text-center text-sm text-gray-400">Select a message to read it.</div>
          ) : (
            <div className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-lg">{openMsg.subject || '(no subject)'}</h3>
                  <div className="text-sm text-gray-700">
                    {openMsg.from_name ? `${openMsg.from_name} <${openMsg.from_addr}>` : openMsg.from_addr}
                    {' → '}{(openMsg.to_addrs || []).join(', ')}
                  </div>
                  <div className="text-xs text-gray-500">
                    {openMsg.msg_date ? new Date(openMsg.msg_date).toLocaleString() : ''}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => startReply(openMsg)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50"
                  >
                    <Reply className="w-4 h-4" /> Reply
                  </button>
                  <button onClick={() => setOpenMsg(null)} className="p-1.5 text-gray-400 hover:text-gray-700">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {(openMsg.attachments?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-2">
                  {openMsg.attachments.map((a, idx) => (
                    <a
                      key={idx}
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs border rounded-lg px-2.5 py-1.5 hover:bg-gray-50 text-orange-700"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      {a.filename}
                      <span className="text-gray-400">({Math.round((a.size || 0) / 1024)} KB)</span>
                    </a>
                  ))}
                </div>
              )}

              {openMsg.body_html ? (
                <iframe
                  title="message"
                  sandbox=""
                  srcDoc={openMsg.body_html}
                  className="w-full border rounded-lg bg-white"
                  style={{ minHeight: '400px' }}
                />
              ) : (
                <pre className="whitespace-pre-wrap text-sm font-sans">{openMsg.body_text || ''}</pre>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Compose modal */}
      {compose && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{compose.replyToId ? 'Reply' : 'New message'}</h3>
              <button onClick={() => setCompose(null)} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-[60px_1fr] items-center gap-2 text-sm">
              <label className="text-gray-500">From</label>
              <input
                value={compose.from}
                onChange={(e) => setCompose({ ...compose, from: e.target.value })}
                list="tsb-mail-aliases"
                className="border rounded px-3 py-2"
              />
              <datalist id="tsb-mail-aliases">
                {[...new Set(['kevin@tshirtbrothers.com', 'info@tshirtbrothers.com', 'orders@tshirtbrothers.com', 'quotes@tshirtbrothers.com', ...aliases.map((a) => a.alias)])].map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
              <label className="text-gray-500">To</label>
              <input
                value={compose.to}
                onChange={(e) => setCompose({ ...compose, to: e.target.value })}
                placeholder="customer@example.com"
                className="border rounded px-3 py-2"
              />
              <label className="text-gray-500">Cc</label>
              <input
                value={compose.cc}
                onChange={(e) => setCompose({ ...compose, cc: e.target.value })}
                className="border rounded px-3 py-2"
              />
              <label className="text-gray-500">Subject</label>
              <input
                value={compose.subject}
                onChange={(e) => setCompose({ ...compose, subject: e.target.value })}
                className="border rounded px-3 py-2"
              />
            </div>
            <textarea
              value={compose.body}
              onChange={(e) => setCompose({ ...compose, body: e.target.value })}
              rows={10}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="Write your message…"
            />
            {sendError && <div className="text-sm text-red-600">{sendError}</div>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setCompose(null)} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button
                onClick={() => void doSend()}
                disabled={sending || !compose.to.trim() || !compose.body.trim()}
                className="inline-flex items-center gap-2 px-5 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
