/**
 * Phase 2 PR #14 — text effects panel (drop shadow, real stroke, gradient fill).
 *
 * Renders three collapsible sections, one per effect. Each section has a
 * single-checkbox enable toggle plus its parameter controls. Toggling off
 * sets the underlying field to undefined so saved designs round-trip cleanly
 * (no half-populated effect objects).
 *
 * Renderer-aware: this component drives `updateElement` like every other
 * panel, so legacy renderer users see the new fields populated but the
 * legacy CSS styling doesn't honor them — by design, since legacy is being
 * deleted in PR #15. Saved designs from legacy work in Fabric mode.
 */

import { useState } from 'react';

interface DesignElementEffects {
  shadow?: { offsetX: number; offsetY: number; blur: number; color: string };
  strokeColor?: string;
  strokeWidth?: number;
  gradient?: { colorA: string; colorB: string; angle: number };
}

interface TextEffectsPanelProps {
  element: DesignElementEffects & { id: string };
  onUpdate: (updates: Partial<DesignElementEffects>) => void;
}

export function TextEffectsPanel(props: TextEffectsPanelProps) {
  const [open, setOpen] = useState<'shadow' | 'stroke' | 'gradient' | null>(null);

  const shadowOn = !!props.element.shadow;
  const strokeOn = (props.element.strokeWidth ?? 0) > 0;
  const gradientOn = !!props.element.gradient;

  return (
    <div className="space-y-2">
      {/* Drop Shadow */}
      <Section
        title="Drop Shadow"
        on={shadowOn}
        expanded={open === 'shadow'}
        onToggleExpand={() => setOpen(open === 'shadow' ? null : 'shadow')}
        onToggleOn={(v) => {
          if (v) {
            props.onUpdate({ shadow: { offsetX: 2, offsetY: 2, blur: 4, color: 'rgba(0,0,0,0.5)' } });
            setOpen('shadow');
          } else {
            props.onUpdate({ shadow: undefined });
          }
        }}
      >
        {props.element.shadow && (
          <ShadowControls
            shadow={props.element.shadow}
            onChange={(next) => props.onUpdate({ shadow: next })}
          />
        )}
      </Section>

      {/* Stroke */}
      <Section
        title="Stroke"
        on={strokeOn}
        expanded={open === 'stroke'}
        onToggleExpand={() => setOpen(open === 'stroke' ? null : 'stroke')}
        onToggleOn={(v) => {
          if (v) {
            props.onUpdate({ strokeWidth: 2, strokeColor: '#000000' });
            setOpen('stroke');
          } else {
            props.onUpdate({ strokeWidth: 0, strokeColor: undefined });
          }
        }}
      >
        {strokeOn && (
          <StrokeControls
            strokeWidth={props.element.strokeWidth ?? 0}
            strokeColor={props.element.strokeColor ?? '#000000'}
            onChange={(w, c) => props.onUpdate({ strokeWidth: w, strokeColor: c })}
          />
        )}
      </Section>

      {/* Gradient */}
      <Section
        title="Gradient Fill"
        on={gradientOn}
        expanded={open === 'gradient'}
        onToggleExpand={() => setOpen(open === 'gradient' ? null : 'gradient')}
        onToggleOn={(v) => {
          if (v) {
            props.onUpdate({ gradient: { colorA: '#ff0066', colorB: '#ffcc00', angle: 0 } });
            setOpen('gradient');
          } else {
            props.onUpdate({ gradient: undefined });
          }
        }}
      >
        {props.element.gradient && (
          <GradientControls
            gradient={props.element.gradient}
            onChange={(next) => props.onUpdate({ gradient: next })}
          />
        )}
      </Section>
    </div>
  );
}

