import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { postLead } from '../lib/api';

export const GUIDE_PDF = '/lht/the-other-side-of-fourteen-guide.pdf';

export default function GuidePage() {
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      await postLead({ first_name: firstName.trim(), email: email.trim(), consent, source: 'guide' });
      setDone(true);
    } catch {
      toast.error('Something went wrong — please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-lht-ink text-lht-cream font-lht-sans">
      <Helmet>
        <title>The Other Side of Fourteen — Free Guide | Live Hard Truth</title>
        <meta name="description" content="Get The Other Side of Fourteen: 5 Tips to Living Your Hard Truth, a free guide from Leora Johnson." />
      </Helmet>
      <div className="max-w-screen-lg mx-auto px-4 sm:px-6 py-16 grid gap-12 lg:grid-cols-2 items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-lht-cyan">Live Hard Truth / A free guide</p>
          <h1 className="mt-4 font-lht-display uppercase text-3xl sm:text-4xl leading-tight">
            The Other Side of Fourteen: 5 Tips to Living Your Hard Truth
          </h1>
          <p className="mt-5 text-lht-cream/80 max-w-lg">
            A free guide from Leora Johnson on what 14 years taught her about
            losing a life, and finding her own.
          </p>

          {done ? (
            <div className="mt-9 border border-lht-cyan/50 p-7">
              <p className="font-lht-display uppercase text-lht-cyan">Your guide is ready{firstName ? `, ${firstName}` : ''}.</p>
              <a
                href={GUIDE_PDF}
                download
                className="mt-5 inline-flex items-center gap-2 bg-lht-cyan text-lht-ink font-bold uppercase tracking-[0.14em] text-sm px-7 py-4 hover:bg-lht-cyan-dark transition-colors"
              >
                Download the guide <Download className="h-4 w-4" aria-hidden />
              </a>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-9 space-y-4 max-w-md">
              <label className="block text-sm">
                First name
                <input
                  required
                  maxLength={60}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                  className="mt-2 w-full bg-transparent border border-lht-cream/30 px-4 py-3 text-lht-cream focus:border-lht-cyan focus:outline-none"
                />
              </label>
              <label className="block text-sm">
                Email
                <input
                  required
                  type="email"
                  maxLength={255}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="mt-2 w-full bg-transparent border border-lht-cream/30 px-4 py-3 text-lht-cream focus:border-lht-cyan focus:outline-none"
                />
              </label>
              <label className="flex items-start gap-3 text-sm text-lht-cream/70">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-1 accent-lht-cyan"
                />
                I agree to receive future Live Hard Truth emails. Optional.
              </label>
              <button
                type="submit"
                disabled={sending}
                className="w-full sm:w-auto bg-lht-cyan text-lht-ink font-bold uppercase tracking-[0.14em] text-sm px-7 py-4 hover:bg-lht-cyan-dark transition-colors disabled:opacity-60"
              >
                {sending ? 'One moment…' : 'Send me the guide'}
              </button>
              <p className="text-xs text-lht-stone">Your guide is available for instant download after submitting.</p>
            </form>
          )}
        </div>
        <div className="max-w-sm mx-auto lg:mx-0 lg:justify-self-end">
          <img
            src="/lht/guide-cover.png"
            alt="The Other Side of Fourteen: 5 Tips to Living Your Hard Truth guide cover"
            className="w-full border border-lht-cream/15"
          />
        </div>
      </div>
    </div>
  );
}
