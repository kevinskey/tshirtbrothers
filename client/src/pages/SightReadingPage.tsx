import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  Music, Volume2, VolumeX, RotateCcw, Check, X, Play, ChevronRight,
} from 'lucide-react';
import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';
import Staff from '@/components/sight-reading/Staff';
import { cn } from '@/lib/utils';
import {
  CLEFS, CLEF_NAMES, DIFFICULTIES, LETTERS, frequency, noteId, notePool,
  randomNote, type ClefName, type Difficulty, type Letter, type Note,
} from '@/lib/music/theory';
import { playFeedback, playFrequency } from '@/lib/music/audio';

type Status = 'asking' | 'correct' | 'wrong';

const BEST_KEY = 'sr_best_streak';
const AUTOPLAY_DELAY = 750; // ms before auto-advancing after a correct answer

export default function SightReadingPage() {
  const [clefMode, setClefMode] = useState<ClefName | 'mixed'>('treble');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [sound, setSound] = useState(true);
  const [autoHear, setAutoHear] = useState(false);

  const [activeClef, setActiveClef] = useState<ClefName>('treble');
  const [note, setNote] = useState<Note | null>(null);
  const [status, setStatus] = useState<Status>('asking');
  const [picked, setPicked] = useState<Letter | null>(null);

  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);

  const advanceTimer = useRef<number | null>(null);

  // Persist the all-time best streak across sessions.
  useEffect(() => {
    const saved = Number(localStorage.getItem(BEST_KEY) || 0);
    if (saved > 0) setBest(saved);
  }, []);

  const pickClef = useCallback((): ClefName => {
    if (clefMode === 'mixed') {
      return CLEF_NAMES[Math.floor(Math.random() * CLEF_NAMES.length)]!;
    }
    return clefMode;
  }, [clefMode]);

  const nextQuestion = useCallback(() => {
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    const clef = pickClef();
    const pool = notePool(clef, difficulty);
    const next = randomNote(pool, clefMode === 'mixed' ? undefined : note ?? undefined);
    setActiveClef(clef);
    setNote(next);
    setStatus('asking');
    setPicked(null);
    if (autoHear && sound) {
      window.setTimeout(() => playFrequency(frequency(next)), 120);
    }
  }, [pickClef, difficulty, clefMode, note, autoHear, sound]);

  // First question + re-roll whenever the settings change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { nextQuestion(); }, [clefMode, difficulty]);

  const answer = useCallback((letter: Letter) => {
    if (!note || status !== 'asking') return;
    const isRight = letter === note.letter;
    setPicked(letter);
    setTotal((t) => t + 1);
    if (sound) {
      playFrequency(frequency(note));
      playFeedback(isRight);
    }
    if (isRight) {
      setStatus('correct');
      setCorrect((c) => c + 1);
      setStreak((s) => {
        const ns = s + 1;
        if (ns > best) {
          setBest(ns);
          localStorage.setItem(BEST_KEY, String(ns));
        }
        return ns;
      });
      advanceTimer.current = window.setTimeout(nextQuestion, AUTOPLAY_DELAY);
    } else {
      setStatus('wrong');
      setStreak(0);
    }
  }, [note, status, sound, best, nextQuestion]);

  const hearNote = useCallback(() => {
    if (note) playFrequency(frequency(note));
  }, [note]);

  const resetStats = useCallback(() => {
    setCorrect(0);
    setTotal(0);
    setStreak(0);
    nextQuestion();
  }, [nextQuestion]);

  // Keyboard play: A–G answer, Enter/Space = next or hear.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toUpperCase();
      if ((LETTERS as string[]).includes(k)) {
        e.preventDefault();
        if (status === 'asking') answer(k as Letter);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (status === 'wrong') nextQuestion();
        else hearNote();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, answer, nextQuestion, hearNote]);

  useEffect(() => () => {
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
  }, []);

  const accuracy = total ? Math.round((correct / total) * 100) : 0;
  const clef = CLEFS[activeClef];

  const clefOptions = useMemo(
    () => [...CLEF_NAMES.map((c) => ({ id: c, label: CLEFS[c].label })),
           { id: 'mixed' as const, label: 'Mixed' }],
    [],
  );

  return (
    <Layout>
      <Seo
        title="Sight-Reading Trainer · Learn to Read Music Notes"
        description="A free, interactive sight-reading trainer. Name notes on the treble, bass, and alto clefs, hear each pitch, and build your reading speed with streaks and accuracy tracking."
        path="/sight-reading"
      />
      {/* Noto Music supplies the clef glyphs; scoped to this page only. */}
      <Helmet>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Music&display=swap"
        />
      </Helmet>

      <section className="bg-gray-950 text-white py-10 sm:py-14">
        <div className="container">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red text-white">
              <Music className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold">Sight-Reading Trainer</h1>
              <p className="text-sm text-gray-400">Name the note on the staff. Build your streak.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-brand-gray-50 py-8 sm:py-12">
        <div className="container max-w-3xl">
          {/* Settings */}
          <div className="grid gap-4 sm:grid-cols-2 mb-6">
            <SettingGroup label="Clef">
              <div className="flex flex-wrap gap-2">
                {clefOptions.map((o) => (
                  <Chip
                    key={o.id}
                    active={clefMode === o.id}
                    onClick={() => setClefMode(o.id as ClefName | 'mixed')}
                  >
                    {o.label}
                  </Chip>
                ))}
              </div>
            </SettingGroup>

            <SettingGroup label="Difficulty">
              <div className="flex flex-wrap gap-2">
                {DIFFICULTIES.map((d) => (
                  <Chip
                    key={d.id}
                    active={difficulty === d.id}
                    onClick={() => setDifficulty(d.id)}
                    title={d.hint}
                  >
                    {d.label}
                  </Chip>
                ))}
              </div>
            </SettingGroup>
          </div>

          {/* Staff card */}
          <div className="rounded-2xl bg-white shadow-sm border border-brand-gray-200 p-5 sm:p-8">
            <div className="py-4">
              <Staff
                clef={clef}
                note={note}
                state={status === 'asking' ? 'idle' : status}
              />
            </div>

            {/* Feedback line */}
            <div className="h-8 text-center">
              {status === 'correct' && note && (
                <p className="flex items-center justify-center gap-1.5 font-semibold text-green-600">
                  <Check className="h-5 w-5" /> {noteId(note)} — correct!
                </p>
              )}
              {status === 'wrong' && note && (
                <p className="flex items-center justify-center gap-1.5 font-semibold text-red-600">
                  <X className="h-5 w-5" />
                  {picked} is wrong — this is {note.letter}
                  <span className="text-brand-gray-400">({noteId(note)})</span>
                </p>
              )}
              {status === 'asking' && (
                <p className="text-sm text-brand-gray-400">Which note is this?</p>
              )}
            </div>

            {/* Answer pad */}
            <div className="mt-3 grid grid-cols-7 gap-1.5 sm:gap-2">
              {LETTERS.map((l) => {
                const isAnswer = note?.letter === l;
                const isPicked = picked === l;
                const showRight = status !== 'asking' && isAnswer;
                const showWrong = status === 'wrong' && isPicked && !isAnswer;
                return (
                  <button
                    key={l}
                    onClick={() => answer(l)}
                    disabled={status !== 'asking'}
                    className={cn(
                      'h-12 sm:h-14 rounded-xl font-display text-lg font-bold transition-colors',
                      'border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red',
                      showRight && 'bg-green-500 text-white border-green-500',
                      showWrong && 'bg-red-500 text-white border-red-500',
                      !showRight && !showWrong &&
                        'bg-white border-brand-gray-200 text-brand-black hover:border-red hover:bg-red-light disabled:opacity-60 disabled:hover:bg-white disabled:hover:border-brand-gray-200',
                    )}
                  >
                    {l}
                  </button>
                );
              })}
            </div>

            {/* Action row */}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
              <button
                onClick={hearNote}
                className="inline-flex items-center gap-1.5 rounded-lg border border-brand-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-brand-black hover:bg-brand-gray-50"
              >
                <Play className="h-4 w-4" /> Hear note
              </button>
              {status === 'wrong' ? (
                <button
                  onClick={nextQuestion}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red px-4 py-2 text-sm font-semibold text-white hover:bg-red-dark"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={nextQuestion}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-brand-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-brand-black hover:bg-brand-gray-50"
                >
                  Skip <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Streak" value={streak} accent />
            <Stat label="Best streak" value={best} />
            <Stat label="Accuracy" value={`${accuracy}%`} />
            <Stat label="Answered" value={total} />
          </div>

          {/* Toggles + reset */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Toggle on={sound} onClick={() => setSound((s) => !s)}>
                {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                Sound
              </Toggle>
              <Toggle on={autoHear} onClick={() => setAutoHear((a) => !a)}>
                <Music className="h-4 w-4" /> Play each note
              </Toggle>
            </div>
            <button
              onClick={resetStats}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-gray-500 hover:text-brand-black"
            >
              <RotateCcw className="h-4 w-4" /> Reset
            </button>
          </div>

          <p className="mt-6 text-center text-xs text-brand-gray-400">
            Tip: press the <kbd className="rounded border px-1">A</kbd>–<kbd className="rounded border px-1">G</kbd> keys
            to answer, <kbd className="rounded border px-1">Space</kbd> to hear the note.
          </p>
        </div>
      </section>
    </Layout>
  );
}

// --- small presentational helpers -----------------------------------

function SettingGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-gray-500">{label}</p>
      {children}
    </div>
  );
}

function Chip({
  active, onClick, children, title,
}: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        'rounded-full px-3.5 py-1.5 text-sm font-medium border transition-colors',
        active
          ? 'bg-red text-white border-red'
          : 'bg-white text-brand-gray-600 border-brand-gray-200 hover:border-red hover:text-red',
      )}
    >
      {children}
    </button>
  );
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-white border border-brand-gray-200 px-4 py-3 text-center">
      <p className={cn('font-display text-2xl font-bold', accent ? 'text-red' : 'text-brand-black')}>{value}</p>
      <p className="text-xs text-brand-gray-500">{label}</p>
    </div>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium border transition-colors',
        on
          ? 'bg-red-light text-red border-red/30'
          : 'bg-white text-brand-gray-500 border-brand-gray-200 hover:bg-brand-gray-50',
      )}
    >
      {children}
    </button>
  );
}