function Section(props: {
  title: string;
  on: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleOn: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between bg-gray-50 px-3 py-2">
        <button
          type="button"
          onClick={props.onToggleExpand}
          className="text-xs font-semibold text-gray-700 flex-1 text-left"
        >
          {props.title}
        </button>
        <label className="inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={props.on}
            onChange={(e) => props.onToggleOn(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-8 h-4 bg-gray-300 rounded-full peer-checked:bg-blue-600 transition relative">
            <div className="absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full transition peer-checked:translate-x-4" />
          </div>
        </label>
      </div>
      {props.expanded && props.on && <div className="px-3 py-3">{props.children}</div>}
    </div>
  );
}

function ShadowControls(props: {
  shadow: NonNullable<DesignElementEffects['shadow']>;
  onChange: (next: NonNullable<DesignElementEffects['shadow']>) => void;
}) {
  const s = props.shadow;
  return (
    <div className="space-y-2">
      <SliderRow label="Offset X" value={s.offsetX} min={-20} max={20} onChange={(v) => props.onChange({ ...s, offsetX: v })} />
      <SliderRow label="Offset Y" value={s.offsetY} min={-20} max={20} onChange={(v) => props.onChange({ ...s, offsetY: v })} />
      <SliderRow label="Blur" value={s.blur} min={0} max={30} onChange={(v) => props.onChange({ ...s, blur: v })} />
      <ColorRow label="Color" value={s.color} onChange={(v) => props.onChange({ ...s, color: v })} />
    </div>
  );
}

function StrokeControls(props: {
  strokeWidth: number;
  strokeColor: string;
  onChange: (w: number, c: string) => void;
}) {
  return (
    <div className="space-y-2">
      <SliderRow label="Width" value={props.strokeWidth} min={0} max={10} step={0.5} onChange={(v) => props.onChange(v, props.strokeColor)} />
      <ColorRow label="Color" value={props.strokeColor} onChange={(v) => props.onChange(props.strokeWidth, v)} />
    </div>
  );
}

function GradientControls(props: {
  gradient: NonNullable<DesignElementEffects['gradient']>;
  onChange: (next: NonNullable<DesignElementEffects['gradient']>) => void;
}) {
  const g = props.gradient;
  return (
    <div className="space-y-2">
      <ColorRow label="Color A" value={g.colorA} onChange={(v) => props.onChange({ ...g, colorA: v })} />
      <ColorRow label="Color B" value={g.colorB} onChange={(v) => props.onChange({ ...g, colorB: v })} />
      <SliderRow label="Angle" value={g.angle} min={0} max={360} onChange={(v) => props.onChange({ ...g, angle: v })} suffix="°" />
    </div>
  );
}

function SliderRow(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-gray-600 w-14">{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="flex-1 accent-blue-600"
      />
      <span className="text-[11px] text-gray-500 w-10 text-right tabular-nums">
        {props.value}{props.suffix ?? ''}
      </span>
    </div>
  );
}

function ColorRow(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-gray-600 w-14">{props.label}</span>
      <input
        type="color"
        value={normalizeForInput(props.value)}
        onChange={(e) => props.onChange(e.target.value)}
        className="h-7 w-7 rounded border border-gray-200 cursor-pointer"
      />
      <span className="text-[11px] text-gray-500 flex-1 truncate">{props.value}</span>
    </div>
  );
}

/**
 * <input type=color> only accepts #rrggbb — when our shadow color is
 * an rgba() string (the default), parse out the leading hex if any,
 * else fall back to black.
 */
function normalizeForInput(v: string): string {
  const hex = v.match(/^#([0-9a-fA-F]{6})/);
  if (hex) return '#' + hex[1];
  // For rgba() / named colors, drop alpha and approximate with the channel
  // RGB values. This is a UI nicety — the underlying value is preserved.
  const rgb = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) {
    const r = parseInt(rgb[1] ?? '0', 10);
    const g = parseInt(rgb[2] ?? '0', 10);
    const b = parseInt(rgb[3] ?? '0', 10);
    return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
  }
  return '#000000';
}
