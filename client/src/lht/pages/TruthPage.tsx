// The Truth Session — a private reflection that ends in a "Truth Color"
// reading and a shareable card. Ported from the original livehardtruth.com
// flow; the reading itself comes from /api/lht/truth-session (which also
// captures the lead), and a crisis answer short-circuits to the 988 screen.

import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowLeft, ArrowRight, Download, Share2 } from 'lucide-react';
import { postTruthSession } from '../lib/api';
import type { TruthAnswers, TruthResult } from '../lib/api';
import { JOGGERS_SLUG, colorByLabel } from '../lib/catalog';
import { useLhtPath } from '../lib/base';
import { GUIDE_PDF } from './GuidePage';

const QUESTIONS: { key: keyof TruthAnswers; title: string; options: string[] }[] = [
  {
    key: 'season',
    title: 'What season are you in?',
    options: ['Starting over', 'Holding on', 'Healing', 'Rebuilding', 'Ready to rise'],
  },
  {
    key: 'carrying',
    title: 'What are you carrying right now?',
    options: ['A relationship that ended', 'A loss', 'A version of me I outgrew', "Other people's expectations", 'Fear of being seen'],
  },
  {
    key: 'duration',
    title: 'How long have you been carrying it?',
    options: ['Weeks', 'Months', 'A year or more', 'Longer than I want to admit'],
  },
  {
    key: 'need',
    title: 'What do you need most?',
    options: ['Permission to feel it', 'Courage to say it', 'Strength to let go', 'Help finding me again'],
  },
  {
    key: 'hiddenFrom',
    title: 'Who do you hide your truth from most?',
    options: ['Myself', 'My family', 'My partner or ex', 'The world'],
  },
  {
    key: 'freedom',
    title: 'When you imagine yourself free, what do you feel?',
    options: ['Light', 'Powerful', 'Peaceful', 'Seen'],
  },
];

const COLOR_PERSONAS: Record<string, { title: string; line: string; cardBg: string }> = {
  Onyx: { title: 'The Truth Teller', line: 'You are done hiding.', cardBg: '#161616' },
  Ember: { title: 'The Rebuilder', line: 'You are rising from what burned.', cardBg: '#A44725' },
  Merlot: { title: 'The Healer', line: 'You are grieving and growing.', cardBg: '#511F32' },
  Espresso: { title: 'The Grounded', line: 'You are steady and rooted.', cardBg: '#593F30' },
  Olive: { title: 'The Grower', line: 'You are entering a new season.', cardBg: '#4B5534' },
};

