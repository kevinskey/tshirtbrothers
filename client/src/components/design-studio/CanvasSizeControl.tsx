/**
 * Header bar widget: per-design print-area width in inches.
 *
 * Renders as `Print: [12.0]″` with hold-to-repeat steppers. Editable
 * directly via the numeric input. Clamped 1″-48″ — anything below 1″ is
 * unrealistic; above 48″ is bigger than any blank we sell.
 *
 * The studio's inches readout (DimensionReadout) and text-size-in-inches
 * conversions both consume this value, so changing it cascades through
 * the UI without saving — the inches you see WILL match what prints, as
 * long as production prints at this width.
 */

import { Maximize2 } from 'lucide-react';
import { HoldRepeatButton } from './HoldRepeatButton';

const STEP = 0.5;
const MIN = 1;
const MAX = 48;

interface CanvasSizeControlProps {
  value: number;
  onChange: (next: number) => void;
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 12;
  return Math.max(MIN, Math.min(MAX, Math.round(n * 10) / 10));
}

export function CanvasSizeControl({ value, onChange }: CanvasSizeControlProps) {
  return (
    <div className="hidden md:flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700">
      <Maximize2 className="h-3.5 w-3.5 text-gray-500" />
      <span className="font-medium">Print:</span>
      <HoldRepeatButton
        onPress={() => onChange(clamp(value - STEP))}
        className="px-1 text-gray-500 hover:text-gray-900"
        aria-label="Decrease print width"
      >
        −
      </HoldRepeatButton>
      <input
        type="number"
        min={MIN}
        max={MAX}
        step={0.1}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className="w-12 text-center border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500 rounded"
      />
      <span className="text-gray-500">″</span>
      <HoldRepeatButton
        onPress={() => onChange(clamp(value + STEP))}
        className="px-1 text-gray-500 hover:text-gray-900"
        aria-label="Increase print width"
      >
        +
      </HoldRepeatButton>
    </div>
  );
}
