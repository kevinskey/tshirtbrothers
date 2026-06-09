import { type Clef, type Note, stepsFromMiddle, ledgerSteps } from '@/lib/music/theory';

// Geometry constants. Everything scales off LS (the gap between two
// adjacent staff lines). One diatonic "step" is half of that.
const LS = 18;            // staff-line spacing
const HALF = LS / 2;      // one note step (line -> adjacent space)
const PAD_TOP = LS * 5;   // headroom above the staff for ledger notes
const PAD_BOTTOM = LS * 5;
const WIDTH = 340;
const CLEF_X = 34;        // glyph centre x
const NOTE_X = 215;       // notehead centre x

const STAFF_HEIGHT = LS * 4;
const HEIGHT = PAD_TOP + STAFF_HEIGHT + PAD_BOTTOM;
const CENTER_Y = PAD_TOP + STAFF_HEIGHT / 2; // middle (3rd) line

const NOTE_RX = HALF * 1.32;
const NOTE_RY = HALF * 1.02;
const LEDGER_HALF = NOTE_RX * 1.55;

interface StaffProps {
  clef: Clef;
  note: Note | null;
  /** Tint the notehead for answer feedback. */
  state?: 'idle' | 'correct' | 'wrong';
}

/** y pixel for a note `step` count from the middle line (up = negative). */
function yForStep(step: number): number {
  return CENTER_Y - step * HALF;
}

export default function Staff({ clef, note, state = 'idle' }: StaffProps) {
  const lineColor = '#1f2937';
  const noteColor =
    state === 'correct' ? '#16a34a' : state === 'wrong' ? '#dc2626' : '#0a0a0a';

  // Five staff lines at steps +4 .. -4.
  const lines = [4, 2, 0, -2, -4].map((s) => yForStep(s));

  const step = note ? stepsFromMiddle(note, clef) : 0;
  const noteY = yForStep(step);
  const stemUp = step <= 0; // notes at/below the middle line get an up-stem
  const ledgers = note ? ledgerSteps(step) : [];

  // Clef glyph sizing: 1 SMuFL em ≈ the staff height; scale per clef.
  const clefSize = STAFF_HEIGHT * clef.glyphScale;
  const clefY = CENTER_Y + clef.glyphOffset * LS;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width="100%"
      role="img"
      aria-label={`${clef.label} clef staff`}
      style={{ maxWidth: 460, display: 'block', margin: '0 auto' }}
    >
      {/* staff lines */}
      {lines.map((y, i) => (
        <line
          key={i}
          x1={12}
          x2={WIDTH - 12}
          y1={y}
          y2={y}
          stroke={lineColor}
          strokeWidth={1.4}
        />
      ))}

      {/* clef glyph (Noto Music) */}
      <text
        x={CLEF_X}
        y={clefY}
        fontFamily="'Noto Music', serif"
        fontSize={clefSize}
        fill={lineColor}
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {clef.glyph}
      </text>

      {note && (
        <g>
          {/* ledger lines through/above/below the notehead */}
          {ledgers.map((s) => {
            const y = yForStep(s);
            return (
              <line
                key={s}
                x1={NOTE_X - LEDGER_HALF}
                x2={NOTE_X + LEDGER_HALF}
                y1={y}
                y2={y}
                stroke={lineColor}
                strokeWidth={1.4}
              />
            );
          })}

          {/* stem */}
          <line
            x1={stemUp ? NOTE_X + NOTE_RX - 0.6 : NOTE_X - NOTE_RX + 0.6}
            x2={stemUp ? NOTE_X + NOTE_RX - 0.6 : NOTE_X - NOTE_RX + 0.6}
            y1={noteY}
            y2={noteY + (stemUp ? -LS * 3.3 : LS * 3.3)}
            stroke={noteColor}
            strokeWidth={2}
          />

          {/* notehead — a slightly rotated filled ellipse */}
          <ellipse
            cx={NOTE_X}
            cy={noteY}
            rx={NOTE_RX}
            ry={NOTE_RY}
            fill={noteColor}
            transform={`rotate(-22 ${NOTE_X} ${noteY})`}
          />
        </g>
      )}
    </svg>
  );
}