export default function TruthPage() {
  const p = useLhtPath();
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState<TruthAnswers>({});
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<TruthResult | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const go = (next: number) => {
    setStep(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const pick = (key: keyof TruthAnswers, value: string) => {
    setAnswers((a) => ({ ...a, [key]: value }));
    go(step + 1);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError('');
    try {
      const res = await postTruthSession({
        first_name: firstName,
        email,
        consent,
        answers: { ...answers, truth: answers.truth ?? '' },
      });
      setResult(res);
      go(8);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSending(false);
    }
  };

  async function shareCard() {
    if (!result?.color || result.safety) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const persona = COLOR_PERSONAS[result.color];
    canvas.width = 1080;
    canvas.height = 1080;
    ctx.fillStyle = '#141212';
    ctx.fillRect(0, 0, 1080, 1080);
    ctx.fillStyle = persona?.cardBg ?? '#141212';
    ctx.fillRect(44, 44, 992, 992);
    ctx.fillStyle = '#F7F3EB';
    ctx.textAlign = 'center';
    ctx.font = 'bold 30px Arial';
    ctx.fillText('LIVE HARD TRUTH', 540, 180);
    ctx.font = 'bold 112px Georgia';
    ctx.fillText(result.color.toUpperCase(), 540, 510);
    ctx.font = '42px Georgia';
    ctx.fillText(persona?.title ?? '', 540, 600);
    ctx.font = '30px Arial';
    ctx.fillText(persona?.line ?? '', 540, 660);
    ctx.font = '24px Arial';
    ctx.fillText('Find your truth at livehardtruth.com/truth', 540, 925);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return;
    const file = new File([blob], `my-truth-color-${result.color.toLowerCase()}.png`, { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `My Truth Color: ${result.color}` });
        return;
      }
    } catch {
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  const persona = result?.color ? COLOR_PERSONAS[result.color] : null;
  const truthColor = result?.color ? colorByLabel(JOGGERS_SLUG, result.color) : undefined;

  return (
    <div className="bg-lht-ink text-lht-cream font-lht-sans min-h-[82svh]">
      <Helmet>
        <title>The Truth Session — Live Hard Truth</title>
        <meta name="description" content="A private two-minute reflection to find your Truth Color and receive a personal reading." />
      </Helmet>
      <main className="px-5 pb-24 pt-16 sm:pt-24">
        <div className="mx-auto max-w-xl">
          {step === -1 && (
            <div className="text-center">
              <img
                src="/lht/leora.jpg"
                alt="Leora wearing a Live Hard Truth blue hoodie"
                className="mx-auto mb-8 aspect-[4/5] w-44 object-cover object-top sm:w-52"
              />
              <p className="mb-5 text-xs font-bold uppercase tracking-[0.2em] text-lht-cyan">A moment with Leora</p>
              <h1 className="font-lht-serif text-4xl leading-tight sm:text-5xl">
                Every piece I make carries a truth I lived first. Let's find yours.
              </h1>
              <button
                type="button"
                onClick={() => go(0)}
                className="mt-10 w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-lht-cyan text-lht-ink font-bold uppercase tracking-[0.14em] text-sm px-10 py-4 hover:bg-lht-cyan-dark transition-colors"
              >
                Begin <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          )}

          {step >= 0 && step <= 7 && (
            <>
              <div className="mb-10 flex items-center justify-between gap-4 text-xs uppercase tracking-[0.16em] text-lht-cream/60">
                <button type="button" onClick={() => go(step - 1)} aria-label="Previous question" className="p-2 text-lht-cream hover:text-lht-cyan">
                  <ArrowLeft className="h-4 w-4" aria-hidden />
                </button>
                <span>{step < 7 ? `${step + 1} / 7` : 'Your reading'}</span>
              </div>
              <div className="mb-11 h-px bg-lht-cream/20">
                <div className="h-px bg-lht-cyan transition-all duration-500" style={{ width: `${Math.min(100, ((step + 1) / 8) * 100)}%` }} />
              </div>

              {step < 6 && QUESTIONS[step] && (
                <>
                  <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-lht-cyan">Take a breath. This is yours.</p>
                  <h1 className="font-lht-serif mb-9 text-4xl leading-tight sm:text-5xl">{QUESTIONS[step]!.title}</h1>
                  <div className="space-y-3">
                    {QUESTIONS[step]!.options.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => pick(QUESTIONS[step]!.key, opt)}
                        className="min-h-16 w-full flex items-center justify-between whitespace-normal border border-lht-cream/30 bg-transparent px-5 py-4 text-left text-base hover:border-lht-cyan hover:bg-lht-cyan/10 transition-colors"
                      >
                        {opt} <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                      </button>
                    ))}
                  </div>
                </>
              )}

              {step === 6 && (
                <>
                  <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-lht-cyan">Only if you're ready</p>
                  <h1 className="font-lht-serif mb-8 text-4xl leading-tight sm:text-5xl">The truth I've been avoiding is...</h1>
                  <textarea
                    value={answers.truth ?? ''}
                    maxLength={400}
                    onChange={(e) => setAnswers((a) => ({ ...a, truth: e.target.value }))}
                    placeholder="Write what comes to mind"
                    aria-label="The truth I've been avoiding is"
                    className="min-h-40 w-full resize-none border border-lht-cream/30 bg-transparent p-5 text-lg outline-none placeholder:text-lht-cream/40 focus:border-lht-cyan"
                  />
                  <button type="button" onClick={() => go(7)} className="mt-6 w-full inline-flex items-center justify-center gap-2 bg-lht-cyan text-lht-ink font-bold uppercase tracking-[0.14em] text-sm px-7 py-4 hover:bg-lht-cyan-dark transition-colors">
                    Continue <ArrowRight className="h-4 w-4" aria-hidden />
                  </button>
                  <button type="button" onClick={() => go(7)} className="mt-2 w-full py-3 text-lht-cream/70 hover:text-lht-cream">
                    Skip this question
                  </button>
                </>
              )}

              {step === 7 && (
                <form onSubmit={submit} className="space-y-5">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-lht-cyan">Almost there</p>
                  <h1 className="font-lht-serif text-4xl leading-tight sm:text-5xl">Where should I send your reading and my free guide?</h1>
                  <label className="block text-sm">
                    First name
                    <input
                      required
                      maxLength={60}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      autoComplete="given-name"
                      className="mt-2 h-14 w-full border border-lht-cream/30 bg-transparent px-4 outline-none focus:border-lht-cyan"
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
                      className="mt-2 h-14 w-full border border-lht-cream/30 bg-transparent px-4 outline-none focus:border-lht-cyan"
                    />
                  </label>
                  <label className="flex items-start gap-3 text-sm text-lht-cream/70">
                    <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 accent-lht-cyan" />
                    I agree to receive future Live Hard Truth emails about my Truth Color. Optional.
                  </label>
                  {error && <p role="alert" className="text-sm text-lht-cyan">{error}</p>}
                  <button
                    type="submit"
                    disabled={sending}
                    className="w-full inline-flex items-center justify-center gap-2 bg-lht-cyan text-lht-ink font-bold uppercase tracking-[0.14em] text-sm px-7 py-4 hover:bg-lht-cyan-dark transition-colors disabled:opacity-60"
                  >
                    {sending ? 'Preparing your reading…' : 'Reveal my reading'}
                    {!sending && <ArrowRight className="h-4 w-4" aria-hidden />}
                  </button>
                </form>
              )}
            </>
          )}

          {step === 8 && result && (result.safety ? (
            <div className="py-12 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-lht-cyan">You are not alone</p>
              <h1 className="font-lht-serif mt-5 text-4xl">You matter.</h1>
              <p className="mx-auto mt-6 max-w-md text-lg leading-relaxed">
                Please reach out now: call or text{' '}
                <a className="font-bold underline" href="tel:988">988</a>,
                the Suicide and Crisis Lifeline.
              </p>
              <p className="mt-5 text-sm text-lht-cream/60">
                If you are outside the United States, contact your local emergency service.
              </p>
            </div>
          ) : (
            <div className="pb-12">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-lht-cyan">Made for {firstName}</p>
              <h1 className="font-lht-serif mt-4 text-4xl sm:text-5xl">Your Hard Truth Reading</h1>
              <p className="mt-8 text-lg leading-relaxed text-lht-cream/85">{result.reading?.reading}</p>
              <div className="mt-9 space-y-6 border-l-2 border-lht-cyan pl-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.15em] text-lht-cyan">Your hard truth</p>
                  <p className="font-lht-serif mt-2 text-xl">{result.reading?.hardTruth}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.15em] text-lht-cyan">Your next step this week</p>
                  <p className="font-lht-serif mt-2 text-xl">{result.reading?.nextStep}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.15em] text-lht-cyan">An affirmation for today</p>
                  <p className="font-lht-serif mt-2 text-xl">{result.reading?.affirmation}</p>
                </div>
              </div>

              <div
                className="mt-12 border border-lht-cream/20 p-8 text-center"
                style={{ backgroundColor: persona?.cardBg, color: '#F7F3EB' }}
              >
                <p className="text-xs uppercase tracking-[0.2em]">Your Truth Color</p>
                <h2 className="font-lht-serif mt-4 text-5xl">{result.color}</h2>
                <p className="mt-2 text-xl">{persona?.title}</p>
                <p className="mt-4 text-sm">{persona?.line}</p>
              </div>

              {truthColor?.photo && (
                <div className="mt-10">
                  <img src={truthColor.photo} alt={`LIVE HARD TRUTH Joggers Set in ${result.color}`} className="aspect-square w-full object-cover" />
                  <p className="mt-4 text-sm uppercase tracking-[0.14em] text-lht-cream/60">
                    LIVE HARD TRUTH Joggers Set · {result.color}
                  </p>
                  <Link
                    to={`${p(`/product/${JOGGERS_SLUG}`)}?color=${encodeURIComponent(result.color ?? '')}`}
                    className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-lht-cyan text-lht-ink font-bold uppercase tracking-[0.14em] text-sm px-7 py-4 hover:bg-lht-cyan-dark transition-colors"
                  >
                    Shop your color <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </div>
              )}

              <a
                href={GUIDE_PDF}
                download
                className="mt-3 w-full inline-flex items-center justify-center gap-2 border border-lht-cream/30 font-bold uppercase tracking-[0.14em] text-sm px-7 py-4 hover:border-lht-cyan hover:text-lht-cyan transition-colors"
              >
                Download your free guide <Download className="h-4 w-4" aria-hidden />
              </a>
              <button
                type="button"
                onClick={shareCard}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 py-4 font-bold uppercase tracking-[0.14em] text-sm text-lht-cream/80 hover:text-lht-cyan transition-colors"
              >
                Share your truth color <Share2 className="h-4 w-4" aria-hidden />
              </button>
              <canvas ref={canvasRef} className="hidden" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
