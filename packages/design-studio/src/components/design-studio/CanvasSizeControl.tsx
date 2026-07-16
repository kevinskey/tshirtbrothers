/**
 * Header bar widget: per-design print-area W × H in inches.
 *
 * Renders as `Print: [12.0] × [16.0]″` with hold-to-repeat steppers on
 * each axis. Editable directly via the numeric inputs. Each axis clamped
 * to 1″-48″.
 *
 * Both values feed the studio's inches readout (DimensionReadout), the
 * text-size-in-inches conversion, AND the canvas's CSS aspect-ratio so
 * the design surface visually reflects the print rectangle.
 */

import { Maximize2 } from 'lucide-react';
import { HoldRepeatButton } from './HoldRepeatButton';

const STEP = 0.5;
const MIN = 1;
const MAX = 48;

interface CanvasSizeControlProps {
  width: number;
  height: number;
  onChangeWidth: (next: number) => void;
  onChangeHeight: (next: number) => void;
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 12;
  return Math.max(MIN, Math.min(MAX, Math.round(n * 10) / 10));
}

export function CanvasSizeControl({ width, height, onChangeWidth, onChangeHeight }: CanvasSizeControlProps) {
  return (
    <div className="hidden md:flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700">
      <Maximize2 className="h-3.5 w-3.5 text-gray-500" />
      <span className="font-medium">Print:</span>

      <Stepper value={width} onChange={onChangeWidth} label="width" />
      <span className="text-gray-400 px-0.5">×</span>
      <Stepper value={height} onChange={onChangeHeight} label="height" />

      <span className="text-gray-500">″</span>
    </div>
  );
}

function Stepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="flex items-center">
      <HoldRepeatButton
        onPress={() => onChange(clamp(value - STEP))}
        className="px-1 text-gray-500 hover:text-gray-900"
        aria-label={`Decrease ${label}`}
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
        aria-label={label}
      />
      <HoldRepeatButton
        onPress={() => onChange(clamp(value + STEP))}
        className="px-1 text-gray-500 hover:text-gray-900"
        aria-label={`Increase ${label}`}
      >
        +
      </HoldRepeatButton>
    </div>
  );
}
