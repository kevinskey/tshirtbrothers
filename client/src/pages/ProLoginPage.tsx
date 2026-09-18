/**
 * TSB Pro / store-owner login helper, linked from the site header.
 *
 * Store dashboards live at /stores/<slug>/admin (magic-code login), so a
 * generic "log in" button can't go straight there. This page offers both
 * paths: type your store address if you know it, or enter your email and
 * we email you direct links to every dashboard you admin (the lookup
 * never reveals membership on-screen — same anti-enumeration stance as
 * the code-request endpoint).
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Mail, ArrowRight, Loader2 } from 'lucide-react';
import Seo from '@/components/Seo';

export default function ProLoginPage() {
  const navigate = useNavigate();
  const [slug, setSlug] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goToStore = () => {
    const clean = slug.trim().toLowerCase()
      .replace(/^https?:\/\/[^/]+\/stores\//, '')
      .replace(/\/.*$/, '');
    if (!clean) return;
    navigate(`/stores/${encodeURIComponent(clean)}/admin`);
  };

  const emailLinks = async () => {
    if (!email.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/group-store-admin/login/find', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) throw new Error('Request failed — please try again');
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-[70vh] bg-gray-50 flex items-center justify-center px-4 py-12">
      <Seo
        title="TSB Pro Login · TShirt Brothers"
        description="Sign in to your organization or business web store dashboard."
        path="/pro/login"
      />
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-xl bg-orange-100 flex items-center justify-center">
            <Briefcase className="h-5 w-5 text-orange-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">TSB Pro Login</h1>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          For organization &amp; business store owners. Sign in to see orders,
          products, and payouts for your store.
        </p>

        {/* Path 1: knows their store address */}
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
          My store address
        </label>
        <div className="flex gap-2">
          {/* The URL prefix sits in its own shaded segment so the editable
              part reads as a real input — with the prefix inline in the
              same box, users couldn't tell whether the field had focus. */}
          <div className="flex-1 flex items-stretch rounded-lg border-2 border-gray-300 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/30 overflow-hidden transition-colors">
            <span className="flex items-center px-3 text-sm text-gray-500 whitespace-nowrap select-none bg-gray-100 border-r border-gray-200">
              tshirtbrothers.com/stores/
            </span>
            <input
              type="text"
              autoFocus
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && goToStore()}
              placeholder="your-store"
              className="flex-1 min-w-0 px-3 py-2.5 text-sm bg-white placeholder-gray-300 focus:outline-none caret-orange-600"
              style={{ fontSize: '16px' }}
            />
          </div>
          <button
            type="button"
            onClick={goToStore}
            disabled={!slug.trim()}
            aria-label="Go to my store login"
            className="px-4 rounded-lg bg-orange-600 text-white font-semibold hover:bg-orange-700 disabled:opacity-40 transition"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 uppercase tracking-wider">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Path 2: doesn't remember the address */}
        {sent ? (
          <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-800">
            <p className="font-semibold mb-1">Check your email</p>
            <p>
              If that address manages a store, we sent direct links to your
              dashboard. Click your store, then use the same email to get a
              sign-in code.
            </p>
          </div>
        ) : (
          <>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Don&apos;t remember it? Email me my link
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && emailLinks()}
                placeholder="you@yourorg.org"
                className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-300"
                style={{ fontSize: '16px' }}
              />
              <button
                type="button"
                onClick={emailLinks}
                disabled={!email.trim() || sending}
                className="inline-flex items-center gap-1.5 px-4 rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Send
              </button>
            </div>
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          </>
        )}

        <p className="mt-6 text-xs text-gray-400">
          Don&apos;t have a store yet?{' '}
          <a href="/pro" className="text-orange-600 font-medium hover:underline">
            Learn about TSB Pro web stores
          </a>
          .
        </p>
      </div>
    </div>
  );
}
