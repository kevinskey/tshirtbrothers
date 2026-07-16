import { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import { Link, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFabricRendererFlag } from '@/components/design-studio/useFabricRendererFlag';
import type { FabricRendererBridgeHandle } from '@/components/design-studio/FabricRendererBridge';
import { LayersPanel } from '@/components/design-studio/LayersPanel';
import { useUndoRedo } from '@/components/design-studio/useUndoRedo';
import { FontPicker } from '@/components/design-studio/FontPicker';
import Seo from '@/components/Seo';
import { TextEffectsPanel } from '@/components/design-studio/TextEffectsPanel';
import { CropModal } from '@/components/design-studio/CropModal';
import { DimensionReadout } from '@/components/design-studio/DimensionReadout';
import { HoldRepeatButton } from '@/components/design-studio/HoldRepeatButton';
import { CanvasSizeControl } from '@/components/design-studio/CanvasSizeControl';
import { generateDesignImage } from '@/services/deepseek';

// Lazy-load the bridge so opentype.js + wawoff2 + Fabric stay out of the
// main bundle. The full Fabric chunk only downloads when ?canvas=fabric
// is set in the URL — every other visitor pays nothing for it.
const FabricRendererBridge = lazy(() =>
  import('@/components/design-studio/FabricRendererBridge').then((m) => ({
    default: m.FabricRendererBridge,
  })),
);
import {
  ArrowLeft,
  Upload,
  Type,
  Image,
  Shirt,
  Trash2,
  Search,
  ChevronDown,
  Save,
  X,
  Loader2,
  Move,
  Sparkles,
  Undo2,
  Redo2,
  Square,
  Circle,
  Triangle,
  Minus,
  Star,
  Heart,
  AlignCenter,
  Crop as CropIcon,
  Tag,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DesignElement {
  id: string;
  // 'shape' added for geometric primitives (rect, circle, triangle, line,
  // star, heart). Reuses `color` for fill, `strokeColor`/`strokeWidth` for
  // outline. shapeType picks which SVG primitive to render.
  type: 'image' | 'text' | 'shape';
  shapeType?: ShapeType;
  // Optional explicit height (% of canvas height). Currently used only by
  // shape elements so a circle / rect / etc can be sized non-square via
  // free corner-drag. Image/text elements ignore this — their height is
  // derived from natural aspect (image) or fontSize × lineHeight (text).
  height?: number;
  // Which side of the garment this element belongs to. Optional for
  // backwards-compat: any saved design from before this field existed has
  // no side stored, and we treat that as 'front'.
  side?: 'front' | 'back' | 'sleeve';
  x: number; // percent
  y: number; // percent
  width: number; // percent
  content: string; // text string or image data URL
  fontSize?: number;
  color?: string;
  fontFamily?: string;
  rotation?: number;
  textAlign?: 'left' | 'center' | 'right';
  outline?: boolean;
  textShape?: TextShapeName;
  shapeIntensity?: number; // 0-100
  letterSpacing?: number; // em units
  lineHeight?: number; // multiplier, e.g. 1.2
  wordSpacing?: number; // em units
  borderRadius?: number; // 0-50 percent
  opacity?: number; // 0-1
  filter?: 'none' | 'grayscale' | 'invert' | 'sepia' | 'bw';
  // Phase 2 PR #14: text effects (Fabric-only painting; round-trip safe).
  shadow?: { offsetX: number; offsetY: number; blur: number; color: string };
  strokeColor?: string;
  strokeWidth?: number;
  gradient?: { colorA: string; colorB: string; angle: number };
}

type TextShapeName = 'normal' | 'curve' | 'arch' | 'bridge' | 'valley' | 'pinch' | 'bulge' | 'perspective' | 'pointed' | 'downward' | 'upward' | 'cone' | 'circle' | 'circle-bottom';

const TEXT_SHAPES: { name: TextShapeName; label: string }[] = [
  { name: 'normal', label: 'NORMAL' },
  { name: 'curve', label: 'CURVE' },
  { name: 'arch', label: 'ARCH' },
  { name: 'bridge', label: 'BRIDGE' },
  { name: 'valley', label: 'VALLEY' },
  { name: 'pinch', label: 'PINCH' },
  { name: 'bulge', label: 'BULGE' },
  { name: 'perspective', label: 'PERSPECTIVE' },
  { name: 'pointed', label: 'POINTED' },
  { name: 'downward', label: 'DOWNWARD' },
  { name: 'upward', label: 'UPWARD' },
  { name: 'cone', label: 'CONE' },
  { name: 'circle', label: 'CIRCLE' },
  { name: 'circle-bottom', label: 'CIRCLE ↓' },
];

/* SVG paths for text shapes (viewBox 0 0 200 100) */
function getShapePath(shape: TextShapeName, intensity: number): string {
  const i = intensity / 100; // 0-1
  const d = Math.round(40 * i); // deflection amount
  switch (shape) {
    case 'curve': return `M 10,${50 + d} Q 100,${50 - d * 2} 190,${50 + d}`;
    case 'arch': return `M 10,${50 + d} Q 100,${50 - d * 2} 190,${50 + d}`;
    case 'bridge': return `M 10,${50 - d} Q 60,${50 + d} 100,${50 - d} Q 140,${50 + d} 190,${50 - d}`;
    case 'valley': return `M 10,${50 - d} Q 100,${50 + d * 2} 190,${50 - d}`;
    case 'pinch': return `M 10,${50 + d} Q 60,50 100,${50 + d} Q 140,50 190,${50 + d}`;
    case 'bulge': return `M 10,50 Q 60,${50 - d} 100,50 Q 140,${50 - d} 190,50`;
    case 'perspective': return `M 10,${50 + d} L 190,${50 - d}`;
    case 'pointed': return `M 10,${50 + d} L 100,${50 - d} L 190,${50 + d}`;
    case 'downward': return `M 10,${50 - d} Q 100,${50 + d * 2} 190,${50 - d}`;
    case 'upward': return `M 10,${50 + d} Q 100,${50 - d * 2} 190,${50 + d}`;
    case 'cone': return `M 10,${50 + d} L 100,${50 - d * 1.5} L 190,${50 + d}`;
    case 'circle': {
      const r = 40 + (i * 30);
      return `M 100,${100 - r} A ${r},${r} 0 1,1 99.99,${100 - r}`;
    }
    case 'circle-bottom': {
      const r2 = 40 + (i * 30);
      return `M 100,${100 + r2} A ${r2},${r2} 0 1,0 99.99,${100 + r2}`;
    }
    default: return 'M 10,50 L 190,50';
  }
}

function ShapedText({ text, shape, intensity, fontSize, color, fontFamily, outline, letterSpacing, wordSpacing }: {
  text: string; shape: TextShapeName; intensity: number;
  fontSize: number; color: string; fontFamily: string; outline?: boolean;
  letterSpacing?: number; wordSpacing?: number;
}) {
  if (shape === 'normal') return null; // handled by regular span
  // Include spacing in the ID so React re-creates the <textPath> when the
  // spacing changes (some browsers don't re-layout text-on-a-path when
  // letter-spacing is updated in place).
  const pathId = `shape-${shape}-${intensity}-${text.length}-${letterSpacing ?? 0}-${wordSpacing ?? 0}`;
  const path = getShapePath(shape, intensity);
  const isCircle = shape === 'circle' || shape === 'circle-bottom';
  const scaledSize = isCircle ? fontSize * 0.35 : fontSize * 0.5;
  const vb = isCircle ? '0 0 200 200' : '0 0 200 100';
  // Convert em-based spacing to SVG user units. letterSpacing = extra
  // space between every character; wordSpacing = extra space between
  // words (applied to space glyphs on top of letterSpacing).
  const letterDx = (letterSpacing ?? 0) * scaledSize;
  const wordDx = (wordSpacing ?? 0) * scaledSize;
  const textStyle: React.CSSProperties = {};
  if (outline) {
    textStyle.stroke = 'rgba(0,0,0,0.5)';
    textStyle.strokeWidth = 1;
    textStyle.paintOrder = 'stroke fill';
  }
  // Render each character as its own <tspan> with an explicit dx offset —
  // this is the only reliable way to control spacing on text following a
  // path across Chrome, Safari and Firefox (SVG letter-spacing is spotty
  // inside textPath).
  const chars = Array.from(text);
  return (
    <svg viewBox={vb} className="w-full" style={{ overflow: 'visible' }}>
      <defs>
        <path id={pathId} d={path} fill="none" />
      </defs>
      <text
        fill={color}
        fontFamily={fontFamily}
        fontSize={scaledSize}
        fontWeight="700"
        textAnchor="middle"
        style={textStyle}
      >
        <textPath href={`#${pathId}`} startOffset="50%">
          {chars.map((ch, i) => {
            // First character has no leading offset. Subsequent characters
            // get letter spacing, and if the *previous* char was a space we
            // add word spacing on top.
            let dx = 0;
            if (i > 0) {
              dx = letterDx;
              if (chars[i - 1] === ' ') dx += wordDx;
            }
            return (
              <tspan key={i} dx={dx || undefined}>{ch === ' ' ? '\u00A0' : ch}</tspan>
            );
          })}
        </textPath>
      </text>
    </svg>
  );
}

/**
 * SVG primitives for the geometric Shapes feature. All use a 0 0 100 100
 * viewBox so they fill whatever bounding box the parent absolute-div
 * provides — same scaling story as <img w-full> for image elements.
 *
 * Shape paths are defined here once and consumed by the on-canvas SVG
 * renderer below; the handleSaveToLibrary export uses an equivalent
 * Canvas-2D path (kept in sync by hand — small enough that abstracting
 * isn't worth it).
 */
const SHAPE_VIEWBOX_STAR = '50,5 61.3,38.4 96.4,38.4 67.6,60.5 78.5,93.9 50,73.6 21.5,93.9 32.4,60.5 3.6,38.4 38.7,38.4';
const SHAPE_VIEWBOX_TRIANGLE = '50,5 95,95 5,95';
const SHAPE_PATH_HEART = 'M 50,82 C 22,60 5,42 5,28 C 5,12 18,5 30,5 C 38,5 45,9 50,15 C 55,9 62,5 70,5 C 82,5 95,12 95,28 C 95,42 78,60 50,82 Z';

function ShapeSvg({ shape, fill, stroke, strokeWidth, opacity }: {
  shape: 'rect' | 'circle' | 'triangle' | 'line' | 'star' | 'heart';
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}) {
  const sw = strokeWidth ?? 0;
  const fillProp = shape === 'line' ? 'none' : fill;
  // Inset the geometry by half the stroke so the outline doesn't get
  // clipped at the SVG edges. Tiny but visible at thicker strokes.
  const inset = sw / 2;
  return (
    <svg
      viewBox="0 0 100 100"
      className="w-full h-full block pointer-events-none"
      style={{ opacity: opacity != null ? opacity : undefined, overflow: 'visible' }}
      preserveAspectRatio="none"
    >
      {shape === 'rect' && (
        <rect x={inset} y={inset} width={100 - sw} height={100 - sw}
          fill={fillProp} stroke={stroke} strokeWidth={sw} />
      )}
      {shape === 'circle' && (
        <circle cx={50} cy={50} r={50 - inset}
          fill={fillProp} stroke={stroke} strokeWidth={sw} />
      )}
      {shape === 'triangle' && (
        <polygon points={SHAPE_VIEWBOX_TRIANGLE}
          fill={fillProp} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
      )}
      {shape === 'line' && (
        <line x1={5} y1={50} x2={95} y2={50}
          stroke={stroke || fill} strokeWidth={sw || 6} strokeLinecap="round" />
      )}
      {shape === 'star' && (
        <polygon points={SHAPE_VIEWBOX_STAR}
          fill={fillProp} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
      )}
      {shape === 'heart' && (
        <path d={SHAPE_PATH_HEART}
          fill={fillProp} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
      )}
    </svg>
  );
}

const FONT_OPTIONS = [
  // Sans-serif
  'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Raleway',
  'Nunito', 'Ubuntu', 'Oswald', 'Rubik', 'Work Sans', 'Quicksand', 'Mulish',
  'Barlow', 'Karla', 'Cabin', 'Exo 2', 'Titillium Web', 'Varela Round',
  'Archivo', 'Outfit', 'Sora', 'DM Sans', 'Space Grotesk', 'Manrope',
  'Plus Jakarta Sans', 'Albert Sans', 'Figtree',
  // Athletic / sports / heavy display — t-shirt staples
  'Bebas Neue', 'Anton', 'Oswald', 'Fjalla One', 'Big Shoulders Display',
  'Squada One', 'Faster One', 'Racing Sans One', 'Saira Condensed',
  'Teko', 'Yanone Kaffeesatz', 'Khand', 'Staatliches', 'Saira Stencil One',
  // Serif
  'Playfair Display', 'Merriweather', 'Lora', 'PT Serif', 'Bitter', 'Libre Baskerville',
  'EB Garamond', 'Crimson Text', 'Cormorant Garamond', 'Spectral', 'Source Serif 4',
  'DM Serif Display', 'Noto Serif', 'Abril Fatface', 'Cinzel',
  'Yeseva One', 'Prata', 'Cardo', 'Old Standard TT',
  // Display / Decorative — popular for apparel
  'Righteous', 'Passion One', 'Bungee', 'Bangers',
  'Fredoka One', 'Lobster', 'Pacifico', 'Permanent Marker', 'Press Start 2P',
  'Russo One', 'Orbitron', 'Audiowide', 'Black Ops One', 'Bungee Shade',
  'Bungee Outline', 'Bungee Inline', 'Bungee Spice',
  'Creepster', 'Fascinate Inline', 'Monoton', 'Sigmar One',
  'Special Elite', 'Titan One', 'Ultra', 'Alfa Slab One', 'Bowlby One',
  'Concert One', 'Knewave', 'Modak', 'Frijole', 'Limelight',
  'Sansita', 'Shrikhand', 'Nosifer', 'Eater', 'Pirata One',
  'Rampart One', 'Codystar',
  // Rubik distressed/textured family — cut/printed-look styles
  'Rubik Mono One', 'Rubik Bubbles', 'Rubik Glitch', 'Rubik Iso',
  'Rubik Vinyl', 'Rubik Marker Hatched', 'Rubik Beastly',
  'Rubik Spray Paint', 'Rubik Wet Paint', 'Rubik Puddles',
  'Rubik Burned', 'Rubik 80s Fade',
  'Rubik Lines', 'Rubik Maze', 'Rubik Pixels',
  // Handwriting / Script
  'Dancing Script', 'Great Vibes', 'Sacramento', 'Satisfy', 'Kalam',
  'Caveat', 'Indie Flower', 'Shadows Into Light', 'Patrick Hand', 'Architects Daughter',
  'Amatic SC', 'Gloria Hallelujah', 'Covered By Your Grace', 'Rock Salt',
  'Kaushan Script', 'Gochi Hand', 'Oleo Script', 'Pinyon Script',
  'Stalemate', 'Henny Penny', 'Yellowtail', 'Allura', 'Tangerine',
  'Marck Script', 'Zeyada', 'Homemade Apple',
  // Gothic / blackletter
  'UnifrakturMaguntia', 'UnifrakturCook', 'MedievalSharp',
  // Monospace / pixel / tech
  'Roboto Mono', 'Source Code Pro', 'Fira Code', 'JetBrains Mono', 'Space Mono', 'DM Mono',
  'VT323', 'Wallpoet',
  // System fallbacks
  'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Verdana', 'Comic Sans MS',
];

// Track which Google Fonts have been loaded
const loadedFonts = new Set<string>();
const SYSTEM_FONTS = ['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Verdana', 'Comic Sans MS', 'Inter'];

// Fonts that only ship in a single weight on Google Fonts (display fonts,
// the Rubik distressed family, etc). Requesting :wght@400;700 for these
// makes the CSS API silently 400 the whole request — they need a name-only
// or :wght@400 URL.
const SINGLE_WEIGHT_FONTS = new Set([
  'Bungee Outline', 'Bungee Inline', 'Bungee Spice', 'Bungee Shade',
  'Rubik Mono One', 'Rubik Bubbles', 'Rubik Glitch', 'Rubik Iso',
  'Rubik Vinyl', 'Rubik Marker Hatched', 'Rubik Beastly',
  'Rubik Spray Paint', 'Rubik Wet Paint', 'Rubik Puddles',
  'Rubik Burned', 'Rubik 80s Fade', 'Rubik Lines', 'Rubik Maze', 'Rubik Pixels',
  'Press Start 2P', 'VT323', 'Wallpoet', 'Codystar', 'Modak',
  'Frijole', 'Limelight', 'Shrikhand', 'Nosifer', 'Eater', 'Pirata One',
  'Rampart One', 'Sigmar One', 'Titan One', 'Ultra', 'Bowlby One',
  'Concert One', 'Knewave', 'Faster One', 'Squada One', 'Saira Stencil One',
  'Staatliches', 'Alfa Slab One', 'Russo One', 'Audiowide', 'Black Ops One',
  'Creepster', 'Fascinate Inline', 'Monoton', 'Special Elite',
  'Bangers', 'Fredoka One', 'Lobster', 'Pacifico', 'Permanent Marker',
  'Anton', 'Bebas Neue', 'Righteous', 'Passion One', 'Bungee', 'Racing Sans One',
  'Yeseva One', 'Abril Fatface', 'Sansita',
  'Stalemate', 'Henny Penny', 'Yellowtail', 'Allura', 'Tangerine',
  'Marck Script', 'Zeyada', 'Homemade Apple', 'Great Vibes', 'Sacramento',
  'Satisfy', 'Dancing Script', 'Kaushan Script', 'Gochi Hand', 'Oleo Script',
  'Pinyon Script', 'Indie Flower', 'Shadows Into Light', 'Rock Salt',
  'Amatic SC', 'Gloria Hallelujah', 'Covered By Your Grace',
  'UnifrakturMaguntia', 'UnifrakturCook', 'MedievalSharp',
]);

function googleFontUrl(fontName: string): string {
  const family = fontName.replace(/ /g, '+');
  // Single-weight display fonts: omit the wght axis entirely so the CSS
  // API serves whatever weights the font actually has.
  if (SINGLE_WEIGHT_FONTS.has(fontName)) {
    return `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
  }
  return `https://fonts.googleapis.com/css2?family=${family}:wght@400;700&display=swap`;
}

function loadGoogleFont(fontName: string): Promise<void> {
  if (SYSTEM_FONTS.includes(fontName) || loadedFonts.has(fontName)) return Promise.resolve();
  loadedFonts.add(fontName);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = googleFontUrl(fontName);
  document.head.appendChild(link);
  // Wait for the font to actually load
  return document.fonts.ready.then(() => {});
}

// Preload a batch of fonts (for the font list preview)
let fontsPreloaded = false;
function preloadAllFonts() {
  if (fontsPreloaded) return;
  fontsPreloaded = true;
  // Load all fonts in one request using Google Fonts API. Use the per-font
  // weight specifier so single-weight families work alongside multi-weight.
  const googleFonts = FONT_OPTIONS.filter(f => !SYSTEM_FONTS.includes(f));
  const families = googleFonts.map((f) => {
    const family = f.replace(/ /g, '+');
    return SINGLE_WEIGHT_FONTS.has(f) ? `family=${family}` : `family=${family}:wght@700`;
  }).join('&');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  document.head.appendChild(link);
  googleFonts.forEach(f => loadedFonts.add(f));
}

interface ProductColor {
  name: string;
  hex: string;
  image?: string;
  backImage?: string;
}

interface Product {
  ss_id: string;
  name: string;
  brand: string;
  image_url: string;
  back_image_url?: string;
  colors: ProductColor[];
  category: string;
}

type ToolName = 'upload' | 'text' | 'art' | 'shapes' | 'products' | 'details' | 'names' | 'ai' | null;
// Geometric shape types renderable as SVG inside a positioned div.
type ShapeType = 'rect' | 'circle' | 'triangle' | 'line' | 'star' | 'heart';
type ViewName = 'front' | 'back' | 'sleeve';

// Default product when none is passed via ?product=. Use the basic flat
// product photo (Gildan Unisex Heavy Cotton, S&S style 16 — the
// classic Gildan 5000) rather than the Softstyle (ss_id 39), which
// ships with a model photo that distracts from the design surface and
// recolors awkwardly on swatch change.
const DEFAULT_PRODUCT_SSID = '16';

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DesignStudioPage() {
  const [searchParams] = useSearchParams();
  const initialProductId = searchParams.get('product') || '';
  // When set, the studio is acting as the mockup editor for an admin invoice.
  // Shows a "Save Mockup to Invoice" CTA that renders front + (optional) back
  // composites, attaches them to a mockup row tied to the invoice, then
  // navigates back to the admin invoice editor.
  const attachToInvoiceId = searchParams.get('attachToInvoice') || '';
  // When set, the studio is acting as the editor for an existing mockup row.
  // Hydrates product / canvas dims / elements from the mockup on mount and
  // saves back via PATCH instead of POST.
  const editMockupId = searchParams.get('editMockup') || '';
  // When set (no edit/attach context), saving creates a brand-new mockup
  // row via the same screenshot flow used elsewhere.
  const newMockupMode = searchParams.get('newMockup') === '1';
  // Auth gate — require login before designing
  const authNav = useNavigate();
  useEffect(() => {
    const token = localStorage.getItem('tsb_token');
    if (!token) {
      authNav('/auth?redirect=' + encodeURIComponent(window.location.pathname + window.location.search) + '&reason=design');
    }
  }, [authNav]);


  const location = useLocation();
  // `elements` widened to DesignElement[] | object — a row saved through
  // the Fabric renderer arrives as an object with `schemaVersion: 2`.
  const loadState = location.state as { loadDesign?: boolean; designId?: number; designName?: string; elements?: DesignElement[] | { schemaVersion?: number; [key: string]: unknown }; colorIndex?: number; backTo?: string; canvasInches?: number; canvasInchesH?: number } | null;

  // --- Core state ---
  const navigate = useNavigate();
  // Used to invalidate the admin mockups list whenever we POST/PATCH a
  // mockup from here — otherwise React Query keeps serving the pre-save
  // cache and the new (or freshly edited) row doesn't appear until the
  // admin clicks Re-render (which incidentally invalidates the cache).
  const studioQueryClient = useQueryClient();
  // Welcome panel is gone — the left rail (Upload, Add Text, Add Art,
  // Shapes, AI Design, Change Color, Change Products) covers every option
  // it offered, so showing both at once was pure redundancy. The state
  // sticks around as a no-op so existing setShowWelcome(false) calls
  // don't have to be unwound.
  const [showWelcome, setShowWelcome] = useState(false);
  // No tool is auto-activated on load — the user picks one from the
  // left rail (or the mobile bottom toolbar) when they're ready. This
  // keeps the canvas/product the first thing they see.
  const [activeTool, setActiveTool] = useState<ToolName>(null);
  // AI Design panel state — bare prompt → image, no chat persona.
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  // Shapes panel — settings applied to the *next* shape the user drops.
  // 'outline' renders fill=none, stroke=shapeColor at shapeStrokeWidth%
  // of the SVG viewBox. 'fill' renders fill=shapeColor with no stroke.
  const [shapeFillMode, setShapeFillMode] = useState<'fill' | 'outline'>('fill');
  const [shapeColor, setShapeColor] = useState<string>('#111827');
  const [shapeStrokeWidth, setShapeStrokeWidth] = useState<number>(4);

  // Tracks the iOS / Android soft-keyboard height. fixed-position elements
  // are anchored to the layout viewport, so without this the bottom Add-Text
  // panel sits *behind* the open keyboard. We measure how much shorter the
  // visual viewport is than the layout viewport and lift the panel by that
  // amount.
  const [kbInset, setKbInset] = useState(0);
  // Track the actual *visual* viewport width so we can pin the mobile
  // tool-panel to it. document.documentElement.clientWidth returns the
  // layout viewport, which on iOS Chrome can be wider than what's
  // actually visible — that's why even a JS-set width was leaking past
  // the right edge.
  const [vpWidth, setVpWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    return window.visualViewport?.width ?? document.documentElement.clientWidth;
  });
  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => {
      setVpWidth(vv?.width ?? document.documentElement.clientWidth);
      if (!vv) return;
      const inset = window.innerHeight - vv.height - vv.offsetTop;
      setKbInset(inset > 80 ? inset : 0);
    };
    update();
    window.addEventListener('resize', update);
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
    };
  }, []);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedColorIdx, setSelectedColorIdx] = useState(loadState?.colorIndex || 0);
  const [userPickedColor, setUserPickedColor] = useState(!!loadState?.colorIndex);
  const [currentView, setCurrentView] = useState<ViewName>('front');
  // Closed by default — customer opens it from the "Sides" button on the
  // left rail (or the bottom nav on mobile) when they want to switch
  // between front / back / sleeve.
  const [viewSwitcherOpen, setViewSwitcherOpen] = useState(false);
  const [designElements, setDesignElements] = useState<DesignElement[]>(
    Array.isArray(loadState?.elements) ? (loadState!.elements as DesignElement[]) : [],
  );
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [designName, setDesignName] = useState(loadState?.designName || 'Untitled design');
  const [isEditingName, setIsEditingName] = useState(false);
  const [savedDesignId, setSavedDesignId] = useState<number | null>(loadState?.designId ?? null);
  const [isSaving, setIsSaving] = useState(false);

  // Per-design print-area W × H in inches. Default 12 × 12. Hydrated from
  // loadState if a saved design was opened. Drives the DimensionReadout,
  // text-size-in-inches conversions, and the canvas's CSS aspect ratio.
  const [canvasInches, setCanvasInches] = useState<number>(
    typeof loadState?.canvasInches === 'number' && loadState.canvasInches > 0
      ? loadState.canvasInches
      : 12,
  );
  const [canvasInchesH, setCanvasInchesH] = useState<number>(
    typeof loadState?.canvasInchesH === 'number' && loadState.canvasInchesH > 0
      ? loadState.canvasInchesH
      : 12,
  );

  // Display zoom — multiplier on the canvas surface's width. 1.0 = fit
  // viewport (the legacy responsive behavior). > 1 makes the canvas
  // overflow the main, which has overflow-auto so horizontal + vertical
  // scrollbars appear. UX-only: doesn't change saved coords or print
  // size, just the on-screen working area.
  const [canvasZoom, setCanvasZoom] = useState<number>(() => {
    // Phones get a 1.25x default so the product fills more of the screen;
    // main is overflow-auto so the small horizontal overflow turns into a
    // swipe rather than a layout break. Desktop stays at 1.0.
    if (typeof window !== 'undefined' && window.innerWidth < 768) return 1.25;
    return 1;
  });
  // Conversion factor: legacy fontSize is in 800-px reference units, where
  // the full canvas width = 800px. canvas_inches inches map to those 800
  // units, so 1 inch = 800 / canvasInches reference units.
  const fontInchesPerUnit = canvasInches / 800;
  const fontUnitsPerInch = 800 / canvasInches;
  const fontSizeInches = (px: number) => px * fontInchesPerUnit;
  const inchesToFontSize = (inches: number) => Math.max(1, Math.round(inches * fontUnitsPerInch));

  // ─── Fabric renderer toggle ────────────────────────────────────────────
  // ?canvas=fabric on the URL turns on the new renderer. Existence-only flag —
  // see useFabricRendererFlag for the policy. The bridge ref exposes the
  // imperative handle (exportPNG, getDesignJSON) for save handlers.
  const useFabricRenderer = useFabricRendererFlag();
  const fabricBridgeRef = useRef<FabricRendererBridgeHandle | null>(null);

  // ─── Undo / redo (Phase 2 PR #11) ──────────────────────────────────────
  // Auto-snapshot designElements via a useEffect below. Stack is shared
  // across renderer modes — undo is part of the surrounding page, not
  // gated on ?canvas=fabric. (Fabric users will use it more because they
  // can see what's happening, but legacy users get the keyboard shortcuts
  // too.)
  const undoRedo = useUndoRedo<DesignElement[]>(designElements);

  // Auto-snapshot every change to designElements onto the undo stack.
  // Skipped during replay — undo() / redo() set isReplaying.current = true,
  // call setDesignElements, then we land here, see the flag, and don't
  // re-push (which would erase the redo history).
  useEffect(() => {
    if (undoRedo.isReplaying.current) {
      undoRedo.isReplaying.current = false;
      return;
    }
    undoRedo.push(designElements);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designElements]);

  // Keyboard shortcuts: Cmd/Ctrl+Z = undo, Cmd/Ctrl+Shift+Z = redo. Don't
  // intercept while typing in an input (font name, design name field, etc.).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement | null)?.isContentEditable) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== 'z' && e.key !== 'Z') return;
      e.preventDefault();
      const snapshot = e.shiftKey ? undoRedo.redo() : undoRedo.undo();
      if (snapshot !== null) {
        undoRedo.isReplaying.current = true;
        setDesignElements(snapshot);
        setSelectedElementId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undoRedo]);

  // Captured at first load when loadState.elements is a v1 array. Persists
  // for the page session so the save handler can ship it as the sidecar
  // (elements_legacy) the first time we overwrite the row with v2.
  const [originalLegacyPayload] = useState<DesignElement[] | null>(() =>
    Array.isArray(loadState?.elements) ? (loadState!.elements as DesignElement[]) : null,
  );
  // Detect "this row is already v2" — a legacy-mode user trying to open a
  // design previously saved through Fabric mode. Show the cross-over guard
  // instead of attempting to render.
  const incomingIsV2 =
    !!loadState?.elements &&
    !Array.isArray(loadState.elements) &&
    (loadState.elements as { schemaVersion?: number }).schemaVersion === 2;

  // Admin "Save to Art Library" — composes whatever elements are currently
  // on the front side into a transparent PNG and uploads it as a design
  // asset (no product needed). Visible only when an admin Bearer token is
  // present in localStorage (customers use cookie auth, not tsb_token).
  const [librarySaveOpen, setLibrarySaveOpen] = useState(false);
  // Set when admin chose 'Blank Canvas' from the welcome panel. Suppresses
  // the customer-facing 'Select a product to start designing' empty state.
  // blankCanvasMode was toggled from the now-removed welcome panel's
  // admin-only "Blank" button. The state stays in place (always false)
  // so the existing conditional render keeps working — the entry point
  // can be re-added to the left rail if needed.
  const [blankCanvasMode] = useState(false);
  const [librarySaveName, setLibrarySaveName] = useState('');
  const [librarySaveCategory, setLibrarySaveCategory] = useState('general');
  const [librarySaving, setLibrarySaving] = useState(false);
  const [isAdmin] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem('tsb_token');
  });


  async function handleSaveToLibrary() {
    if (!librarySaveName.trim() || librarySaving) return;
    const front = designElements.filter(el => (el.side ?? 'front') === 'front');
    if (front.length === 0) { alert('Place at least one text or image element before saving to the library.'); return; }
    setLibrarySaving(true);
    const withTimeout = async <T,>(p: Promise<T>, ms: number, label: string): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
      });
      try {
        return await Promise.race([p, timeout]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    // Use the same html2canvas path the mockup save uses (which works).
    // Hiding the product image first caused html2canvas to stall — keep
    // it visible. The library item ends up including the shirt backdrop;
    // we can crop / remove the background as a follow-up.
    const surface = designSurfaceRef.current;
    if (!surface) { setLibrarySaving(false); alert('Save failed: no canvas'); return; }
    const prevSelected = selectedElementId;
    setSelectedElementId(null);

    try {
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      console.log('[saveToLibrary] capturing surface PNG (excluding product photo)…');
      const html2canvas = (await import('html2canvas')).default;
      const productImg = productImgRef.current;
      const cv = await withTimeout(
        html2canvas(surface, {
          backgroundColor: null,
          useCORS: true,
          scale: 2,
          logging: false,
          // Tell html2canvas to skip the product photo entirely. Hiding via
          // visibility:hidden previously made it stall — ignoreElements is
          // the well-supported way to drop a node before render.
          ignoreElements: (el) => el === productImg,
        }),
        30_000,
        'render',
      );

      // Auto-crop the captured canvas to the non-transparent bounding box
      // so the library asset is sized to the design, not the full surface.
      // Scans alpha channel for the tightest box of visible pixels and
      // copies that region into a new canvas.
      const tight = (() => {
        const ctx = cv.getContext('2d');
        if (!ctx) return cv;
        let img: ImageData;
        try {
          img = ctx.getImageData(0, 0, cv.width, cv.height);
        } catch {
          return cv;
        }
        const { data, width: W, height: H } = img;
        let minX = W, minY = H, maxX = -1, maxY = -1;
        const stride = 8; // 8x faster scan with negligible accuracy loss
        for (let y = 0; y < H; y += stride) {
          const rowOff = y * W * 4;
          for (let x = 0; x < W; x += stride) {
            const a = data[rowOff + x * 4 + 3]!;
            if (a > 10) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        if (maxX < 0) return cv; // fully transparent — leave as-is
        // Refine edges to within `stride` px so trim is tight.
        const padding = 4;
        minX = Math.max(0, minX - stride - padding);
        minY = Math.max(0, minY - stride - padding);
        maxX = Math.min(W - 1, maxX + stride + padding);
        maxY = Math.min(H - 1, maxY + stride + padding);
        const cw = maxX - minX + 1;
        const ch = maxY - minY + 1;
        if (cw <= 0 || ch <= 0 || (cw === W && ch === H)) return cv;
        const out = document.createElement('canvas');
        out.width = cw;
        out.height = ch;
        const octx = out.getContext('2d');
        if (!octx) return cv;
        octx.drawImage(cv, minX, minY, cw, ch, 0, 0, cw, ch);
        return out;
      })();

      const dataUrl = tight.toDataURL('image/png');
      console.log('[saveToLibrary] render ok, cropped to', tight.width, 'x', tight.height, '— bytes ≈', Math.round(dataUrl.length / 1024), 'KB');

      const token = getAuthToken();
      console.log('[saveToLibrary] uploading…');
      const uploadRes = await withTimeout(fetch('/api/quotes/upload-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          imageBase64: dataUrl,
          filename: librarySaveName.replace(/\s+/g, '-').toLowerCase() + '.png',
          customerEmail: 'admin-studio',
        }),
      }), 30_000, 'upload');
      if (!uploadRes.ok) throw new Error(`Upload failed (HTTP ${uploadRes.status})`);
      const { url } = await uploadRes.json();

      console.log('[saveToLibrary] saving library record…');
      const saveRes = await withTimeout(fetch('/api/admin/designs-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: librarySaveName.trim(),
          image_url: url,
          category: librarySaveCategory,
          tags: [],
        }),
      }), 15_000, 'save');
      if (!saveRes.ok) throw new Error(`Library save failed (HTTP ${saveRes.status})`);
      console.log('[saveToLibrary] done');

      // Close the dialog silently on success — no extra alert.
      setLibrarySaveOpen(false);
      setLibrarySaveName('');
    } catch (e) {
      console.error('[saveToLibrary] error:', e);
      alert(`Save failed: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      if (prevSelected) setSelectedElementId(prevSelected);
      setLibrarySaving(false);
    }
  }

  // Screenshot the studio's "product photo + design overlay" surface
  // exactly as the admin sees it, upload the PNG, and return the URL.
  // Replaces the server-side compose math — what you see is what saves.
  // Switches the visible side first (Fabric: via the bridge; legacy: by
  // setting currentView) and waits a frame so the canvas paints before
  // html2canvas reads it. Restores the previously-visible side after.
  async function captureSideScreenshot(side: ViewName): Promise<string | null> {
    const els = designElements.filter((e) => (e.side ?? 'front') === side);
    if (els.length === 0) return null;
    const surface = designSurfaceRef.current;
    if (!surface) return null;
    const prevView = currentView;
    if (useFabricRenderer && fabricBridgeRef.current) {
      fabricBridgeRef.current.setSide(side);
    } else if (prevView !== side) {
      setCurrentView(side);
    }
    // Clear selection so dashed selection borders / handles don't appear
    // in the screenshot. Wait two frames to let the browser repaint after
    // both the side switch and the selection clear.
    const prevSelected = selectedElementId;
    setSelectedElementId(null);
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    let dataUrl: string;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const cv = await html2canvas(surface, {
        backgroundColor: null,
        useCORS: true,
        scale: 2,
        logging: false,
      });
      dataUrl = cv.toDataURL('image/png');
    } finally {
      // Restore both the visible side and the previous selection.
      if (useFabricRenderer && fabricBridgeRef.current) {
        fabricBridgeRef.current.setSide(prevView);
      } else if (prevView !== side) {
        setCurrentView(prevView);
      }
      if (prevSelected) setSelectedElementId(prevSelected);
    }

    // Upload PNG to Spaces. The mockup row stores this URL directly as
    // preview_image_url — no server compose needed.
    const token = getAuthToken();
    const up = await fetch('/api/quotes/upload-design', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ imageBase64: dataUrl, filename: `mockup-screenshot-${Date.now()}-${side}.png`, customerEmail: 'admin-studio-mockup' }),
    });
    if (!up.ok) return null;
    const { url } = await up.json();
    return url || null;
  }

  // ─── Attach-to-invoice mockup save ──────────────────────────────────
  // When the studio was launched from the admin Create Invoice screen
  // (?attachToInvoice=<id>), render front + back design PNGs, upload them,
  // ask the server to composite each onto the product image, then create a
  // mockup row tied to the invoice and navigate back to the admin editor.
  const [savingInvoiceMockup, setSavingInvoiceMockup] = useState(false);
  async function handleSaveMockupToInvoice() {
    if (!attachToInvoiceId || savingInvoiceMockup) return;
    const productImg = selectedProduct ? (productColors[selectedColorIdx]?.image || selectedProduct.image_url) : null;
    if (!productImg) { alert('Pick a product first — the mockup needs a shirt photo to render onto.'); return; }
    const hasFront = designElements.some((e) => (e.side ?? 'front') === 'front');
    const hasBack = designElements.some((e) => (e.side ?? 'front') === 'back');
    if (!hasFront && !hasBack) { alert('Add at least one element to the front or back before saving the mockup.'); return; }

    setSavingInvoiceMockup(true);
    try {
      const token = getAuthToken();
      // Capture each side as it currently appears in the studio. Runs
      // sequentially because each captureSideScreenshot temporarily flips
      // currentView; parallel captures would race each other.
      const frontUrl = hasFront ? await captureSideScreenshot('front') : null;
      const backUrl = hasBack ? await captureSideScreenshot('back') : null;

      const create = await fetch('/api/admin/mockups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: designName && designName !== 'Untitled design' ? designName : `Invoice ${attachToInvoiceId} Mockup`,
          invoice_id: Number(attachToInvoiceId),
          product_id: null,
          product_ss_id: selectedProduct?.ss_id || null,
          product_name: selectedProduct?.name || null,
          product_image_url: productImg,
          preview_image_url: frontUrl,
          preview_image_url_back: backUrl,
          design_elements: designElements,
          design_canvas_inches: canvasInches,
          design_canvas_inches_h: canvasInchesH,
          design_color_index: selectedColorIdx,
          // Per-side print-zone rectangles in % of the product photo.
          // The mockups table's `placement` JSONB now holds the per-side
          // shape — legacy single-rect rows stay valid because reads
          // accept either format.
          placement,
          status: 'draft',
        }),
      });
      if (!create.ok) throw new Error('mockup save failed');

      // Force the admin mockups/invoice queries to refetch on landing so the
      // new mockup/preview shows immediately instead of waiting for the
      // user to click Re-render (which used to be the unintended cache
      // invalidator).
      // refetch (not invalidate) so this awaits — otherwise the navigate
      // below races the refetch and AdminPage mounts on the stale cache.
      await Promise.all([
        studioQueryClient.refetchQueries({ queryKey: ['mockups'] }),
        studioQueryClient.refetchQueries({ queryKey: ['admin', 'invoices'] }),
      ]);
      // Return to admin invoice editor with the new invoice id loaded.
      navigate(`/admin?section=invoices&editInvoice=${encodeURIComponent(attachToInvoiceId)}`);
    } catch (e) {
      alert(`Mockup save failed: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setSavingInvoiceMockup(false);
    }
  }

  // ─── Save edits back to an existing mockup row ──────────────────────
  // PATCHes /admin/mockups/<id> with fresh composite URLs + the elements
  // so opening the mockup again rehydrates the same design.
  const [savingMockupEdit, setSavingMockupEdit] = useState(false);
  // ─── New standalone mockup (no invoice, no edit) ────────────────────
  // Saves a fresh mockups row via the same screenshot flow used by the
  // invoice + edit paths. The Mockups page's "+ New Mockup" routes here.
  const [savingNewMockup, setSavingNewMockup] = useState(false);
  async function handleSaveNewMockup() {
    if (!newMockupMode || savingNewMockup) return;
    const productImg = selectedProduct ? (productColors[selectedColorIdx]?.image || selectedProduct.image_url) : null;
    if (!productImg) { alert('Pick a product first.'); return; }
    const hasFront = designElements.some((e) => (e.side ?? 'front') === 'front');
    const hasBack = designElements.some((e) => (e.side ?? 'front') === 'back');
    if (!hasFront && !hasBack) { alert('Add at least one element to the front or back before saving the mockup.'); return; }

    setSavingNewMockup(true);
    try {
      const token = getAuthToken();
      const frontUrl = hasFront ? await captureSideScreenshot('front') : null;
      const backUrl = hasBack ? await captureSideScreenshot('back') : null;

      const create = await fetch('/api/admin/mockups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: designName && designName !== 'Untitled design' ? designName : `Mockup ${new Date().toISOString().slice(0, 10)}`,
          product_ss_id: selectedProduct?.ss_id || null,
          product_name: selectedProduct?.name || null,
          product_image_url: productImg,
          preview_image_url: frontUrl,
          preview_image_url_back: backUrl,
          design_elements: designElements,
          design_canvas_inches: canvasInches,
          design_canvas_inches_h: canvasInchesH,
          design_color_index: selectedColorIdx,
          // Per-side print-zone rectangles in % of the product photo.
          // The mockups table's `placement` JSONB now holds the per-side
          // shape — legacy single-rect rows stay valid because reads
          // accept either format.
          placement,
          status: 'draft',
        }),
      });
      if (!create.ok) throw new Error('mockup save failed');

      await studioQueryClient.refetchQueries({ queryKey: ['mockups'] });
      navigate('/admin?section=mockups');
    } catch (e) {
      alert(`Mockup save failed: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setSavingNewMockup(false);
    }
  }

  async function handleSaveMockupEdit() {
    if (!editMockupId || savingMockupEdit) return;
    const productImg = selectedProduct ? (productColors[selectedColorIdx]?.image || selectedProduct.image_url) : null;
    if (!productImg) { alert('Pick a product first.'); return; }
    setSavingMockupEdit(true);
    try {
      const token = getAuthToken();
      const hasFront = designElements.some((e) => (e.side ?? 'front') === 'front');
      const hasBack = designElements.some((e) => (e.side ?? 'front') === 'back');

      // Capture each side as it currently appears in the studio. Runs
      // sequentially because each captureSideScreenshot temporarily flips
      // currentView; parallel captures would race each other.
      const frontUrl = hasFront ? await captureSideScreenshot('front') : null;
      const backUrl = hasBack ? await captureSideScreenshot('back') : null;

      const patch = await fetch(`/api/admin/mockups/${editMockupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          product_ss_id: selectedProduct?.ss_id || undefined,
          product_name: selectedProduct?.name || undefined,
          product_image_url: productImg,
          preview_image_url: frontUrl,
          preview_image_url_back: backUrl,
          design_elements: designElements,
          design_canvas_inches: canvasInches,
          design_canvas_inches_h: canvasInchesH,
          design_color_index: selectedColorIdx,
          // Per-side print-zone rectangles in % of the product photo.
          // The mockups table's `placement` JSONB now holds the per-side
          // shape — legacy single-rect rows stay valid because reads
          // accept either format.
          placement,
        }),
      });
      if (!patch.ok) throw new Error('mockup save failed');

      // refetch (not invalidate) so this awaits — otherwise the navigate
      // below races the refetch and AdminPage mounts on the stale cache.
      await Promise.all([
        studioQueryClient.refetchQueries({ queryKey: ['mockups'] }),
        studioQueryClient.refetchQueries({ queryKey: ['admin', 'invoices'] }),
      ]);
      // If we're also tied to an invoice, return the admin to the invoice
      // editor so they can keep working on it. Otherwise back to the
      // Mockups grid.
      if (attachToInvoiceId) {
        navigate(`/admin?section=invoices&editInvoice=${encodeURIComponent(attachToInvoiceId)}`);
      } else {
        navigate('/admin?section=mockups');
      }
    } catch (e) {
      alert(`Mockup save failed: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setSavingMockupEdit(false);
    }
  }

  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);

  // Check if user is logged in
  const getAuthToken = () => localStorage.getItem('tsb_token');
  const isLoggedIn = () => !!getAuthToken();

  // Save design handler
  // Generate a canvas image from the design area
  // Build a simple JSON representation of the design for server-side rendering
  const getDesignData = () => ({
    product: selectedProduct ? { name: selectedProduct.name, ss_id: selectedProduct.ss_id, image: displayImage } : null,
    colorName: productColors[selectedColorIdx]?.name || 'Default',
    elements: designElements.map(el => ({
      type: el.type,
      content: el.content,
      x: el.x,
      y: el.y,
      width: el.width,
      fontSize: el.fontSize,
      color: el.color,
      fontFamily: el.fontFamily,
      rotation: el.rotation,
      textAlign: el.textAlign,
    })),
  });

  const handleSave = async () => {
    if (!isLoggedIn()) {
      setShowLoginPrompt(true);
      return;
    }
    setIsSaving(true);
    try {
      const token = getAuthToken();

      const designData = getDesignData();

      // Fabric-mode save: ship the v2 (Fabric) serialized form and, on the
      // FIRST overwrite of a v1 row, the original v1 array so the server
      // can populate elements_legacy as a rollback snapshot. The server
      // only writes elements_legacy when it's currently NULL — see PR #7
      // for the matching server logic.
      const elementsPayload: unknown =
        useFabricRenderer && fabricBridgeRef.current
          ? fabricBridgeRef.current.getDesignJSON()
          : designElements;

      const body: Record<string, unknown> = {
        name: designName,
        product_ss_id: selectedProduct?.ss_id,
        product_name: selectedProduct?.name,
        product_image: displayImage,
        color_index: selectedColorIdx,
        elements: elementsPayload,
        design_data: designData,
        canvas_inches: canvasInches,
        canvas_inches_h: canvasInchesH,
      };
      if (useFabricRenderer && originalLegacyPayload) {
        body.original_legacy_payload = originalLegacyPayload;
      }
      const url = savedDesignId ? `/api/designs/${savedDesignId}` : '/api/designs';
      const method = savedDesignId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save');
      }
      const data = await res.json();
      if (!savedDesignId && data.id) setSavedDesignId(data.id);
      alert('Design saved! Mockup and print-ready file generated.');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save design');
    } finally {
      setIsSaving(false);
    }
  };

  // Upload a base64 PNG and return its hosted URL.
  async function uploadCapturedPng(dataUrl: string | null, label: string): Promise<string | null> {
    if (!dataUrl) return null;
    try {
      const r = await fetch('/api/quotes/upload-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: dataUrl, filename: `${label}-${Date.now()}.png` }),
      });
      if (!r.ok) return null;
      const { url } = await r.json();
      return url || null;
    } catch (err) {
      console.warn(`[Get Price] upload ${label} failed:`, err);
      return null;
    }
  }

  // Capture one side (currently-shown OR temporarily flipped) as TWO PNGs:
  // the full mockup (design + product backdrop) and the graphic alone (design
  // on transparent). Uses Fabric's own exportPNG when the Fabric renderer is
  // active — html2canvas misses Fabric-drawn elements because they live on
  // Fabric's internal contexts, which is why "Get Price" previously yielded
  // just the product photo.
  async function captureSideMockupAndGraphic(side: ViewName): Promise<{ mockupUrl: string | null; graphicUrl: string | null }> {
    // Temporarily flip the renderer to `side` if we're not already there;
    // restore in `finally` so the user's editor view doesn't change.
    const prevView = currentView;
    const needsFlip = prevView !== side;
    if (needsFlip) {
      if (useFabricRenderer && fabricBridgeRef.current) fabricBridgeRef.current.setSide(side);
      else setCurrentView(side);
    }
    const prevSelected = selectedElementId;
    setSelectedElementId(null);
    // Two RAFs so the browser actually paints the flipped side / cleared
    // selection before the capture runs.
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    let mockupDataUrl: string | null = null;
    let graphicDataUrl: string | null = null;

    try {
      if (useFabricRenderer && fabricBridgeRef.current) {
        try { mockupDataUrl = fabricBridgeRef.current.exportPNG({ transparent: false }); }
        catch (err) { console.warn('[Get Price] fabric mockup export failed:', err); }
        try { graphicDataUrl = fabricBridgeRef.current.exportPNG({ transparent: true }); }
        catch (err) { console.warn('[Get Price] fabric graphic export failed:', err); }
      } else {
        const surface = designSurfaceRef.current;
        if (surface) {
          try {
            const html2canvas = (await import('html2canvas')).default;
            const cvAll = await html2canvas(surface, { backgroundColor: null, useCORS: true, scale: 2, logging: false });
            mockupDataUrl = cvAll.toDataURL('image/png');
            const productImg = productImgRef.current;
            if (productImg) {
              const cvDesign = await html2canvas(surface, {
                backgroundColor: null, useCORS: true, scale: 2, logging: false,
                ignoreElements: (el) => el === productImg,
              });
              graphicDataUrl = cvDesign.toDataURL('image/png');
            }
          } catch (err) {
            console.warn('[Get Price] html2canvas capture failed:', err);
          }
        }
      }
    } finally {
      if (needsFlip) {
        if (useFabricRenderer && fabricBridgeRef.current) fabricBridgeRef.current.setSide(prevView);
        else setCurrentView(prevView);
      }
      if (prevSelected) setSelectedElementId(prevSelected);
    }

    const [mockupUrl, graphicUrl] = await Promise.all([
      uploadCapturedPng(mockupDataUrl, `mockup-${side}`),
      uploadCapturedPng(graphicDataUrl, `graphic-${side}`),
    ]);
    return { mockupUrl, graphicUrl };
  }

  // Navigate to quote with design data pre-filled. Captures front + back
  // separately when both sides have design elements so the customer sees
  // both mockups alongside the live price.
  const handleGetPrice = async () => {
    const hasFront = designElements.some((e) => (e.side ?? 'front') === 'front');
    const hasBack = designElements.some((e) => (e.side ?? 'front') === 'back');
    // Sequential — each capture temporarily flips currentView, so running
    // them in parallel would race for the renderer state.
    const front = (hasFront || (!hasFront && !hasBack))
      ? await captureSideMockupAndGraphic('front')
      : { mockupUrl: null, graphicUrl: null };
    const back = hasBack
      ? await captureSideMockupAndGraphic('back')
      : { mockupUrl: null, graphicUrl: null };
    navigate('/quote', {
      state: {
        fromDesignStudio: true,
        product: selectedProduct,
        color: productColors[selectedColorIdx] || null,
        designElements,
        designImage: displayImage,
        mockupUrl: front.mockupUrl,
        graphicUrl: front.graphicUrl,
        mockupUrlBack: back.mockupUrl,
        graphicUrlBack: back.graphicUrl,
      },
    });
  };

  const handleDownload = async () => {
    if (!displayImage) return;
    try {
      const response = await fetch(displayImage);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${designName.replace(/\s+/g, '-')}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      // If CORS blocks the fetch, open image in new tab
      window.open(displayImage, '_blank');
    }
  };

  // Share handlers
  const getShareText = () => `Check out my custom design "${designName}" on TShirt Brothers!`;
  const getShareUrl = () => typeof window !== 'undefined' ? window.location.href : 'https://tshirtbrothers.com/design';

  const handleShareFacebook = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(getShareUrl())}&quote=${encodeURIComponent(getShareText())}`, '_blank', 'width=600,height=400');
    setShowShareMenu(false);
  };
  const handleShareTwitter = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(getShareText())}&url=${encodeURIComponent(getShareUrl())}`, '_blank', 'width=600,height=400');
    setShowShareMenu(false);
  };
  const handleShareEmail = () => {
    window.location.href = `mailto:?subject=${encodeURIComponent(getShareText())}&body=${encodeURIComponent(`I created a custom design on TShirt Brothers! Check it out: ${getShareUrl()}`)}`;
    setShowShareMenu(false);
  };
  const handleCopyLink = () => {
    navigator.clipboard.writeText(getShareUrl()).then(() => alert('Link copied to clipboard!'));
    setShowShareMenu(false);
  };

  // --- Upload panel state ---
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingUpload, setPendingUpload] = useState<string | null>(null); // base64 of just-uploaded image
  const [isRemovingBg, setIsRemovingBg] = useState(false);

  // Load user's saved upload library on mount
  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;
    fetch('/api/designs/uploads', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then((uploads: { url: string }[]) => {
        if (uploads.length > 0) {
          setUploadedImages(prev => {
            const existing = new Set(prev);
            const newUrls = uploads.map(u => u.url).filter(u => !existing.has(u));
            return [...newUrls, ...prev];
          });
        }
      })
      .catch(() => {});
  }, []);

  // --- Text panel state ---
  const [textInput, setTextInput] = useState('');
  // Defaults for newly-added text. Tweakable via the Edit Text drawer
  // after placement, so they don't need to be panel controls.
  // Default ~10% of surface width (fontSize 80 ÷ 800 × surfaceWidth). Matches
  // the rough visual scale of a default image element so a fresh text +
  // graphic come in at comparable sizes instead of text feeling tiny.
  const textFontSize = 80;
  const textColor = '#FFFFFF';

  // --- Art panel state ---
  const [artSource, setArtSource] = useState<'designs' | 'clipart'>('designs');
  const [artCategory, setArtCategory] = useState<string | null>(null);
  const [artSearch, setArtSearch] = useState('');
  const [artIcons, setArtIcons] = useState<{ prefix: string; name: string }[]>([]);
  const [artLoading, setArtLoading] = useState(false);
  const [artColor, setArtColor] = useState('#000000');
  const [libraryArt, setLibraryArt] = useState<{ id: number; name: string; image_url: string; category: string }[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [designsCategory, setDesignsCategory] = useState<string>('all');

  // --- Product panel state ---
  const [productSearch, setProductSearch] = useState('');
  const [, setFontsReady] = useState(0); // force re-render when fonts load

  // --- Drag / resize state ---
  const canvasRef = useRef<HTMLDivElement>(null);
  // Ref to the inner "product photo + design overlay" surface. Used by the
  // mockup save flow to screenshot exactly what the admin sees instead of
  // running a server-side compose with a placement constant.
  // The design surface is now the product photo itself — elements live
  // anywhere on the shirt. designSurfaceRef and productBgRef both point
  // to the same backdrop div (assigned via a callback ref below) so
  // screenshot save and any future placement helpers all measure against
  // the same box. Mutable refs (RefObject with writable .current).
  const designSurfaceRef = useRef<HTMLDivElement | null>(null);
  const productBgRef = useRef<HTMLDivElement | null>(null);
  // The product photo node — toggled hidden during Save-to-Library so the
  // captured PNG is just the design elements on a transparent background.
  const productImgRef = useRef<HTMLImageElement | null>(null);

  // Live width of the design surface (productBg) in px. Text font-size used
  // to derive from CSS cqw units (1% of container width), but html2canvas
  // doesn't resolve cqw correctly — it falls back to a default rem, blowing
  // text up to multiples of its rendered size in the saved output. Switch to
  // a JS-computed px value (fontSize/800 of surfaceWidth) so DOM and capture
  // agree on size to the pixel.
  const [surfaceWidth, setSurfaceWidth] = useState(0);
  useEffect(() => {
    const node = productBgRef.current;
    if (!node) return;
    const measure = () => setSurfaceWidth(node.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  // Per-side placement is kept for forward-compat (the mockup row still
  // stores it as JSONB), but the UI no longer constrains design elements
  // to it. Saving the current state preserves backward compatibility
  // when we re-introduce a non-constraining placement preview later.
  type Placement = { x: number; y: number; width: number; height: number };
  const [placement, setPlacement] = useState<Record<ViewName, Placement>>({
    front: { x: 30, y: 22, width: 40, height: 40 },
    back: { x: 25, y: 18, width: 50, height: 50 },
    sleeve: { x: 70, y: 25, width: 18, height: 18 },
  });
  const [dragState, setDragState] = useState<{
    elementId: string;
    mode: 'move' | 'resize';
    startMx: number;
    startMy: number;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

  /* ---------------------------------------------------------------- */
  /*  Product fetching                                                 */
  /* ---------------------------------------------------------------- */

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['design-products', productSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '24' });
      if (productSearch) params.set('search', productSearch);
      const res = await fetch(`/api/products?${params}`);
      if (!res.ok) throw new Error('Failed');
      return res.json() as Promise<{ products: Product[] }>;
    },
  });

  const products = productsData?.products ?? [];

  // Load product once on mount — from URL param or default Gildan
  // Defensive: make absolutely sure the welcome panel is hidden on mobile
  // once we're client-side, regardless of how the initial state resolved.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.innerWidth < 768) setShowWelcome(false);
  }, []);

  const hasLoadedProduct = useRef(false);
  useEffect(() => {
    if (hasLoadedProduct.current) return;
    hasLoadedProduct.current = true;
    const targetId = initialProductId || DEFAULT_PRODUCT_SSID;
    // Catalog historically passed the SS style id, but a stale build (or a
    // sample fallback row) can pass the DB serial id instead. Try by-ssid
    // first; if that 404s, fall back to /products/:id. Either way we land
    // on the right row.
    (async () => {
      try {
        let r = await fetch(`/api/products/by-ssid/${encodeURIComponent(targetId)}`);
        let p = r.ok ? await r.json() : null;
        if (!p && /^\d+$/.test(targetId)) {
          r = await fetch(`/api/products/${encodeURIComponent(targetId)}`);
          p = r.ok ? await r.json() : null;
        }
        if (p) setSelectedProduct(prev => prev || (p as Product));
      } catch { /* keep default empty state */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Edit-existing-mockup mode ───────────────────────────────────────
  // When ?editMockup=<id> is set, fetch the mockup row, then:
  //   • hydrate selectedProduct from its product_id (preferring ss_id)
  //   • hydrate canvas dims from design_canvas_inches(_h) if saved
  //   • hydrate designElements from design_elements if saved, else seed
  //     a single image element with graphic_url at the saved placement.
  // Runs once on mount.
  useEffect(() => {
    if (!editMockupId) return;
    (async () => {
      try {
        const token = localStorage.getItem('tsb_token') || '';
        const res = await fetch(`/api/admin/mockups/${editMockupId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const m = await res.json();

        // Product hydration: prefer product_ss_id (studio-native lookup) and
        // fall back to the integer product_id for legacy rows. If neither
        // is present, leave selectedProduct null so the admin is prompted
        // to pick one — synthesizing a fake Product from product_image_url
        // looked clever but caused the model-photo bake-in bug for legacy
        // mockups (their product_image_url is a styled product shot, not
        // a flat catalog photo, so re-compositing baked the design twice).
        if (m.product_ss_id) {
          try {
            const pRes = await fetch(`/api/products/by-ssid/${encodeURIComponent(m.product_ss_id)}`);
            if (pRes.ok) setSelectedProduct(await pRes.json());
          } catch { /* fall through */ }
        } else if (m.product_id) {
          try {
            const pRes = await fetch(`/api/products/${m.product_id}`);
            if (pRes.ok) setSelectedProduct(await pRes.json());
          } catch { /* fall through */ }
        }

        if (m.design_canvas_inches) setCanvasInches(Number(m.design_canvas_inches));
        if (m.design_canvas_inches_h) setCanvasInchesH(Number(m.design_canvas_inches_h));
        // Restore per-side placement. Accept either the new
        // {front,back,sleeve} shape or the legacy single rect.
        if (m.placement && typeof m.placement === 'object') {
          const raw = m.placement as Record<string, unknown>;
          const isLegacy = typeof raw.x === 'number' && typeof raw.y === 'number';
          if (isLegacy) {
            const legacy = raw as unknown as { x: number; y: number; width: number; height?: number };
            const rect = { x: legacy.x, y: legacy.y, width: legacy.width, height: legacy.height ?? legacy.width };
            setPlacement({ front: rect, back: rect, sleeve: rect });
          } else {
            setPlacement((prev) => ({
              front: (raw.front as Placement) || prev.front,
              back: (raw.back as Placement) || prev.back,
              sleeve: (raw.sleeve as Placement) || prev.sleeve,
            }));
          }
        }
        if (typeof m.design_color_index === 'number') {
          setSelectedColorIdx(m.design_color_index);
          // The visible product image only honors the chosen swatch when
          // userPickedColor is true; otherwise the studio falls back to
          // the catalog default. Re-opening a saved mockup is an implicit
          // pick, so flip the flag along with the index.
          setUserPickedColor(true);
        }

        if (Array.isArray(m.design_elements) && m.design_elements.length > 0) {
          setDesignElements(m.design_elements as DesignElement[]);
        } else if (m.graphic_url) {
          // Legacy mockup (upload+placement flow): seed one image element.
          // placement on the mockup is in % of PRODUCT image, but the studio
          // canvas is sized to the print area, not the product photo. We
          // can't perfectly translate without knowing the print zone, so
          // we drop the graphic centered on the canvas at a comfortable
          // size — the admin can reposition.
          setDesignElements([{
            id: `mockup-${m.id}-graphic`,
            type: 'image',
            content: m.graphic_url,
            x: 20,
            y: 20,
            width: 60,
            side: 'front',
          } as DesignElement]);
        }
      } catch { /* silent — studio shows blank canvas + picker */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch colors for selected product from S&S API
  const { data: colorsData } = useQuery({
    queryKey: ['product-colors', selectedProduct?.ss_id],
    queryFn: async () => {
      if (!selectedProduct?.ss_id) return { colors: [] };
      const res = await fetch(`/api/products/colors/${selectedProduct.ss_id}`);
      if (!res.ok) return { colors: [] };
      return res.json() as Promise<{ colors: ProductColor[] }>;
    },
    enabled: !!selectedProduct?.ss_id,
    staleTime: 1000 * 60 * 30, // cache 30 min
  });

  const productColors = colorsData?.colors ?? selectedProduct?.colors ?? [];
  const selectedColorImage = userPickedColor ? productColors[selectedColorIdx]?.image : null;
  const frontImage = selectedColorImage || selectedProduct?.image_url || null;
  const backImage = productColors[selectedColorIdx]?.backImage || selectedProduct?.back_image_url || frontImage;
  const displayImage = currentView === 'back' ? backImage : frontImage;

  // When loading the default product (no ?product= override) and the user
  // hasn't picked a color yet, snap to "Black" once the colorways resolve.
  // Catalog colorways are usually ordered White → other, which means we'd
  // otherwise land on White by default.
  const hasPickedDefaultBlack = useRef(false);
  useEffect(() => {
    if (hasPickedDefaultBlack.current) return;
    if (initialProductId) return; // user came in with a specific product
    if (userPickedColor) return;
    if (!productColors.length) return;
    const blackIdx = productColors.findIndex(
      (c) => typeof c.name === 'string' && /^black$/i.test(c.name),
    );
    if (blackIdx >= 0 && blackIdx !== selectedColorIdx) {
      setSelectedColorIdx(blackIdx);
      setUserPickedColor(true);
    }
    hasPickedDefaultBlack.current = true;
  }, [productColors, initialProductId, userPickedColor, selectedColorIdx]);

  /* ---------------------------------------------------------------- */
  /*  Toolbar toggle                                                   */
  /* ---------------------------------------------------------------- */

  const toggleTool = useCallback((tool: ToolName) => {
    setShowWelcome(false);
    setActiveTool(prev => (prev === tool ? null : tool));
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Design element helpers                                           */
  /* ---------------------------------------------------------------- */

  const addDesignElement = useCallback((el: Omit<DesignElement, 'id'>, opts?: { keepPanelOpen?: boolean }) => {
    // Tag the new element with whichever side the user is currently viewing.
    // Front/back/sleeve elements live in the same flat array but we filter
    // by `el.side` at render and print time so each side has its own design.
    const newEl: DesignElement = { ...el, side: el.side ?? currentView, id: Date.now().toString() + Math.random().toString(36).slice(2) };
    setDesignElements(prev => [...prev, newEl]);
    setSelectedElementId(newEl.id);
    // Auto-close the tool panel after add — except when the caller opts out.
    // Text wants to stay open so users can keep adding lines without
    // re-opening the panel; uploads and AI/library inserts close because
    // each one represents "I'm done with that tool."
    if (!opts?.keepPanelOpen) setActiveTool(null);
  }, [currentView]);

  const removeElement = useCallback((id: string) => {
    setDesignElements(prev => prev.filter(e => e.id !== id));
    setSelectedElementId(prev => (prev === id ? null : prev));
  }, []);

  const updateElement = useCallback((id: string, updates: Partial<DesignElement>) => {
    setDesignElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } : el));
  }, []);

  const duplicateElement = useCallback((id: string) => {
    setDesignElements(prev => {
      const el = prev.find(e => e.id === id);
      if (!el) return prev;
      const newEl = { ...el, id: Date.now().toString() + Math.random().toString(36).slice(2), x: el.x + 5, y: el.y + 5 };
      return [...prev, newEl];
    });
  }, []);

  // Layer z-order (array order = paint order; last item = top)
  const bringForward = useCallback((id: string) => {
    setDesignElements(prev => {
      const idx = prev.findIndex(e => e.id === id);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const n = [...prev]; [n[idx], n[idx + 1]] = [n[idx + 1]!, n[idx]!]; return n;
    });
  }, []);
  const sendBackward = useCallback((id: string) => {
    setDesignElements(prev => {
      const idx = prev.findIndex(e => e.id === id);
      if (idx <= 0) return prev;
      const n = [...prev]; [n[idx], n[idx - 1]] = [n[idx - 1]!, n[idx]!]; return n;
    });
  }, []);
  const bringToFront = useCallback((id: string) => {
    setDesignElements(prev => {
      const el = prev.find(e => e.id === id);
      if (!el) return prev;
      return [...prev.filter(e => e.id !== id), el];
    });
  }, []);
  const sendToBack = useCallback((id: string) => {
    setDesignElements(prev => {
      const el = prev.find(e => e.id === id);
      if (!el) return prev;
      return [el, ...prev.filter(e => e.id !== id)];
    });
  }, []);

  // Center every element on the current side around the canvas midpoint.
  // Computes the collective bounding box, finds its center, shifts all
  // elements by the delta needed to land that center at (50, 50). Preserves
  // RELATIVE positioning between elements.
  //
  // Per-type height for the bounding box:
  //   - shape: el.height (explicit, set by free-resize)
  //   - image / text: el.width (assume square — close enough for a
  //     "center this" gesture; users tweak after if needed)
  const centerAllOnCanvas = useCallback(() => {
    setDesignElements(prev => {
      const onSide = prev.filter(e => (e.side ?? 'front') === currentView);
      if (onSide.length === 0) return prev;
      const heightOf = (el: DesignElement) =>
        el.type === 'shape' ? (el.height ?? el.width) : el.width;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const el of onSide) {
        minX = Math.min(minX, el.x);
        maxX = Math.max(maxX, el.x + el.width);
        minY = Math.min(minY, el.y);
        maxY = Math.max(maxY, el.y + heightOf(el));
      }
      const dx = 50 - (minX + maxX) / 2;
      const dy = 50 - (minY + maxY) / 2;
      // No-op if everything's already centered (within 0.5%).
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return prev;
      return prev.map(el =>
        (el.side ?? 'front') === currentView
          ? { ...el, x: el.x + dx, y: el.y + dy }
          : el,
      );
    });
  }, [currentView]);

  /* ---------------------------------------------------------------- */
  /*  File upload handler                                              */
  /* ---------------------------------------------------------------- */

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setPendingUpload(base64); // Show the "Remove background?" prompt
    };
    reader.readAsDataURL(file);
  }, []);

  const finishUpload = useCallback(async (imageUrl: string) => {
    setUploadedImages(prev => [...prev, imageUrl]);
    setPendingUpload(null);
    // Drop the graphic straight onto the canvas so the user doesn't have to
    // tap the Uploaded-grid thumbnail afterwards (this was confusing on
    // mobile where the grid was hidden behind the panel/keyboard).
    addDesignElement({ type: 'image', x: 25, y: 20, width: 30, content: imageUrl });
    // Belt-and-suspenders: always close the Upload panel so the canvas is
    // visible immediately.
    setActiveTool(null);
    // Save to user's upload library if logged in
    const token = getAuthToken();
    if (token) {
      try {
        const res = await fetch('/api/designs/uploads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ imageBase64: imageUrl, filename: 'design-upload' }),
        });
        if (res.ok) {
          const saved = await res.json();
          // Replace the local URL with the Spaces URL
          setUploadedImages(prev => prev.map(u => u === imageUrl ? saved.url : u));
        }
      } catch { /* silently fail — local version still works */ }
    }
  }, [addDesignElement]);

  // Trim fully-transparent pixels around an image. Returns a new data URL
  // cropped to the bounding box of non-transparent pixels, plus the crop
  // ratios so callers can resize the placed element proportionally.
  async function autoCropTransparent(dataUrl: string, alphaThreshold = 64): Promise<{ dataUrl: string; widthRatio: number; heightRatio: number }> {
    console.log('[autocrop] start, src prefix:', dataUrl.slice(0, 40));
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new window.Image();
      i.crossOrigin = 'anonymous';
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('image failed to load for autocrop'));
      i.src = dataUrl;
    });
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    console.log('[autocrop] loaded', w, 'x', h);
    if (!w || !h) throw new Error(`autocrop: image has zero dimensions (${w}x${h})`);

    const src = document.createElement('canvas');
    src.width = w;
    src.height = h;
    const sctx = src.getContext('2d', { willReadFrequently: true });
    if (!sctx) throw new Error('autocrop: failed to get 2d context');
    sctx.drawImage(img, 0, 0);

    let data: Uint8ClampedArray;
    try {
      data = sctx.getImageData(0, 0, w, h).data;
    } catch (e) {
      throw new Error(`autocrop: getImageData threw: ${(e as Error).message}`);
    }

    // Count opaque pixels per row and per column. A row/column is considered
    // "empty" if fewer than `minCount` of its pixels exceed alphaThreshold.
    // This prevents a handful of stray semi-transparent pixels from extending
    // the bounding box past where the actual subject ends.
    const rowCounts = new Uint32Array(h);
    const colCounts = new Uint32Array(w);
    for (let y = 0; y < h; y++) {
      const rowStart = y * w * 4;
      for (let x = 0; x < w; x++) {
        const a = data[rowStart + x * 4 + 3]!;
        if (a > alphaThreshold) {
          rowCounts[y]!++;
          colCounts[x]!++;
        }
      }
    }
    // Require at least 0.3% of the shorter side in opaque pixels per row/col
    const minCount = Math.max(2, Math.round(Math.min(w, h) * 0.003));

    let minY = 0; while (minY < h && rowCounts[minY]! < minCount) minY++;
    let maxY = h - 1; while (maxY >= 0 && rowCounts[maxY]! < minCount) maxY--;
    let minX = 0; while (minX < w && colCounts[minX]! < minCount) minX++;
    let maxX = w - 1; while (maxX >= 0 && colCounts[maxX]! < minCount) maxX--;

    console.log('[autocrop] bounds', { minX, minY, maxX, maxY, alphaThreshold, minCount });
    if (maxX < 0 || maxY < 0 || maxX < minX || maxY < minY) {
      console.warn('[autocrop] no opaque pixels found — returning original');
      return { dataUrl, widthRatio: 1, heightRatio: 1 };
    }
    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    if (cropW === w && cropH === h) {
      console.log('[autocrop] already tight');
      return { dataUrl, widthRatio: 1, heightRatio: 1 };
    }
    const out = document.createElement('canvas');
    out.width = cropW;
    out.height = cropH;
    const octx = out.getContext('2d');
    if (!octx) throw new Error('autocrop: failed to get output context');
    octx.drawImage(src, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
    const result = out.toDataURL('image/png');
    console.log('[autocrop] cropped to', cropW, 'x', cropH, 'ratio', cropW / w);
    return { dataUrl: result, widthRatio: cropW / w, heightRatio: cropH / h };
  }

  const handleRemoveBg = useCallback(async () => {
    if (!pendingUpload) return;
    // Snapshot + close the dialog immediately so the UI feels responsive.
    // The original image goes onto the canvas right away; once the
    // background-removed version arrives we swap it in.
    const original = pendingUpload;
    setPendingUpload(null);
    finishUpload(original);
    setIsRemovingBg(true);
    showDebugToast('Rm BG: starting (upload flow)...');

    try {
      // Upload to DO Spaces first so the /remove-bg call passes a tiny
      // imageUrl instead of a multi-MB base64 body.
      let bgBody: Record<string, string> = { imageBase64: original };
      try {
        const up = await fetch('/api/quotes/upload-design', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: original, filename: 'studio-upload.png', customerEmail: 'studio-anonymous' }),
        });
        if (up.ok) {
          const d = await up.json();
          if (d.url) bgBody = { imageUrl: d.url };
        }
      } catch { /* fall back to base64 */ }

      showDebugToast(bgBody.imageUrl ? 'Rm BG: uploaded, calling Replicate...' : 'Rm BG: calling Replicate (base64)...');
      const res = await fetch('/api/design/remove-bg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bgBody),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed (${res.status})`);
      }
      const data = await res.json();
      if (data.imageBase64) {
        showDebugToast('Rm BG: got cutout, cropping...');
        // Crop away the now-transparent padding so the subject fills the
        // image bounds. Also shrink the placed element's width by the crop
        // ratio so the subject stays roughly the same visual size on the
        // t-shirt.
        let cutout = data.imageBase64 as string;
        let widthRatio = 1;
        try {
          const cropped = await autoCropTransparent(cutout);
          cutout = cropped.dataUrl;
          widthRatio = cropped.widthRatio;
        } catch (cropErr) {
          console.warn('[autocrop] failed, using uncropped cutout:', cropErr);
          showDebugToast(`Rm BG: crop failed (${cropErr instanceof Error ? cropErr.message : 'unknown'})`);
        }

        setDesignElements((prev) => prev.map((el) =>
          el.type === 'image' && el.content === original
            ? { ...el, content: cutout, width: Math.max(5, el.width * widthRatio) }
            : el
        ));
        setUploadedImages((prev) => prev.map((u) => (u === original ? cutout : u)));
        showDebugToast(`Rm BG done · ratio=${widthRatio.toFixed(3)}`);
      } else {
        showDebugToast('Rm BG: no imageBase64 in response');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[remove-bg] failed:', msg);
      showDebugToast(`Rm BG FAILED: ${msg}`);
      alert(`Background removal failed: ${msg}. Keeping the original image.`);
    } finally {
      setIsRemovingBg(false);
    }
  }, [pendingUpload, finishUpload]);

  const handleKeepOriginal = useCallback(() => {
    if (pendingUpload) finishUpload(pendingUpload);
  }, [pendingUpload, finishUpload]);

  const placeImageOnCanvas = useCallback((url: string) => {
    addDesignElement({ type: 'image', x: 25, y: 20, width: 30, content: url });
  }, [addDesignElement]);

  // Listen for chat-widget "Add to Canvas" events
  useEffect(() => {
    function handleAddToCanvas(e: Event) {
      const detail = (e as CustomEvent<{ imageUrl?: string }>).detail;
      if (detail?.imageUrl) {
        placeImageOnCanvas(detail.imageUrl);
      }
    }
    window.addEventListener('tsb:add-to-canvas', handleAddToCanvas);
    return () => window.removeEventListener('tsb:add-to-canvas', handleAddToCanvas);
  }, [placeImageOnCanvas]);

  // Remove background from an image already on the canvas
  const [canvasRemovingBg, setCanvasRemovingBg] = useState(false);
  function showDebugToast(text: string) {
    try {
      const n = document.createElement('div');
      n.textContent = text;
      n.style.cssText = 'position:fixed;bottom:70px;left:50%;transform:translateX(-50%);background:#000c;color:#fff;padding:6px 10px;border-radius:8px;z-index:9999;font:12px sans-serif;max-width:90vw;text-align:center;';
      document.body.appendChild(n);
      setTimeout(() => n.remove(), 6000);
    } catch { /* ignore */ }
  }

  const removeBgOnCanvas = async (elementId: string) => {
    const el = designElements.find(e => e.id === elementId);
    if (!el || el.type !== 'image') { showDebugToast('Rm BG: no image selected'); return; }
    setCanvasRemovingBg(true);
    showDebugToast('Rm BG: starting...');
    try {
      // If the image is still a data URL, upload it to Spaces first so we
      // don't send a huge base64 body to /remove-bg.
      let body: Record<string, string>;
      if (el.content.startsWith('data:')) {
        try {
          const up = await fetch('/api/quotes/upload-design', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: el.content, filename: 'studio-source.png', customerEmail: 'studio-anonymous' }),
          });
          if (up.ok) {
            const d = await up.json();
            body = d.url ? { imageUrl: d.url } : { imageBase64: el.content };
          } else {
            body = { imageBase64: el.content };
          }
        } catch {
          body = { imageBase64: el.content };
        }
      } else {
        body = { imageUrl: el.content };
      }

      const resp = await fetch('/api/design/remove-bg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Failed' }));
        throw new Error((err as { error?: string }).error || 'Failed');
      }
      const data = await resp.json() as { imageBase64: string };

      // Auto-crop the transparent padding so the subject fills the element.
      let cutout = data.imageBase64;
      let widthRatio = 1;
      let cropResult = '(not run)';
      try {
        const cropped = await autoCropTransparent(cutout);
        cutout = cropped.dataUrl;
        widthRatio = cropped.widthRatio;
        cropResult = `cropped ratio=${cropped.widthRatio.toFixed(3)}`;
      } catch (cropErr) {
        console.warn('[autocrop] failed on canvas Rm BG:', cropErr);
        cropResult = `FAILED: ${(cropErr as Error).message}`;
      }
      (window as unknown as { __tsbLastCrop?: string }).__tsbLastCrop = cropResult;
      showDebugToast(`Rm BG done · ${cropResult}`);
      updateElement(elementId, {
        content: cutout,
        width: Math.max(5, el.width * widthRatio),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[canvas Rm BG] failed:', err);
      showDebugToast(`Rm BG FAILED: ${msg}`);
    } finally {
      setCanvasRemovingBg(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Text handler                                                     */
  /* ---------------------------------------------------------------- */

  const addTextToCanvas = useCallback(() => {
    if (!textInput.trim()) return;
    // After add, leave the new element SELECTED so the Edit Text side
    // panel opens automatically — that's where the user goes next 95% of
    // the time to set font / color / shape / size. addDesignElement
    // closes the Add Text panel; selecting the new element flips the
    // showTextEditor flag and the Edit Text panel takes its place.
    addDesignElement({
      type: 'text',
      x: 30,
      y: 22,
      width: 40,
      content: textInput.trim(),
      fontSize: textFontSize,
      color: textColor,
      fontFamily: 'Inter',
      rotation: 0,
      textAlign: 'center',
      outline: false,
    });
    setTextInput('');
    // Blur the focused input so the mobile keyboard dismisses — without
    // this, the Edit Text panel opens behind a still-up keyboard.
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, [textInput, textFontSize, textColor, addDesignElement]);

  /* ---------------------------------------------------------------- */
  /*  Drag / Resize handlers                                           */
  /* ---------------------------------------------------------------- */

  const startDrag = useCallback((clientX: number, clientY: number, elementId: string, mode: 'move' | 'resize') => {
    setSelectedElementId(elementId);
    // On mobile, auto-close any open tool panel when the user grabs an
    // element — otherwise the sheet covers the canvas during drag.
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setActiveTool(null);
    }
    const el = designElements.find(d => d.id === elementId);
    if (!el) return;
    setDragState({
      elementId,
      mode,
      startMx: clientX,
      startMy: clientY,
      startX: el.x,
      startY: el.y,
      startWidth: el.width,
      // Shape elements track height independently. Image / text default
      // height to width — they ignore it but the resize math wants a real
      // number to subtract from.
      startHeight: el.height ?? el.width,
    });
  }, [designElements]);

  const handleElementMouseDown = useCallback((e: React.MouseEvent, elementId: string, mode: 'move' | 'resize') => {
    e.stopPropagation();
    e.preventDefault();
    startDrag(e.clientX, e.clientY, elementId, mode);
  }, [startDrag]);

  const handleElementTouchStart = useCallback((e: React.TouchEvent, elementId: string, mode: 'move' | 'resize') => {
    e.stopPropagation();
    const touch = e.touches[0];
    if (touch) startDrag(touch.clientX, touch.clientY, elementId, mode);
  }, [startDrag]);

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const { elementId, mode, startMx, startMy, startX, startY, startWidth, startHeight } = dragState;

      if (mode === 'move') {
        const dx = ((e.clientX - startMx) / rect.width) * 100;
        const dy = ((e.clientY - startMy) / rect.height) * 100;
        setDesignElements(prev =>
          prev.map(el =>
            el.id === elementId
              ? { ...el, x: Math.max(0, Math.min(90, startX + dx)), y: Math.max(0, Math.min(90, startY + dy)) }
              : el,
          ),
        );
      } else {
        const dx = ((e.clientX - startMx) / rect.width) * 100;
        const dy = ((e.clientY - startMy) / rect.height) * 100;
        const shiftHeld = e.shiftKey;
        setDesignElements(prev =>
          prev.map(el => {
            if (el.id !== elementId) return el;
            // Shapes resize on both axes by default — Shift preserves the
            // ORIGINAL aspect ratio (Photoshop convention). Non-shape
            // elements still resize on width only; their height is derived
            // (image: natural aspect, text: fontSize × lineHeight).
            if (el.type === 'shape') {
              const newW = Math.max(5, Math.min(100, startWidth + dx));
              const newH = shiftHeld
                ? newW * (startHeight / startWidth)
                : Math.max(5, Math.min(100, startHeight + dy));
              return { ...el, width: newW, height: newH };
            }
            return { ...el, width: Math.max(5, Math.min(80, startWidth + dx)) };
          }),
        );
      }
    };

    const handleMouseUp = () => setDragState(null);

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      // Block the browser's default pan/scroll while we're dragging an
      // element. Without this, single-finger drags both moved the element
      // and scrolled the page on mobile, making the canvas unusable.
      e.preventDefault();
      handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY } as MouseEvent);
    };
    const handleTouchEnd = () => setDragState(null);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [dragState]);

  /* ---------------------------------------------------------------- */
  /*  Tool definitions for the left toolbar                            */
  /* ---------------------------------------------------------------- */

  const tools: { name: ToolName | 'ai'; icon: typeof Upload; label: string }[] = [
    { name: 'upload', icon: Upload, label: 'Upload' },
    { name: 'text', icon: Type, label: 'Add Text' },
    { name: 'art', icon: Image, label: 'Add Art' },
    { name: 'shapes', icon: Square, label: 'Shapes' },
    { name: 'ai', icon: Sparkles, label: 'AI\nDesign' },
    { name: 'details', icon: Shirt, label: 'Change\nColor' },
    { name: 'products', icon: Move, label: 'Change\nProducts' },
  ];

  /* ---------------------------------------------------------------- */
  /*  Render: Top Header Bar                                           */
  /* ---------------------------------------------------------------- */

  const headerBar = (
    <header className="fixed top-0 left-0 right-0 z-50 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4">
      {/* Left */}
      <div className="flex items-center gap-3">
        {/* Back: when the studio was launched from admin (new/edit mockup
            or attach-to-invoice), go back to the admin section that sent
            us here instead of falling through to the homepage. */}
        <Link
          to={
            attachToInvoiceId
              ? `/admin?section=invoices&editInvoice=${encodeURIComponent(attachToInvoiceId)}`
              : (editMockupId || newMockupMode)
                ? '/admin?section=mockups'
                : (loadState?.backTo || '/')
          }
          className="text-gray-500 hover:text-gray-900 transition"
          title="Back"
        >
          <ArrowLeft className="h-5 w-5 md:h-6 md:w-6" />
        </Link>
        <img src="https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/assets/v1/tsb-logo.png" alt="TSB" className="h-8 w-8 md:h-9 md:w-9 object-contain hidden sm:block" />
        <span className="text-lg md:text-xl font-bold text-gray-900 whitespace-nowrap hidden lg:inline">TShirt Brothers</span>
      </div>

      {/* Center: design name */}
      <div className="flex items-center">
        {isEditingName ? (
          <input
            autoFocus
            value={designName}
            onChange={e => setDesignName(e.target.value)}
            onBlur={() => setIsEditingName(false)}
            onKeyDown={e => { if (e.key === 'Enter') setIsEditingName(false); }}
            className="border-b-2 border-red-500 bg-transparent px-2 py-1 text-sm font-medium text-center focus:outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsEditingName(true)}
            className="text-sm md:text-base font-medium text-gray-700 hover:text-gray-900 transition px-2 py-1 whitespace-nowrap"
          >
            {designName}
          </button>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        <CanvasSizeControl
          width={canvasInches}
          height={canvasInchesH}
          onChangeWidth={setCanvasInches}
          onChangeHeight={setCanvasInchesH}
        />
        {/* Zoom — multiplies the canvas surface width. > 100% overflows
            the canvas main and triggers horizontal + vertical scroll.
            UX-only, doesn't affect saved geometry. */}
        <div className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2 py-1 md:px-2.5 md:py-1.5 text-xs md:text-sm text-gray-700">
          <span className="font-medium">Zoom:</span>
          <HoldRepeatButton
            onPress={() => setCanvasZoom(z => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}
            className="px-1 text-gray-500 hover:text-gray-900"
            aria-label="Zoom out"
          >−</HoldRepeatButton>
          <span className="w-10 text-center tabular-nums">{Math.round(canvasZoom * 100)}%</span>
          <HoldRepeatButton
            onPress={() => setCanvasZoom(z => Math.min(4, Math.round((z + 0.1) * 10) / 10))}
            className="px-1 text-gray-500 hover:text-gray-900"
            aria-label="Zoom in"
          >+</HoldRepeatButton>
          <button
            type="button"
            onClick={() => setCanvasZoom(1)}
            className="ml-1 px-1.5 py-0.5 rounded text-[10px] text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            title="Reset to 100%"
          >Fit</button>
        </div>
        {/* Center all elements on canvas — single click recenters the
            collective bounding box at (50, 50). Preserves relative
            positioning between elements. Disabled when nothing's on
            the current side. */}
        <button
          type="button"
          onClick={centerAllOnCanvas}
          disabled={designElements.filter(e => (e.side ?? 'front') === currentView).length === 0}
          title="Center all on canvas"
          className="hidden md:flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <AlignCenter className="h-4 w-4" />
          <span>Center</span>
        </button>
        {/* Save to Library removed from the header — the bottom bar's
            Save|Share menu already includes the Library option, so the
            header CTA was redundant. */}
        {/* Undo / redo (Phase 2 PR #11). Lives next to Save so users find
            them where they expect. Disabled when the stack is empty.
            Keyboard shortcuts (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z) work
            regardless. */}
        <button
          type="button"
          onClick={() => {
            const snap = undoRedo.undo();
            if (snap !== null) {
              undoRedo.isReplaying.current = true;
              setDesignElements(snap);
              setSelectedElementId(null);
            }
          }}
          disabled={!undoRedo.canUndo}
          title="Undo (⌘Z)"
          className="hidden sm:flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Undo2 className="h-4 w-4 md:h-5 md:w-5" />
        </button>
        <button
          type="button"
          onClick={() => {
            const snap = undoRedo.redo();
            if (snap !== null) {
              undoRedo.isReplaying.current = true;
              setDesignElements(snap);
              setSelectedElementId(null);
            }
          }}
          disabled={!undoRedo.canRedo}
          title="Redo (⇧⌘Z)"
          className="hidden sm:flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Redo2 className="h-4 w-4 md:h-5 md:w-5" />
        </button>
        {/* Header "Save" button removed — the bottom bar's Save|Share
            button is the single customer-mode save action. Admin
            mockup-save variants below remain unique. */}
        {/* Two-state save: edit overrides create so we update in place
            instead of spawning a new mockup row each save. */}
        {attachToInvoiceId && !editMockupId && (
          <button
            type="button"
            onClick={handleSaveMockupToInvoice}
            disabled={savingInvoiceMockup}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 md:px-4 md:py-2 text-sm md:text-base font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50"
            title={`Save mockup and attach to invoice ${attachToInvoiceId}`}
          >
            {savingInvoiceMockup ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {savingInvoiceMockup ? 'Saving…' : 'Save Mockup to Invoice'}
          </button>
        )}
        {editMockupId && (
          <button
            type="button"
            onClick={handleSaveMockupEdit}
            disabled={savingMockupEdit}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 md:px-4 md:py-2 text-sm md:text-base font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50"
            title={`Save changes to mockup #${editMockupId}`}
          >
            {savingMockupEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {savingMockupEdit ? 'Saving…' : 'Save Mockup'}
          </button>
        )}
        {newMockupMode && !editMockupId && !attachToInvoiceId && (
          <button
            type="button"
            onClick={handleSaveNewMockup}
            disabled={savingNewMockup}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 md:px-4 md:py-2 text-sm md:text-base font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50"
            title="Save as a new mockup (screenshot of what you see here)"
          >
            {savingNewMockup ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {savingNewMockup ? 'Saving…' : 'Save Mockup'}
          </button>
        )}
        {/* Get Price removed from the header — the bottom bar's Get Price
            CTA is the single point of entry to the quote flow. */}
      </div>
    </header>
  );

  /* ---------------------------------------------------------------- */
  /*  Render: Left Toolbar (desktop)                                   */
  /* ---------------------------------------------------------------- */

  const leftToolbar = (
    <aside className="fixed left-0 top-16 bottom-16 z-40 hidden w-20 flex-col justify-center border-r border-gray-200 bg-white md:flex">
      {/* Sides — first item on the rail. Icon is a mini thumbnail of the
          current view of the customer's product so they immediately see
          which side they're designing. Hidden until a product is chosen. */}
      {selectedProduct && frontImage && !showWelcome && (
        <button
          type="button"
          onClick={() => setViewSwitcherOpen((v) => !v)}
          className={`relative flex w-full flex-col items-center py-4 transition ${
            viewSwitcherOpen
              ? 'text-orange-600 bg-orange-50'
              : 'text-orange-500 hover:bg-orange-50 hover:text-orange-600'
          }`}
        >
          {viewSwitcherOpen && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-orange-500" />}
          <div className="h-16 w-16 mx-auto rounded bg-gray-100 overflow-hidden flex items-center justify-center">
            <img
              src={currentView === 'back' ? (backImage ?? frontImage) : frontImage}
              alt={currentView}
              className="h-full w-full object-contain"
            />
          </div>
          <span className="mt-1.5 text-[10px] lg:text-[11px] leading-tight text-center">Sides</span>
        </button>
      )}
      {tools.map(tool => {
        const isActive = activeTool === tool.name;
        const Icon = tool.icon;
        return (
          <button
            key={tool.name}
            type="button"
            onClick={() => toggleTool(tool.name as ToolName)}
            className={`relative flex w-full flex-col items-center py-4 transition ${
              isActive
                ? 'text-orange-600 bg-orange-50'
                : 'text-orange-500 hover:bg-orange-50 hover:text-orange-600'
            }`}
          >
            {isActive && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-orange-500" />}
            <Icon className="h-16 w-16 mx-auto" strokeWidth={1.5} />
            <span className="mt-1.5 text-[10px] lg:text-[11px] leading-tight text-center whitespace-pre-line">{tool.label}</span>
          </button>
        );
      })}
    </aside>
  );

  /* ---------------------------------------------------------------- */
  /*  Render: Bottom Toolbar (mobile)                                  */
  /* ---------------------------------------------------------------- */

  const bottomToolbar = (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-gray-200 bg-white md:hidden">
      {selectedProduct && frontImage && !showWelcome && (
        <button
          type="button"
          onClick={() => setViewSwitcherOpen((v) => !v)}
          className={`relative flex flex-1 min-w-0 flex-col items-center gap-0.5 px-0.5 py-1.5 transition ${
            viewSwitcherOpen ? 'text-orange-600' : 'text-orange-500'
          }`}
        >
          {viewSwitcherOpen && <div className="absolute top-0 left-0 right-0 h-0.5 bg-orange-500" />}
          <div className="h-5 w-5 shrink-0 rounded bg-gray-100 overflow-hidden flex items-center justify-center">
            <img
              src={currentView === 'back' ? (backImage ?? frontImage) : frontImage}
              alt={currentView}
              className="h-full w-full object-contain"
            />
          </div>
          <span className="text-[9px] leading-tight text-center">Sides</span>
        </button>
      )}
      {tools.map(tool => {
        const isActive = activeTool === tool.name;
        const Icon = tool.icon;
        return (
          <button
            key={tool.name}
            type="button"
            onClick={() => toggleTool(tool.name as ToolName)}
            className={`relative flex flex-1 min-w-0 flex-col items-center gap-0.5 px-0.5 py-1.5 transition ${
              isActive ? 'text-orange-600' : 'text-orange-500'
            }`}
          >
            {isActive && <div className="absolute top-0 left-0 right-0 h-0.5 bg-orange-500" />}
            <Icon className="h-5 w-5 shrink-0" />
            <span className="text-[9px] leading-tight text-center whitespace-pre-line">{tool.label}</span>
          </button>
        );
      })}
    </nav>
  );

  /* ---------------------------------------------------------------- */
  /*  Render: Tool Panels                                              */
  /* ---------------------------------------------------------------- */

  const panelBase = 'fixed z-30 bg-white shadow-xl overflow-y-auto';
  const desktopPanel = `${panelBase} top-16 bottom-0 left-20 w-80 border-r border-gray-200 hidden md:block`;
  // Mobile sheet: width is pinned via inline style (vpWidth) so we only
  // need left-0 here, not inset-x-0. overflow-x-hidden clips any wide
  // content (the Shapes 3-card grid, etc.) at the panel edge.
  // bottom anchor is set inline to clear the mobile bottom nav (the
  // Product Details label wraps to two lines so the nav is ~64px tall).
  const mobilePanel = `${panelBase} overflow-x-hidden left-0 mobile-max-35vh rounded-t-2xl border-t border-gray-200 md:hidden`;

  const panelHeader = (title: string, action?: React.ReactNode) => (
    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 gap-2">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <div className="flex items-center gap-2">
        {action}
        <button type="button" onClick={() => setActiveTool(null)} className="text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  // --- Upload Panel ---
  const uploadPanelContent = (
    <div className="p-4 space-y-4">
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
        onClick={() => fileRef.current?.click()}
        className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center transition hover:border-red-500"
      >
        <Upload className="h-8 w-8 text-gray-400" />
        <p className="text-sm text-gray-600 font-medium">Drag & drop or click to upload</p>
        <p className="text-xs text-gray-400">PNG, JPG, SVG</p>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".png,.jpg,.jpeg,.svg"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      {uploadedImages.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Uploaded</p>
          <div className="grid grid-cols-3 gap-2">
            {uploadedImages.map((url, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { setPendingUpload(url); setActiveTool(null); }}
                className="aspect-square rounded-lg border border-gray-200 bg-gray-50 overflow-hidden hover:border-red-400 transition"
              >
                <img src={url} alt="Uploaded" className="w-full h-full object-contain p-1" />
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-1">Click an image to place it on the canvas</p>
        </div>
      )}
    </div>
  );

  // --- Text Panel ---
  // Minimal Add-Text panel: just the input + Add button. Size, color,
  // font etc. are tweakable in the Edit Text drawer *after* the text is
  // placed, so they don't need to clutter the Add panel (which otherwise
  // covered most of the t-shirt preview on mobile).
  // The Add button lives in the panel header (see textPanelAction below)
  // so the input gets the full panel width to itself.
  const textPanelContent = (
    <div className="p-3">
      <input
        placeholder="Enter your text..."
        value={textInput}
        onChange={e => setTextInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') addTextToCanvas(); }}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
        autoFocus
      />
    </div>
  );

  const textPanelAction = (
    <button
      type="button"
      onClick={addTextToCanvas}
      disabled={!textInput.trim()}
      className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
    >
      Add
    </button>
  );

  // --- Art Panel ---

  // Iconify search only works well with single keywords

  const ART_CATEGORIES = [
    { name: 'Most Popular', emoji: '\u2764\uFE0F', query: 'heart' },
    { name: 'Emojis', emoji: '\uD83D\uDE0A', query: 'emoji' },
    { name: 'Shapes & Symbols', emoji: '\u2B50', query: 'star' },
    { name: 'Sports & Games', emoji: '\u26BD', query: 'sport' },
    { name: 'Letters & Numbers', emoji: '\uD83D\uDD24', query: 'alphabet' },
    { name: 'Animals', emoji: '\uD83D\uDC3E', query: 'animal' },
    { name: 'Mascots', emoji: '\uD83D\uDC3B', query: 'bear' },
    { name: 'Nature', emoji: '\uD83C\uDF3F', query: 'flower' },
    { name: 'America', emoji: '\uD83C\uDDFA\uD83C\uDDF8', query: 'flag' },
    { name: 'Parties & Events', emoji: '\uD83C\uDF89', query: 'party' },
    { name: 'Military', emoji: '\u2B50', query: 'shield' },
    { name: 'Occupations', emoji: '\uD83D\uDC77', query: 'worker' },
    { name: 'Colleges', emoji: '\uD83C\uDFDB\uFE0F', query: 'school' },
    { name: 'Music', emoji: '\uD83C\uDFB5', query: 'music' },
    { name: 'Transportation', emoji: '\uD83D\uDE97', query: 'car' },
    { name: 'Greek Life', emoji: '\uD83C\uDFDB\uFE0F', query: 'trophy' },
    { name: 'School', emoji: '\uD83C\uDF93', query: 'graduation' },
    { name: 'Charity', emoji: '\uD83C\uDF97\uFE0F', query: 'ribbon' },
    { name: 'People', emoji: '\uD83D\uDC65', query: 'people' },
    { name: 'Religion', emoji: '\u271D\uFE0F', query: 'cross' },
    { name: 'Food & Drink', emoji: '\uD83C\uDF55', query: 'food' },
    { name: 'Seasons & Holidays', emoji: '\u2744\uFE0F', query: 'christmas' },
  ];


  const fetchLibraryArt = useCallback(async (opts: { category?: string; q?: string } = {}) => {
    setLibraryLoading(true);
    try {
      const params = new URLSearchParams();
      if (opts.category) params.set('category', opts.category);
      if (opts.q) params.set('q', opts.q);
      const res = await fetch(`/api/design/art-library?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLibraryArt(data);
      }
    } catch {
      setLibraryArt([]);
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  // Load all library art once when Designs tab is opened
  const hasLoadedDesigns = useRef(false);
  useEffect(() => {
    if (activeTool === 'art' && artSource === 'designs' && !hasLoadedDesigns.current) {
      hasLoadedDesigns.current = true;
      fetchLibraryArt({ category: 'all' });
    }
  }, [activeTool, artSource, fetchLibraryArt]);

  const fetchArtIcons = useCallback(async (query: string) => {
    setArtLoading(true);
    setArtIcons([]);
    try {
      const res = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=40`);
      const data = await res.json();
      const icons: { prefix: string; name: string }[] = (data.icons ?? []).map((ic: string) => {
        const parts = ic.split(':');
        return { prefix: parts[0], name: parts[1] };
      });
      setArtIcons(icons);
    } catch {
      setArtIcons([]);
    } finally {
      setArtLoading(false);
    }
  }, []);

  const handleArtIconClick = useCallback((prefix: string, name: string) => {
    const encodedColor = encodeURIComponent(artColor);
    const svgUrl = `https://api.iconify.design/${prefix}/${name}.svg?height=128&color=${encodedColor}`;
    addDesignElement({ type: 'image', x: 25, y: 20, width: 20, content: svgUrl });
  }, [addDesignElement, artColor]);

  const filteredDesigns = libraryArt.filter(a =>
    designsCategory === 'all' ? true : a.category === designsCategory
  );
  const designCategoryList = Array.from(new Set(libraryArt.map(a => a.category))).filter(Boolean).sort();

  const artPanelContent = (
    <div>
      {/* Source tabs */}
      <div className="px-4 pt-4">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => { setArtSource('designs'); setArtCategory(null); setArtSearch(''); }}
            className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold transition ${
              artSource === 'designs' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Designs
          </button>
          <button
            type="button"
            onClick={() => { setArtSource('clipart'); setArtCategory(null); setArtSearch(''); }}
            className={`flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold transition ${
              artSource === 'clipart' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Image className="h-3.5 w-3.5" />
            Clipart
          </button>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder={artSource === 'designs' ? 'Search designs...' : 'Search clipart...'}
            value={artSearch}
            onChange={e => {
              const v = e.target.value;
              setArtSearch(v);
              if (artSource === 'designs') {
                fetchLibraryArt({ q: v.trim() || undefined, category: designsCategory === 'all' ? undefined : designsCategory });
              }
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && artSource === 'clipart' && artSearch.trim()) {
                setArtCategory(artSearch.trim());
                fetchArtIcons(artSearch.trim());
              }
            }}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>

        {/* Clipart color picker (only for clipart source) */}
        {artSource === 'clipart' && (
          <div className="rounded-lg bg-gray-50 px-3 py-2">
            <span className="block text-xs font-semibold text-gray-500 mb-1.5">Icon Color</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {['#000000', '#FFFFFF', '#dc2626', '#2563eb', '#16a34a', '#f59e0b', '#7c3aed', '#ec4899'].map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setArtColor(c)}
                  className={`h-6 w-6 shrink-0 rounded-full border-2 transition ${artColor === c ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-300'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                value={artColor}
                onChange={e => setArtColor(e.target.value)}
                className="h-6 w-6 shrink-0 cursor-pointer rounded border-none"
                title="Custom color"
              />
            </div>
          </div>
        )}

        {/* ========= DESIGNS TAB ========= */}
        {artSource === 'designs' && (
          <div>
            {/* Category chips */}
            {designCategoryList.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto pb-2 mb-1 -mx-1 px-1 scrollbar-thin">
                <button
                  onClick={() => {
                    setDesignsCategory('all');
                    fetchLibraryArt({ q: artSearch.trim() || undefined });
                  }}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
                    designsCategory === 'all'
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  All
                </button>
                {designCategoryList.map(cat => (
                  <button
                    key={cat}
                    onClick={() => {
                      setDesignsCategory(cat);
                      fetchLibraryArt({ category: cat, q: artSearch.trim() || undefined });
                    }}
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
                      designsCategory === cat
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {libraryLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : filteredDesigns.length === 0 ? (
              <div className="text-center py-12">
                <Sparkles className="mx-auto h-8 w-8 text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">
                  {artSearch ? 'No designs match your search' : 'No designs available yet'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {filteredDesigns.map(art => (
                  <button
                    key={art.id}
                    onClick={() => addDesignElement({ type: 'image', x: 20, y: 15, width: 25, content: art.image_url })}
                    className="group relative aspect-square rounded-lg border border-gray-200 bg-white p-2 hover:border-red-400 hover:shadow-md transition-all"
                    title={art.name}
                  >
                    <img src={art.image_url} alt={art.name} className="w-full h-full object-contain rounded" loading="lazy" />
                    <span className="absolute inset-x-0 bottom-0 rounded-b-lg bg-gradient-to-t from-black/60 to-transparent px-2 py-1 text-[10px] font-medium text-white opacity-0 group-hover:opacity-100 transition truncate">
                      {art.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========= CLIPART TAB ========= */}
        {artSource === 'clipart' && (
          <>
            {artCategory ? (
              <div>
                <button
                  onClick={() => { setArtCategory(null); setArtIcons([]); setArtSearch(''); }}
                  className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700 font-medium mb-3"
                >
                  <ArrowLeft className="h-4 w-4" /> Back to Categories
                </button>
                <p className="text-xs text-gray-500 mb-2">
                  Results for &ldquo;{artCategory}&rdquo;
                </p>
                {artLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                  </div>
                ) : artIcons.length === 0 ? (
                  <p className="text-center text-gray-500 py-12 text-sm">No icons found</p>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {artIcons.map((ic) => (
                      <button
                        key={`${ic.prefix}:${ic.name}`}
                        onClick={() => handleArtIconClick(ic.prefix, ic.name)}
                        className="aspect-square rounded-lg border border-gray-200 bg-white p-2 hover:border-red-400 hover:shadow-sm transition-all flex items-center justify-center"
                        title={ic.name}
                      >
                        <img
                          src={`https://api.iconify.design/${ic.prefix}/${ic.name}.svg?height=48&color=${encodeURIComponent(artColor)}`}
                          alt={ic.name}
                          className="w-8 h-8 object-contain"
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.opacity = '0.2'; }}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {ART_CATEGORIES.map(cat => (
                  <button
                    key={cat.name}
                    onClick={() => { setArtCategory(cat.name); fetchArtIcons(cat.query); }}
                    className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left hover:border-red-400 hover:shadow-sm transition-all"
                  >
                    <span className="text-lg">{cat.emoji}</span>
                    <span className="text-xs font-medium text-gray-700 leading-tight">{cat.name}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  // --- Products Panel ---
  const productsPanelContent = (
    <div className="p-4 space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search t-shirts, hoodies, polos..."
          value={productSearch}
          onChange={e => setProductSearch(e.target.value)}
          className="w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      </div>
      {productsLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : products.length === 0 ? (
        <p className="text-center text-gray-500 py-16 text-sm">No products found</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {products.map(product => (
            <button
              key={product.ss_id}
              type="button"
              onClick={() => {
                setSelectedProduct(product);
                setSelectedColorIdx(0);
                // Close the Change Products panel so the user immediately
                // sees the new product on the canvas.
                setActiveTool(null);
              }}
              className={`rounded-lg border overflow-hidden text-left hover:shadow-md transition ${
                selectedProduct?.ss_id === product.ss_id
                  ? 'border-red-500 ring-1 ring-red-500'
                  : 'border-gray-200 hover:border-gray-400'
              }`}
            >
              <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="w-full h-full object-contain p-1" loading="lazy" />
                ) : (
                  <span className="text-gray-400 text-[10px]">{product.category}</span>
                )}
              </div>
              <div className="p-1.5">
                <p className="text-[9px] uppercase tracking-wider text-gray-400">{product.brand}</p>
                <p className="text-[11px] font-semibold text-gray-900 truncate">{product.name}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // --- Change Color Panel — swatches only, no product chrome. Smaller
  // swatches on mobile so more colors fit without scrolling. ---
  const detailsPanelContent = (
    <div className="p-3 md:p-4">
      {selectedProduct && productColors.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 md:gap-2">
          {productColors.map((c, i) => (
            <button
              key={i}
              type="button"
              title={c.name}
              onClick={() => { setSelectedColorIdx(i); setUserPickedColor(true); }}
              className={`h-7 w-7 md:h-8 md:w-8 rounded-full border-2 transition ${
                selectedColorIdx === i ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
              }`}
              style={{ backgroundColor: c.hex || '#ccc' }}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">No colors available</p>
      )}
    </div>
  );

  // Shapes panel (Phase 2 — geometric primitives). Each click drops a
  // square-aspect shape on the current side at sensible defaults; the
  // user can resize / recolor / restroke via the existing image-style
  // floating toolbar (the shape uses the same x/y/width/rotation/opacity
  // wiring images do, plus shapeType/color/strokeColor/strokeWidth).
  const SHAPE_PALETTE = [
    '#111827', '#FFFFFF', '#EF4444', '#F97316', '#F59E0B', '#84CC16',
    '#10B981', '#06B6D4', '#3B82F6', '#6366F1', '#A855F7', '#EC4899',
  ];
  // When a shape element is currently selected, color/line/fill changes
  // in the panel update that shape live. With nothing selected, the
  // changes set defaults for the next shape the user drops. selectedEl
  // is declared further down (after panel content), so we look the
  // shape up directly from designElements here.
  const selectedShape = designElements.find((e) => e.id === selectedElementId && e.type === 'shape') ?? null;
  const selectedShapeId = selectedShape?.id ?? null;
  const applyShapeStyle = (overrides: { color?: string; strokeWidth?: number; mode?: 'fill' | 'outline' }) => {
    if (!selectedShape) return;
    const isLine = selectedShape.shapeType === 'line';
    const nextColor = overrides.color ?? shapeColor;
    const nextWidth = overrides.strokeWidth ?? shapeStrokeWidth;
    const nextMode = overrides.mode ?? shapeFillMode;
    const useOutline = isLine || nextMode === 'outline';
    updateElement(selectedShape.id, {
      color: useOutline ? 'transparent' : nextColor,
      strokeColor: useOutline ? nextColor : undefined,
      strokeWidth: useOutline ? nextWidth : undefined,
    });
  };
  const shapesPanelContent = (
    <div className="p-4 space-y-5">
      {/* 1. Shape grid */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Shape</p>
        <div className="grid grid-cols-3 gap-2">
          {([
            { type: 'rect',     label: 'Rectangle', icon: Square },
            { type: 'circle',   label: 'Circle',    icon: Circle },
            { type: 'triangle', label: 'Triangle',  icon: Triangle },
            { type: 'line',     label: 'Line',      icon: Minus },
            { type: 'star',     label: 'Star',      icon: Star },
            { type: 'heart',    label: 'Heart',     icon: Heart },
          ] as const).map(s => {
            // Line shape is intrinsically a stroke — fill mode doesn't
            // apply, so we always use shapeColor as the stroke.
            const isLine = s.type === 'line';
            const useOutline = isLine || shapeFillMode === 'outline';
            return (
              <button
                key={s.type}
                type="button"
                onClick={() => {
                  addDesignElement({
                    type: 'shape',
                    shapeType: s.type,
                    x: 35,
                    y: 22,
                    width: 30,
                    // Default height = width (square aspect). User changes by
                    // dragging a corner; Shift preserves the original ratio.
                    height: 30,
                    content: '',
                    color: useOutline ? 'transparent' : shapeColor,
                    strokeColor: useOutline ? shapeColor : undefined,
                    strokeWidth: useOutline ? shapeStrokeWidth : undefined,
                    rotation: 0,
                  }, { keepPanelOpen: true });
                }}
                className="flex flex-col items-center gap-1 rounded-lg border border-gray-200 px-2 py-3 hover:border-blue-500 hover:bg-blue-50 transition"
              >
                <s.icon
                  className="h-7 w-7"
                  style={useOutline ? { color: shapeColor } : { color: shapeColor, fill: shapeColor }}
                />
                <span className="text-[10px] font-medium text-gray-700">{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Color + fill mode */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Color {selectedShapeId && <span className="ml-1 text-blue-600 normal-case">· editing selection</span>}
          </p>
          <div className="flex gap-1 rounded-full bg-gray-100 p-0.5">
            {(['fill', 'outline'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => { setShapeFillMode(mode); applyShapeStyle({ mode }); }}
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition ${
                  shapeFillMode === mode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {SHAPE_PALETTE.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => { setShapeColor(c); applyShapeStyle({ color: c }); }}
              aria-label={`Use color ${c}`}
              className={`relative h-7 w-full rounded-md border transition ${
                shapeColor === c ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-gray-400'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs text-gray-500">
          <input
            type="color"
            value={shapeColor}
            onChange={(e) => { setShapeColor(e.target.value); applyShapeStyle({ color: e.target.value }); }}
            className="h-7 w-7 cursor-pointer rounded border border-gray-300"
            aria-label="Pick a custom color"
          />
          Custom color
        </label>
      </div>

      {/* 3. Line width — only meaningful for outline + line shapes */}
      <div>
        <div className="flex items-baseline justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Line width</p>
          <span className="text-xs font-medium text-gray-700">{shapeStrokeWidth}px</span>
        </div>
        <input
          type="range"
          min={1}
          max={20}
          value={shapeStrokeWidth}
          onChange={(e) => { const w = Number(e.target.value); setShapeStrokeWidth(w); applyShapeStyle({ strokeWidth: w }); }}
          className="mt-1 w-full accent-blue-600"
        />
        <p className="mt-0.5 text-[10px] text-gray-400">Applies to outline shapes and the line tool.</p>
      </div>
    </div>
  );

  // --- AI Design Panel — bare prompt → image, no chat persona. ---
  async function handleAiGenerate() {
    const prompt = aiPrompt.trim();
    if (!prompt || aiGenerating) return;
    setAiGenerating(true);
    setAiError(null);
    try {
      const { imageUrl } = await generateDesignImage(prompt);
      addDesignElement({ type: 'image', x: 25, y: 22, width: 50, content: imageUrl });
      setAiPrompt('');
      setActiveTool(null);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setAiGenerating(false);
    }
  }

  const aiPanelContent = (
    <div className="p-4 space-y-3">
      <textarea
        value={aiPrompt}
        onChange={(e) => setAiPrompt(e.target.value)}
        placeholder="Describe your design — e.g. 'a black panther head with red flames behind it, bold vector style, no background'"
        rows={5}
        disabled={aiGenerating}
        className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50"
      />
      <button
        type="button"
        onClick={handleAiGenerate}
        disabled={!aiPrompt.trim() || aiGenerating}
        className="w-full rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:bg-orange-500 transition"
      >
        {aiGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {aiGenerating ? 'Generating…' : 'Generate'}
      </button>
      {aiError && (
        <p className="text-xs text-red-600">{aiError}</p>
      )}
    </div>
  );

  const panelContentMap: Record<string, { title: string; content: React.ReactNode; action?: React.ReactNode }> = {
    upload: { title: 'Upload Design', content: uploadPanelContent },
    text: { title: 'Add Text', content: textPanelContent, action: textPanelAction },
    art: { title: 'Add Art', content: artPanelContent },
    shapes: { title: 'Add Shape', content: shapesPanelContent },
    details: { title: 'Change Color', content: detailsPanelContent },
    products: { title: 'Change Products', content: productsPanelContent },
    ai: { title: 'AI Design', content: aiPanelContent },
  };

  const activePanel = activeTool ? panelContentMap[activeTool] : null;

  const toolPanel = activePanel ? (
    <>
      {/* Desktop panel */}
      <div className={desktopPanel}>
        {panelHeader(activePanel.title, activePanel.action)}
        {activePanel.content}
      </div>
      {/* Mobile panel */}
      <div
        className={mobilePanel}
        style={{
          // 4.5rem clears the mobile bottom toolbar (~64px because
          // "Product Details" wraps to two lines). Plus keyboard inset.
          bottom: `calc(4.5rem + ${kbInset}px)`,
          width: vpWidth ? `${vpWidth}px` : undefined,
          maxWidth: vpWidth ? `${vpWidth}px` : undefined,
        }}
      >
        {panelHeader(activePanel.title, activePanel.action)}
        {activePanel.content}
      </div>
    </>
  ) : null;

  /* ---------------------------------------------------------------- */
  /*  Selected element + text editor state                             */
  /* ---------------------------------------------------------------- */

  const selectedEl = designElements.find(e => e.id === selectedElementId);
  const showTextEditor = selectedEl?.type === 'text';

  // Preload all Google Fonts when text editor opens
  useEffect(() => {
    if (showTextEditor) {
      preloadAllFonts();
      // Force re-render once fonts finish loading
      document.fonts.ready.then(() => setFontsReady(n => n + 1));
    }
  }, [showTextEditor]);

  /* ---------------------------------------------------------------- */
  /*  Render: Image Edit Toolbar (floating, compact)                   */
  /* ---------------------------------------------------------------- */

  const [imgPop, setImgPop] = useState<string | null>(null);
  useEffect(() => { setImgPop(null); }, [selectedElementId]);
  const [textPop, setTextPop] = useState<string | null>(null);
  useEffect(() => { setTextPop(null); }, [selectedElementId]);
  // Crop modal: id of the image element being cropped, null = closed.
  const [croppingElementId, setCroppingElementId] = useState<string | null>(null);
  const croppingElement = croppingElementId
    ? designElements.find(e => e.id === croppingElementId) ?? null
    : null;

  const imageToolbar = selectedEl && selectedEl.type === 'image' ? (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-0.5 bg-white rounded-xl shadow-lg border border-gray-200 px-1.5 py-1 max-w-[calc(100vw-1rem)] overflow-x-auto">

      {/* Size */}
      <div className="relative">
        <button type="button" onClick={() => setImgPop(imgPop === 'sz' ? null : 'sz')} className={`px-2 py-1.5 rounded-md text-[10px] font-semibold flex flex-col items-center w-11 ${imgPop === 'sz' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}>⤢<span>Size</span></button>
        {imgPop === 'sz' && <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white border rounded-lg shadow-xl p-3 w-48 z-50"><div className="flex items-center gap-2"><input type="range" min={5} max={80} value={selectedEl.width} onChange={e => updateElement(selectedEl.id, { width: Number(e.target.value) })} className="flex-1 accent-blue-600" /><span className="text-xs w-10 text-right">{selectedEl.width}%</span></div></div>}
      </div>

      {/* Crop — opens the visual crop modal. Replaces el.content with the
          cropped data URL on Apply; the new image's natural aspect drives
          the bounding box height automatically. */}
      <button
        type="button"
        onClick={() => setCroppingElementId(selectedEl.id)}
        title="Crop image"
        className="px-2 py-1.5 rounded-md text-[10px] font-semibold flex flex-col items-center w-11 text-gray-600 hover:bg-gray-100"
      >
        <CropIcon className="h-3.5 w-3.5" />
        <span>Crop</span>
      </button>

      {/* Rotate */}
      <div className="relative">
        <button type="button" onClick={() => setImgPop(imgPop === 'rt' ? null : 'rt')} className={`px-2 py-1.5 rounded-md text-[10px] font-semibold flex flex-col items-center w-11 ${imgPop === 'rt' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}>↻<span>Rotate</span></button>
        {imgPop === 'rt' && <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white border rounded-lg shadow-xl p-3 w-48 z-50"><div className="flex items-center gap-2"><input type="range" min={-180} max={180} value={selectedEl.rotation ?? 0} onChange={e => updateElement(selectedEl.id, { rotation: Number(e.target.value) })} className="flex-1 accent-blue-600" /><span className="text-xs w-10 text-right">{selectedEl.rotation ?? 0}°</span></div></div>}
      </div>

      {/* Corners */}
      <div className="relative">
        <button type="button" onClick={() => setImgPop(imgPop === 'cr' ? null : 'cr')} className={`px-2 py-1.5 rounded-md text-[10px] font-semibold flex flex-col items-center w-11 ${imgPop === 'cr' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}>⬜<span>Corners</span></button>
        {imgPop === 'cr' && <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white border rounded-lg shadow-xl p-3 w-48 z-50"><div className="flex items-center gap-2"><input type="range" min={0} max={50} value={selectedEl.borderRadius ?? 0} onChange={e => updateElement(selectedEl.id, { borderRadius: Number(e.target.value) })} className="flex-1 accent-blue-600" /><span className="text-xs w-10 text-right">{selectedEl.borderRadius ?? 0}%</span></div></div>}
      </div>

      {/* Opacity */}
      <div className="relative">
        <button type="button" onClick={() => setImgPop(imgPop === 'op' ? null : 'op')} className={`px-2 py-1.5 rounded-md text-[10px] font-semibold flex flex-col items-center w-11 ${imgPop === 'op' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}>◐<span>Opacity</span></button>
        {imgPop === 'op' && <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white border rounded-lg shadow-xl p-3 w-48 z-50"><div className="flex items-center gap-2"><input type="range" min={0} max={100} value={Math.round((selectedEl.opacity ?? 1) * 100)} onChange={e => updateElement(selectedEl.id, { opacity: Number(e.target.value) / 100 })} className="flex-1 accent-blue-600" /><span className="text-xs w-10 text-right">{Math.round((selectedEl.opacity ?? 1) * 100)}%</span></div></div>}
      </div>

      {/* Filter */}
      <div className="relative">
        <button type="button" onClick={() => setImgPop(imgPop === 'fl' ? null : 'fl')} className={`px-2 py-1.5 rounded-md text-[10px] font-semibold flex flex-col items-center w-11 ${imgPop === 'fl' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}>🎨<span>Filter</span></button>
        {imgPop === 'fl' && <div className="absolute top-full right-0 mt-2 bg-white border rounded-lg shadow-xl p-2 flex gap-1 z-50">{(['none','grayscale','bw','sepia','invert'] as const).map(f => <button key={f} type="button" onClick={() => { updateElement(selectedEl.id, { filter: f }); setImgPop(null); }} className={`px-2 py-1.5 rounded text-[10px] font-medium whitespace-nowrap ${(selectedEl.filter ?? 'none') === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{f === 'none' ? 'None' : f === 'grayscale' ? 'Gray' : f === 'bw' ? 'B&W' : f === 'sepia' ? 'Sepia' : 'Invert'}</button>)}</div>}
      </div>

      {/* Layer */}
      <div className="relative">
        <button type="button" onClick={() => setImgPop(imgPop === 'ly' ? null : 'ly')} className={`px-2 py-1.5 rounded-md text-[10px] font-semibold flex flex-col items-center w-11 ${imgPop === 'ly' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}>☰<span>Layer</span></button>
        {imgPop === 'ly' && <div className="absolute top-full right-0 mt-2 bg-white border rounded-lg shadow-xl p-2 flex flex-col gap-1 min-w-[130px] z-50">
          <button type="button" onClick={() => { bringToFront(selectedEl.id); setImgPop(null); }} className="px-3 py-1.5 rounded text-xs font-medium bg-gray-100 hover:bg-gray-200 text-left">⬆ Front</button>
          <button type="button" onClick={() => { bringForward(selectedEl.id); setImgPop(null); }} className="px-3 py-1.5 rounded text-xs font-medium bg-gray-100 hover:bg-gray-200 text-left">↑ Forward</button>
          <button type="button" onClick={() => { sendBackward(selectedEl.id); setImgPop(null); }} className="px-3 py-1.5 rounded text-xs font-medium bg-gray-100 hover:bg-gray-200 text-left">↓ Backward</button>
          <button type="button" onClick={() => { sendToBack(selectedEl.id); setImgPop(null); }} className="px-3 py-1.5 rounded text-xs font-medium bg-gray-100 hover:bg-gray-200 text-left">⬇ Back</button>
        </div>}
      </div>

      <div className="w-px h-7 bg-gray-200 mx-0.5" />

      {/* Remove BG */}
      <button type="button" disabled={canvasRemovingBg} onClick={() => removeBgOnCanvas(selectedEl.id)} className="px-2 py-1.5 rounded-md text-[10px] font-semibold flex flex-col items-center w-14 text-purple-600 hover:bg-purple-50 disabled:opacity-50">✂️<span>{canvasRemovingBg ? '...' : 'Rm BG'}</span></button>

      {/* Duplicate */}
      <button type="button" onClick={() => duplicateElement(selectedEl.id)} className="px-2 py-1.5 rounded-md text-[10px] font-semibold flex flex-col items-center w-11 text-gray-600 hover:bg-gray-100">⧉<span>Copy</span></button>

      {/* Delete */}
      <button type="button" onClick={() => removeElement(selectedEl.id)} className="px-2 py-1.5 rounded-md text-[10px] font-semibold flex flex-col items-center w-11 text-red-600 hover:bg-red-50">🗑<span>Delete</span></button>

      <div className="w-px h-7 bg-gray-200 mx-0.5" />

      {/* Done */}
      <button type="button" onClick={() => setSelectedElementId(null)} className="px-2 py-1.5 rounded-md text-[10px] text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="h-4 w-4" /></button>
    </div>
  ) : null;

  /* ---------------------------------------------------------------- */
  /*  Render: Center Canvas                                            */
  /* ---------------------------------------------------------------- */

  // Mobile uses a floating top toolbar (no offset). Desktop uses the
  // textSidePanel in the left flyout, so add the 320px offset there.
  const canvasLeftOffset = (activeTool || showWelcome || showTextEditor) ? 'md:ml-80' : '';
  // On mobile, reserve room only when a bottom sheet (tool / welcome / text
  // panels) is actually open. Otherwise just clear the bottom nav (h-12).
  // The old static `pb-64` ate ~30% of the viewport on phones for nothing.
  const mobileBottomPad = (activeTool || showWelcome || showTextEditor) ? 'pb-[42vh]' : 'pb-14';
  // Phase 2 PR #10: layers panel takes 18rem of the right edge in Fabric
  // mode. Add a matching margin so the canvas isn't covered. Legacy mode
  // pays nothing for this — the panel doesn't render and the class isn't
  // applied.
  const canvasRightOffset = useFabricRenderer ? 'md:mr-72' : '';

  const canvas = (
    <main
      className={`relative flex-1 flex flex-col items-center justify-start md:justify-center bg-gray-100 pt-16 ${mobileBottomPad} md:pt-16 md:pb-16 md:ml-20 ${canvasLeftOffset} ${canvasRightOffset} transition-all duration-200 overflow-auto overscroll-contain`}
      onClick={() => {
        // Don't auto-deselect while the Edit Text side panel / toolbar is
        // open — the side panel has its own X to close. Without this, any
        // stray click in the canvas area (e.g., after typing) collapsed
        // the side panel.
        if (showTextEditor) return;
        setSelectedElementId(null);
      }}
    >
      {/* Product image + overlay area. Aspect ratio mirrors the per-design
          canvasInches × canvasInchesH so the surface visually matches the
          print rectangle. Generous pb-64 on main gives the scroll container
          enough runway to bring the full canvas into view past any bottom
          panel / mobile toolbar. */}
      <div className="relative w-full max-w-none md:max-w-5xl lg:max-w-6xl xl:max-w-7xl px-0 md:px-4 grid place-items-center" ref={canvasRef}>
        {/* Product backdrop — fills a square area at the wrapper width.
            Print-zone overlay is positioned in % of THIS box, not of the
            old canvasInches-aspect design surface. */}
        <div
          ref={(node) => {
            productBgRef.current = node;
            designSurfaceRef.current = node;
          }}
          className="relative bg-white rounded-2xl shadow-sm overflow-hidden select-none"
          style={{
            touchAction: 'pinch-zoom',
            aspectRatio: '1 / 1',
            width: `${100 * canvasZoom}%`,
            // Cap by viewport height so the shirt fits vertically instead
            // of being sized purely by the parent's width. 10rem covers
            // header (4rem) + a bit of top/bottom breathing room + the
            // mobile bottom nav. maxWidth mirrors maxHeight so aspect
            // ratio stays 1:1 even when the vh cap kicks in.
            maxHeight: `calc((100vh - 10rem) * ${canvasZoom})`,
            maxWidth: `calc((100vh - 10rem) * ${canvasZoom})`,
            // cqw font scaling now keys off the shirt-photo box itself.
            containerType: 'inline-size',
          }}
        >
          {displayImage ? (
            <img
              ref={productImgRef}
              src={displayImage}
              alt={selectedProduct?.name ?? 'Product'}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              draggable={false}
            />
          ) : blankCanvasMode ? (
            <div className="absolute inset-4 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center pointer-events-none">
              <p className="text-sm text-gray-400 font-medium">Blank canvas — add text, art, or AI designs</p>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
              <Shirt className="h-16 w-16 mb-2" />
              <p className="text-sm font-medium">Select a product to start designing</p>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setActiveTool('products'); }}
                className="mt-2 text-sm text-red-600 font-semibold hover:underline"
              >
                Browse Products
              </button>
            </div>
          )}

          {/* No print-zone constraint: design elements live directly on
              the product photo and can be dragged/resized anywhere on it.
              WYSIWYG without bounds. Placement state still exists in case
              we want it back as a non-constraining export hint later. */}

          {/* Fabric renderer (gated on ?canvas=fabric). Sibling of the legacy
              element loop below — never both at once. The bridge owns its
              own <canvas> element which fills the parent via CSS. */}
          {useFabricRenderer && (
            <div className="absolute inset-0">
              {/* Suspense fallback shows a small spinner during the lazy chunk
                  load. The page's local DesignElement is stricter than the
                  design-studio module's (page narrows textShape to a union;
                  module accepts any string). Cast through unknown at the
                  boundary — both shapes are layout-compatible at runtime.
                  The duplicate type goes away when DesignStudioPage stops
                  declaring its own DesignElement. */}
              <Suspense
                fallback={
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
                  </div>
                }
              >
                <FabricRendererBridge
                  ref={fabricBridgeRef}
                  userRole={isAdmin ? 'admin' : 'customer'}
                  designElements={designElements as unknown as Parameters<typeof FabricRendererBridge>[0]['designElements']}
                  selectedElementId={selectedElementId}
                  currentView={currentView}
                  displayImage={displayImage}
                  onElementsChange={(next) => setDesignElements(next as unknown as DesignElement[])}
                  onSelectElement={setSelectedElementId}
                />
              </Suspense>
            </div>
          )}

          {/* Design elements on canvas — only render the ones belonging to
              the current view (front/back/sleeve). Legacy elements with no
              `side` are treated as 'front'. Hidden when ?canvas=fabric is
              active so the renderers don't double up. */}
          {!useFabricRenderer && designElements.filter(el => (el.side ?? 'front') === currentView).map(el => {
            const isSelected = selectedElementId === el.id;
            if (el.type === 'text' && el.fontFamily) loadGoogleFont(el.fontFamily);
            return (
              <div
                key={el.id}
                onMouseDown={e => handleElementMouseDown(e, el.id, 'move')}
                onTouchStart={e => handleElementTouchStart(e, el.id, 'move')}
                onClick={e => {
                  e.stopPropagation();
                  setSelectedElementId(el.id);
                  // On mobile, selecting a canvas element closes any open
                  // tool panel so the user can see / manipulate the element.
                  if (typeof window !== 'undefined' && window.innerWidth < 768) {
                    setActiveTool(null);
                  }
                }}
                className={`absolute cursor-move ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
                style={{
                  left: `${el.x}%`,
                  top: `${el.y}%`,
                  width: `${el.width}%`,
                  // Shapes get an explicit height so they can be sized
                  // non-square via free corner drag. Image / text leave
                  // height unset and derive it from natural aspect /
                  // fontSize, same as before.
                  height: el.type === 'shape' ? `${el.height ?? el.width}%` : undefined,
                  transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                  // Without this the browser steals single-finger touches
                  // for page scrolling, so dragging an element on mobile
                  // both moved the element and scrolled the canvas.
                  touchAction: 'none',
                }}
              >
                {el.type === 'shape' ? (
                  <ShapeSvg
                    shape={el.shapeType ?? 'rect'}
                    fill={el.color ?? '#ec4899'}
                    stroke={el.strokeColor}
                    strokeWidth={el.strokeWidth}
                    opacity={el.opacity}
                  />
                ) : el.type === 'image' ? (
                  <img
                    src={el.content}
                    alt="Design element"
                    className="w-full object-contain pointer-events-none drop-shadow-lg"
                    draggable={false}
                    style={{
                      borderRadius: el.borderRadius ? `${el.borderRadius}%` : undefined,
                      opacity: el.opacity != null ? el.opacity : undefined,
                      filter: el.filter === 'grayscale' ? 'grayscale(100%)'
                        : el.filter === 'invert' ? 'invert(100%)'
                        : el.filter === 'sepia' ? 'sepia(100%)'
                        : el.filter === 'bw' ? 'grayscale(100%) contrast(1000%)'
                        : undefined,
                    }}
                  />
                ) : el.textShape && el.textShape !== 'normal' ? (
                  <div className="pointer-events-none w-full">
                    <ShapedText
                      text={el.content}
                      shape={el.textShape}
                      intensity={el.shapeIntensity ?? 50}
                      fontSize={el.fontSize ?? 24}
                      color={el.color ?? '#fff'}
                      fontFamily={el.fontFamily ?? 'Inter'}
                      outline={el.outline}
                      letterSpacing={el.letterSpacing}
                      wordSpacing={el.wordSpacing}
                    />
                  </div>
                ) : (
                  <span
                    className="block whitespace-pre-wrap pointer-events-none"
                    style={{
                      // Compute fontSize in px from the measured surface
                      // width. cqw would be cleaner CSS but html2canvas
                      // doesn't resolve it correctly, so studio and capture
                      // disagreed on sizes by 2-4x — text overlapped art
                      // in the saved image even when it sat above in the
                      // studio. px is unambiguous in both.
                      fontSize: `${((el.fontSize ?? 24) * surfaceWidth) / 800}px`,
                      color: el.color ?? '#fff',
                      fontFamily: el.fontFamily ?? 'Inter',
                      fontWeight: 700,
                      textAlign: el.textAlign ?? 'center',
                      letterSpacing: el.letterSpacing != null ? `${el.letterSpacing}em` : undefined,
                      wordSpacing: el.wordSpacing != null ? `${el.wordSpacing}em` : undefined,
                      lineHeight: el.lineHeight ?? 1.2,
                      textShadow: el.outline ? `
                        -1px -1px 0 rgba(0,0,0,0.5), 1px -1px 0 rgba(0,0,0,0.5),
                        -1px 1px 0 rgba(0,0,0,0.5), 1px 1px 0 rgba(0,0,0,0.5)
                      ` : '0 1px 3px rgba(0,0,0,0.3)',
                    }}
                  >
                    {el.content}
                  </span>
                )}

                {/* Selection handles */}
                {isSelected && (
                  <>
                    {/* Corner resize handles */}
                    {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map(corner => (
                      <div
                        key={corner}
                        onMouseDown={e => handleElementMouseDown(e, el.id, 'resize')}
                        onTouchStart={e => handleElementTouchStart(e, el.id, 'resize')}
                        // Visible handle is small on desktop, larger on
                        // mobile. The wrapping div has a 24px touch hit-area
                        // (-inset-3) so corner grabs land on a finger-sized
                        // target without making the visible handle huge.
                        style={{ touchAction: 'none' }}
                        className={`absolute z-10 cursor-se-resize flex items-center justify-center -m-3 p-3 ${
                          corner === 'top-left'
                            ? '-top-3 -left-3'
                            : corner === 'top-right'
                              ? '-top-3 -right-3'
                              : corner === 'bottom-left'
                                ? '-bottom-3 -left-3'
                                : '-bottom-3 -right-3'
                        }`}
                      >
                        <span className="block w-4 h-4 md:w-3 md:h-3 bg-white border-2 border-blue-500 rounded-sm" />
                      </div>
                    ))}
                    {/* Delete button */}
                    <button
                      type="button"
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => {
                        e.stopPropagation();
                        removeElement(el.id);
                      }}
                      className="absolute -top-4 -right-4 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white shadow-md hover:bg-red-700 transition"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
            );
          })}

          {/* Placeholder when no elements on the current side. Suppressed
              under ?canvas=fabric — the Fabric canvas paints its own
              background and we don't want a stray overlay catching clicks.
              Anchor the rectangle where the print will actually land:
                front  → ~3in below the collar (t-shirts, hoodies, sweatshirts)
                back   → ~5in below the collar
                sleeve → centered on the sleeve
              Approximations assume a standard adult shirt ~28in tall,
              rendered as ~90% of canvas height with the collar landing
              near ~13% of canvas from top. */}
          {!useFabricRenderer && designElements.filter(el => (el.side ?? 'front') === currentView).length === 0 && displayImage && (
            <div
              className="absolute inset-x-0 flex justify-center pointer-events-none"
              style={{
                top: currentView === 'sleeve' ? '45%' : currentView === 'back' ? '25%' : '18%',
              }}
            >
              <div className="border-2 border-dashed border-gray-300 rounded-xl w-[28%] aspect-[3/2] flex flex-col items-center justify-center gap-1">
                <Move className="h-5 w-5 md:h-6 md:w-6 text-gray-400" />
                <span className="text-[10px] md:text-xs font-semibold text-gray-400 uppercase tracking-wider text-center px-1">
                  Your Design Here
                </span>
              </div>
            </div>
          )}

          {/* Dimension readout — bottom-left of the design surface. Shows
              the selected element's width / height in % of canvas + inches
              (assuming a 12" t-shirt print area). Hidden when nothing is
              selected. */}
          <DimensionReadout
            element={selectedEl ?? null}
            canvasInches={canvasInches}
            canvasInchesH={canvasInchesH}
          />
      </div>
      </div>

      {/* View Switcher — opens when the customer taps the Sides button on
          the left rail (or the bottom nav on mobile). Positioned flush
          with the left rail on desktop so it reads as a slide-out from
          that column. On mobile it hangs above the bottom nav. */}
      {selectedProduct && frontImage && !showWelcome && viewSwitcherOpen && (
        <div className="fixed left-2 md:left-20 top-20 md:top-20 z-40 flex flex-col gap-2 bg-white rounded-xl shadow-xl border border-gray-200 p-1.5">
          {(['front', 'back', 'sleeve'] as const).map(view => (
            <button
              key={view}
              type="button"
              onClick={e => {
                e.stopPropagation();
                setCurrentView(view);
                setViewSwitcherOpen(false);
              }}
              className={`flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1 transition ${
                currentView === view
                  ? 'border-red-500 bg-red-50 text-red-600'
                  : 'border-transparent bg-white text-gray-500 hover:border-gray-300'
              }`}
              title={view}
            >
              <div className="h-8 w-8 md:h-10 md:w-10 rounded bg-gray-100 overflow-hidden flex items-center justify-center">
                {frontImage && (
                  <img
                    src={view === 'back' ? (backImage ?? frontImage) : frontImage}
                    alt={view}
                    className="h-full w-full object-contain"
                  />
                )}
              </div>
              <span className="text-[9px] md:text-[11px] font-semibold capitalize">{view === 'sleeve' ? 'Slv' : view === 'back' ? 'Back' : 'Front'}</span>
            </button>
          ))}
        </div>
      )}
    </main>
  );

  /* ---------------------------------------------------------------- */
  /*  Render: Bottom-Right Product Card                                */
  /* ---------------------------------------------------------------- */

  /* ---------------------------------------------------------------- */
  /*  Render: Bottom Product Bar (CustomInk style)                     */
  /* ---------------------------------------------------------------- */

  const bottomBar = (
    <div className="fixed bottom-0 left-0 right-0 z-40 hidden md:flex items-center h-16 bg-white border-t border-gray-200 px-4 gap-4" onClick={e => e.stopPropagation()}>
      {/* Add Products button */}
      <button
        type="button"
        onClick={() => { setShowWelcome(false); setSelectedElementId(null); setActiveTool('products'); }}
        className="flex items-center gap-2 rounded-lg border-2 border-blue-600 px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 transition"
      >
        <span className="text-lg">+</span> Add Products
      </button>

      {/* Product thumbnail + info */}
      {selectedProduct && (
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="h-12 w-12 rounded bg-gray-100 overflow-hidden flex-shrink-0">
            {displayImage && <img src={displayImage} alt="" className="w-full h-full object-contain" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-900 truncate">{selectedProduct.name}</p>
              <button
                type="button"
                onClick={() => { setShowWelcome(false); setSelectedElementId(null); setActiveTool('products'); }}
                className="text-xs font-medium text-red-600 hover:underline whitespace-nowrap"
              >
                Change Product
              </button>
            </div>
            <div className="flex items-center gap-2">
              {productColors[selectedColorIdx]?.hex && (
                <span
                  className="inline-block h-4 w-4 rounded-full border border-gray-300"
                  style={{ backgroundColor: productColors[selectedColorIdx].hex }}
                />
              )}
              <span className="text-xs text-gray-500">{productColors[selectedColorIdx]?.name ?? 'White'}</span>
              <button
                type="button"
                onClick={() => { setSelectedElementId(null); setActiveTool('details'); }}
                className="text-xs font-medium text-blue-600 hover:underline whitespace-nowrap"
              >
                Change Product Color
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Right actions */}
      <div className="flex items-center gap-3 ml-auto">
        <div className="relative">
          <div className="flex">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 rounded-l-lg border-2 border-r-0 border-blue-600 px-4 py-2.5 text-sm font-bold text-blue-600 hover:bg-blue-50 transition disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setShowShareMenu(prev => !prev)}
              className="flex items-center rounded-r-lg border-2 border-blue-600 px-2.5 py-2.5 text-sm font-bold text-blue-600 hover:bg-blue-50 transition"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
          {showShareMenu && (
            <div className="absolute bottom-full right-0 mb-2 w-56 rounded-xl bg-white border border-gray-200 shadow-2xl py-2 z-[100]">
              <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Share</p>
              <button onClick={handleShareFacebook} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition">
                <span className="text-blue-600">f</span> Share on Facebook
              </button>
              <button onClick={handleShareTwitter} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition">
                <span className="text-sky-500">𝕏</span> Share on X / Twitter
              </button>
              <button onClick={handleShareEmail} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition">
                <span>✉️</span> Email Design
              </button>
              <button onClick={handleCopyLink} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition">
                <span>🔗</span> Copy Link
              </button>
              <div className="border-t border-gray-100 my-1" />
              <p className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Download</p>
              <button onClick={handleDownload} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition">
                <span>⬇️</span> Download Image
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleGetPrice}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition"
        >
          <Tag className="h-4 w-4" /> Get Price
        </button>
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Render: Edit Text Panel (shows when text element is selected)    */
  /* ---------------------------------------------------------------- */

  // Compact floating Edit Text toolbar — mobile only.
  // Desktop gets the full side panel below (textSidePanel).
  const textToolbar = showTextEditor && selectedEl && selectedEl.type === 'text' ? (
    <div
      // Two-row wrapping palette pinned just above the main bottom toolbar.
      // flex-wrap lets the ~14 controls reflow onto a second row instead of
      // overflowing horizontally; shrink-0 children keep their tap-target
      // width.
      className="md:hidden fixed bottom-[5.5rem] left-2 right-2 z-40 flex flex-wrap items-center justify-center gap-0.5 bg-white rounded-xl shadow-lg border border-gray-200 px-1.5 py-1 [&>*]:shrink-0"
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
      onTouchStart={e => e.stopPropagation()}
    >

      {/* Edit content */}
      <div className="relative">
        <button type="button" onClick={() => setTextPop(textPop === 'tx' ? null : 'tx')} className={`px-2 py-1.5 rounded-md text-[10px] font-semibold flex flex-col items-center w-11 ${textPop === 'tx' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}>
          <Type className="h-4 w-4" /><span>Text</span>
        </button>
        {textPop === 'tx' && (
          <div className="absolute bottom-full left-0 mb-2 bg-white border rounded-lg shadow-xl p-2 w-64 z-50">
            <input
              type="text"
              value={selectedEl.content}
              onChange={e => updateElement(selectedEl.id, { content: e.target.value })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
        )}
      </div>

      {/* Font */}
      <div className="relative">
        <button type="button" onClick={() => setTextPop(textPop === 'fn' ? null : 'fn')} className={`px-2 py-1.5 rounded-md text-[10px] font-semibold flex flex-col items-center w-11 ${textPop === 'fn' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`} style={{ fontFamily: selectedEl.fontFamily ?? 'Inter' }}>
          Aa<span>Font</span>
        </button>
        {textPop === 'fn' && (
          <div className="absolute bottom-full left-0 mb-2 bg-white border rounded-lg shadow-xl w-72 z-50 overflow-hidden">
            <FontPicker
              selectedFont={selectedEl.fontFamily ?? 'Inter'}
              onSelect={(name) => {
                updateElement(selectedEl.id, { fontFamily: name });
                setTextPop(null);
              }}
              loadFont={loadGoogleFont}
              onFontReady={() => setFontsReady((n) => n + 1)}
              autoFocus
            />
          </div>
        )}
      </div>

      {/* Color */}
      <label className="px-2 py-1.5 rounded-md text-[10px] font-semibold flex flex-col items-center w-11 text-gray-600 hover:bg-gray-100 cursor-pointer">
        <span className="h-4 w-4 rounded-full border border-gray-300" style={{ background: selectedEl.color ?? '#000' }} />
        <span>Color</span>
        <input
          type="color"
          value={selectedEl.color ?? '#000000'}
          onChange={e => updateElement(selectedEl.id, { color: e.target.value })}
          className="sr-only"
        />
      </label>

      {/* Shape */}
      <div className="relative">
        <button type="button" onClick={() => setTextPop(textPop === 'sh' ? null : 'sh')} className={`px-2 py-1.5 rounded-md text-[10px] font-semibold flex flex-col items-center w-11 ${textPop === 'sh' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}>
          ⌒<span>Shape</span>
        </button>
        {textPop === 'sh' && (
          <div className="absolute bottom-full left-0 mb-2 bg-white border rounded-lg shadow-xl p-2 w-60 z-50">
            <div className="grid grid-cols-3 gap-1.5">
              {TEXT_SHAPES.map(shape => (
                <button
                  key={shape.name}
                  type="button"
                  onClick={() => updateElement(selectedEl.id, { textShape: shape.name, shapeIntensity: selectedEl.shapeIntensity ?? 50 })}
                  className={`rounded-lg border px-1.5 py-1.5 text-[9px] font-bold transition ${(selectedEl.textShape ?? 'normal') === shape.name ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  {shape.label}
                </button>
              ))}
            </div>
            {selectedEl.textShape && selectedEl.textShape !== 'normal' && (
              <div className="mt-2 pt-2 border-t border-gray-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-gray-500">Intensity</span>
                  <span className="text-[10px] text-gray-400">{selectedEl.shapeIntensity ?? 50}%</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={selectedEl.shapeIntensity ?? 50}
                  onChange={e => updateElement(selectedEl.id, { shapeIntensity: Number(e.target.value) })}
                  className="w-full accent-blue-600"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Size */}
      <div className="relative">
        <button type="button" onClick={() => setTextPop(textPop === 'sz' ? null : 'sz')} className={`px-2 py-1.5 rounded-md text-[10px] font-semibold flex flex-col items-center w-11 ${textPop === 'sz' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}>⤢<span>Size</span></button>
        {textPop === 'sz' && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white border rounded-lg shadow-xl p-3 w-48 z-50">
            <div className="flex items-center gap-2">
              <HoldRepeatButton onPress={() => updateElement(selectedEl.id, { fontSize: inchesToFontSize(Math.max(0.1, fontSizeInches(selectedEl.fontSize ?? 24) - 0.1)) })} className="w-8 h-8 rounded border border-gray-200 text-gray-600 font-bold">-</HoldRepeatButton>
              <span className="flex-1 text-center text-sm font-semibold tabular-nums">{fontSizeInches(selectedEl.fontSize ?? 24).toFixed(1)}″</span>
              <HoldRepeatButton onPress={() => updateElement(selectedEl.id, { fontSize: inchesToFontSize(Math.min(canvasInches, fontSizeInches(selectedEl.fontSize ?? 24) + 0.1)) })} className="w-8 h-8 rounded border border-gray-200 text-gray-600 font-bold">+</HoldRepeatButton>
            </div>
          </div>
        )}
      </div>

      {/* Rotate */}
      <div className="relative">
        <button type="button" onClick={() => setTextPop(textPop === 'rt' ? null : 'rt')} className={`px-2 py-1.5 rounded-md text-[10px] font-semibold flex flex-col items-center w-11 ${textPop === 'rt' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}>↻<span>Rotate</span></button>
        {textPop === 'rt' && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white border rounded-lg shadow-xl p-3 w-48 z-50">
            <div className="flex items-center gap-2">
              <input type="range" min={-180} max={180} value={selectedEl.rotation ?? 0} onChange={e => updateElement(selectedEl.id, { rotation: Number(e.target.value) })} className="flex-1 accent-blue-600" />
              <span className="text-xs w-10 text-right">{selectedEl.rotation ?? 0}°</span>
            </div>
          </div>
        )}
      </div>

      {/* Spacing */}
      <div className="relative">
        <button type="button" onClick={() => setTextPop(textPop === 'sp' ? null : 'sp')} className={`px-2 py-1.5 rounded-md text-[10px] font-semibold flex flex-col items-center w-11 ${textPop === 'sp' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}>↔<span>Space</span></button>
        {textPop === 'sp' && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white border rounded-lg shadow-xl p-3 w-60 z-50 space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-gray-500">Letters</span>
                <span className="text-[10px] text-gray-400">{(selectedEl.letterSpacing ?? 0).toFixed(2)}em</span>
              </div>
              <input type="range" min={-20} max={100} step={1} value={Math.round((selectedEl.letterSpacing ?? 0) * 100)} onChange={e => updateElement(selectedEl.id, { letterSpacing: Number(e.target.value) / 100 })} className="w-full accent-blue-600" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-gray-500">Words</span>
                <span className="text-[10px] text-gray-400">{(selectedEl.wordSpacing ?? 0).toFixed(2)}em</span>
              </div>
              <input type="range" min={-30} max={300} step={5} value={Math.round((selectedEl.wordSpacing ?? 0) * 100)} onChange={e => updateElement(selectedEl.id, { wordSpacing: Number(e.target.value) / 100 })} className="w-full accent-blue-600" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-gray-500">Lines</span>
                <span className="text-[10px] text-gray-400">{(selectedEl.lineHeight ?? 1.2).toFixed(1)}</span>
              </div>
              <input type="range" min={50} max={300} step={5} value={Math.round((selectedEl.lineHeight ?? 1.2) * 100)} onChange={e => updateElement(selectedEl.id, { lineHeight: Number(e.target.value) / 100 })} className="w-full accent-blue-600" />
            </div>
          </div>
        )}
      </div>

      {/* Align */}
      <div className="relative">
        <button type="button" onClick={() => setTextPop(textPop === 'al' ? null : 'al')} className={`px-2 py-1.5 rounded-md text-[10px] font-semibold flex flex-col items-center w-11 ${textPop === 'al' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}>≡<span>Align</span></button>
        {textPop === 'al' && (
          <div className="absolute bottom-full right-0 mb-2 bg-white border rounded-lg shadow-xl p-2 flex gap-1 z-50">
            {(['left', 'center', 'right'] as const).map(align => (
              <button
                key={align}
                type="button"
                onClick={() => { updateElement(selectedEl.id, { textAlign: align }); setTextPop(null); }}
                className={`px-3 py-1.5 rounded text-[10px] font-medium ${selectedEl.textAlign === align ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                {align}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { updateElement(selectedEl.id, { x: 50 - selectedEl.width / 2 }); setTextPop(null); }}
              className="px-3 py-1.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              center on shirt
            </button>
          </div>
        )}
      </div>

      {/* Outline */}
      <button
        type="button"
        onClick={() => updateElement(selectedEl.id, { outline: !selectedEl.outline })}
        className={`px-2 py-1.5 rounded-md text-[10px] font-semibold flex flex-col items-center w-11 ${selectedEl.outline ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
      >
        <span className="text-sm">◌</span>
        <span>Outline</span>
      </button>

      <div className="w-px h-7 bg-gray-200 mx-0.5" />

      {/* Duplicate */}
      <button type="button" onClick={() => duplicateElement(selectedEl.id)} className="px-2 py-1.5 rounded-md text-[10px] font-semibold flex flex-col items-center w-11 text-gray-600 hover:bg-gray-100">⧉<span>Copy</span></button>

      {/* Delete */}
      <button type="button" onClick={() => removeElement(selectedEl.id)} className="px-2 py-1.5 rounded-md text-[10px] font-semibold flex flex-col items-center w-11 text-red-600 hover:bg-red-50">🗑<span>Delete</span></button>

      <div className="w-px h-7 bg-gray-200 mx-0.5" />

      {/* Done */}
      <button type="button" onClick={() => setSelectedElementId(null)} className="px-2 py-1.5 rounded-md text-[10px] text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X className="h-4 w-4" /></button>
    </div>
  ) : null;

  // Desktop-only Edit Text side panel — lives in the same left flyout
  // slot as the other tool panels (Upload / Add Text / Add Art). No
  // popovers; everything is stacked so the user can scroll through
  // controls without tapping through menus.
  const textSidePanel = showTextEditor && selectedEl && selectedEl.type === 'text' ? (
    <div
      className="hidden md:flex fixed top-16 left-20 bottom-0 w-80 z-30 flex-col overflow-y-auto bg-white shadow-xl border-r border-gray-200"
      onClick={e => e.stopPropagation()}
    >
      <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-3 border-b border-gray-200">
        <span className="font-semibold text-gray-900">Edit Text</span>
        <button type="button" onClick={() => setSelectedElementId(null)} className="text-gray-400 hover:text-gray-700"><X className="h-5 w-5" /></button>
      </div>

      <div className="p-5 space-y-5">
        <input
          type="text"
          value={selectedEl.content}
          onChange={e => updateElement(selectedEl.id, { content: e.target.value })}
          className="w-full rounded-lg border border-gray-200 px-4 py-3 text-center text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div>
          <span className="text-sm text-gray-600 mb-2 block">Font</span>
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <FontPicker
              selectedFont={selectedEl.fontFamily ?? 'Inter'}
              onSelect={(name) => updateElement(selectedEl.id, { fontFamily: name })}
              loadFont={loadGoogleFont}
              onFontReady={() => setFontsReady((n) => n + 1)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Size</span>
          <div className="flex items-center gap-2">
            <HoldRepeatButton onPress={() => updateElement(selectedEl.id, { fontSize: inchesToFontSize(Math.max(0.1, fontSizeInches(selectedEl.fontSize ?? 24) - 0.1)) })} className="w-8 h-8 rounded border border-gray-200 text-gray-600 font-bold">-</HoldRepeatButton>
            <span className="text-sm font-semibold w-12 text-center tabular-nums">{fontSizeInches(selectedEl.fontSize ?? 24).toFixed(1)}″</span>
            <HoldRepeatButton onPress={() => updateElement(selectedEl.id, { fontSize: inchesToFontSize(Math.min(canvasInches, fontSizeInches(selectedEl.fontSize ?? 24) + 0.1)) })} className="w-8 h-8 rounded border border-gray-200 text-gray-600 font-bold">+</HoldRepeatButton>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Color</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">{selectedEl.color ?? '#000000'}</span>
            <input type="color" value={selectedEl.color ?? '#000000'} onChange={e => updateElement(selectedEl.id, { color: e.target.value })} className="h-8 w-8 cursor-pointer rounded border border-gray-200" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-600">Text Shape</span>
            <span className="text-xs text-gray-400 capitalize">{selectedEl.textShape ?? 'normal'}</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {TEXT_SHAPES.map(shape => (
              <button
                key={shape.name}
                type="button"
                onClick={() => updateElement(selectedEl.id, { textShape: shape.name, shapeIntensity: selectedEl.shapeIntensity ?? 50 })}
                className={`rounded-lg border px-2 py-2.5 text-[10px] font-bold transition ${(selectedEl.textShape ?? 'normal') === shape.name ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                {shape.label}
              </button>
            ))}
          </div>
          {selectedEl.textShape && selectedEl.textShape !== 'normal' && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">Shape Intensity</span>
                <span className="text-xs text-gray-400">{selectedEl.shapeIntensity ?? 50}%</span>
              </div>
              <input type="range" min={10} max={100} value={selectedEl.shapeIntensity ?? 50} onChange={e => updateElement(selectedEl.id, { shapeIntensity: Number(e.target.value) })} className="w-full accent-blue-600" />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Rotation</span>
          <div className="flex items-center gap-2 flex-1 ml-4">
            <input type="range" min={-180} max={180} value={selectedEl.rotation ?? 0} onChange={e => updateElement(selectedEl.id, { rotation: Number(e.target.value) })} className="flex-1 accent-blue-600" />
            <span className="text-sm text-gray-700 w-10 text-right">{selectedEl.rotation ?? 0}&deg;</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Letters</span>
          <div className="flex items-center gap-2 flex-1 ml-4">
            <input type="range" min={-20} max={100} step={1} value={Math.round((selectedEl.letterSpacing ?? 0) * 100)} onChange={e => updateElement(selectedEl.id, { letterSpacing: Number(e.target.value) / 100 })} className="flex-1 accent-blue-600" />
            <span className="text-sm text-gray-700 w-14 text-right">{(selectedEl.letterSpacing ?? 0).toFixed(2)}em</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Words</span>
          <div className="flex items-center gap-2 flex-1 ml-4">
            <input type="range" min={-30} max={300} step={5} value={Math.round((selectedEl.wordSpacing ?? 0) * 100)} onChange={e => updateElement(selectedEl.id, { wordSpacing: Number(e.target.value) / 100 })} className="flex-1 accent-blue-600" />
            <span className="text-sm text-gray-700 w-14 text-right">{(selectedEl.wordSpacing ?? 0).toFixed(2)}em</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Lines</span>
          <div className="flex items-center gap-2 flex-1 ml-4">
            <input type="range" min={50} max={300} step={5} value={Math.round((selectedEl.lineHeight ?? 1.2) * 100)} onChange={e => updateElement(selectedEl.id, { lineHeight: Number(e.target.value) / 100 })} className="flex-1 accent-blue-600" />
            <span className="text-sm text-gray-700 w-14 text-right">{(selectedEl.lineHeight ?? 1.2).toFixed(1)}</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Outline</span>
          <button type="button" onClick={() => updateElement(selectedEl.id, { outline: !selectedEl.outline })} className={`px-4 py-1.5 text-xs font-medium rounded-lg border transition ${selectedEl.outline ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
            {selectedEl.outline ? 'On' : 'Off'}
          </button>
        </div>

        {/* Phase 2 PR #14: text effects (drop shadow / real stroke /
            gradient fill). Fabric-only — legacy renderer doesn't paint
            these fields, but they round-trip through save/load fine. */}
        {useFabricRenderer && (
          <div>
            <span className="text-sm text-gray-600 mb-2 block">Effects</span>
            <TextEffectsPanel
              element={{
                id: selectedEl.id,
                shadow: selectedEl.shadow,
                strokeColor: selectedEl.strokeColor,
                strokeWidth: selectedEl.strokeWidth,
                gradient: selectedEl.gradient,
              }}
              onUpdate={(updates) => updateElement(selectedEl.id, updates)}
            />
          </div>
        )}

        <div className="grid grid-cols-4 gap-2">
          <button type="button" onClick={() => updateElement(selectedEl.id, { x: 50 - selectedEl.width / 2 })} className="flex flex-col items-center gap-1 rounded-lg border border-gray-200 p-2 hover:bg-gray-50 text-gray-600">
            <Move className="h-4 w-4" />
            <span className="text-[9px] font-medium">Center</span>
          </button>
          {(['left', 'center', 'right'] as const).map(align => (
            <button
              key={align}
              type="button"
              onClick={() => updateElement(selectedEl.id, { textAlign: align })}
              className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition ${selectedEl.textAlign === align ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}
            >
              <Type className="h-4 w-4" />
              <span className="text-[9px] font-medium capitalize">{align}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <button type="button" onClick={() => duplicateElement(selectedEl.id)} className="rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Duplicate</button>
          <button type="button" onClick={() => removeElement(selectedEl.id)} className="rounded-lg border border-red-200 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50">Delete</button>
        </div>
      </div>
    </div>
  ) : null;

  /* ---------------------------------------------------------------- */
  /*  Final Render                                                     */
  /* ---------------------------------------------------------------- */

  const loginPromptModal = showLoginPrompt ? (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={() => setShowLoginPrompt(false)}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center" onClick={e => e.stopPropagation()}>
        <Save className="h-10 w-10 text-blue-600 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-gray-900 mb-2">Sign in to save your design</h3>
        <p className="text-sm text-gray-500 mb-6">Create an account or log in to save designs and access them from any device.</p>
        <div className="flex gap-3">
          <button
            onClick={() => setShowLoginPrompt(false)}
            className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <Link
            to="/auth"
            className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition text-center"
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  ) : null;

  // Cross-renderer guard: a row saved through the Fabric (?canvas=fabric)
  // renderer can't be displayed by the legacy positioned-div code (the
  // shapes are incompatible). When that happens, show a small panel
  // pointing the user to the same URL with the flag flipped on, instead
  // of attempting to render and producing a blank canvas. Only triggers
  // when the flag is OFF and the loaded design is a v2 object.
  if (!useFabricRenderer && incomingIsV2) {
    const here = location.pathname + location.search;
    const flagged = here + (location.search ? '&' : '?') + 'canvas=fabric';
    return (
      <div className="h-screen w-screen overflow-hidden bg-gray-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
          <Sparkles className="h-10 w-10 mx-auto mb-3 text-blue-600" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Saved in the new editor</h2>
          <p className="text-sm text-gray-600 mb-6">
            This design was last saved using our new design editor. Open it
            there to make further changes.
          </p>
          <a
            href={flagged}
            className="inline-block px-5 py-2.5 rounded-lg bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700"
          >
            Open in new editor
          </a>
          <div className="mt-4">
            <Link to="/account" className="text-xs text-gray-500 hover:underline">
              Back to my designs
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-screen overflow-hidden bg-gray-100 flex flex-col touch-manipulation">
      <Seo
        title="Design Studio · Custom T-Shirt Designer · TShirt Brothers"
        description="Free online t-shirt designer. Upload art, add text, generate AI designs, drop shapes — see your mockup live and get an instant quote."
        path="/design"
      />
      {headerBar}
      {leftToolbar}
      {bottomToolbar}
      {!showWelcome && !showTextEditor && toolPanel}
      {textToolbar}
      {textSidePanel}
      {imageToolbar}
      {canvas}
      {useFabricRenderer && (
        <LayersPanel
          elements={designElements}
          currentView={currentView}
          selectedElementId={selectedElementId}
          onSelect={(id) => setSelectedElementId(id)}
          onBringForward={bringForward}
          onSendBackward={sendBackward}
          onBringToFront={bringToFront}
          onSendToBack={sendToBack}
          onRemove={removeElement}
        />
      )}
      {bottomBar}
      {loginPromptModal}

      {/* Visual image cropper. Mounts only when an image is being cropped;
          Apply replaces el.content with the cropped data URL. Save flow
          will then upload the new image to Spaces on the next save. */}
      {croppingElement && croppingElement.type === 'image' && (
        <CropModal
          src={croppingElement.content}
          onCancel={() => setCroppingElementId(null)}
          onApply={(dataUrl) => {
            updateElement(croppingElement.id, { content: dataUrl });
            setCroppingElementId(null);
          }}
        />
      )}

      {/* Remove Background Prompt */}
      {pendingUpload && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 mb-4 text-center">Remove Background?</h3>
            <div className="flex justify-center mb-4">
              <img
                src={pendingUpload}
                alt="Uploaded"
                className="max-h-48 rounded-lg border border-gray-200 object-contain"
              />
            </div>
            <p className="text-sm text-gray-500 text-center mb-6">
              Would you like to remove the background from this image?
            </p>
            {isRemovingBg ? (
              <div className="flex items-center justify-center gap-2 py-3">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                <span className="text-sm font-medium text-gray-700">Removing background...</span>
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={handleKeepOriginal}
                  className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                >
                  No, Keep Original
                </button>
                <button
                  onClick={handleRemoveBg}
                  className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 transition"
                >
                  Yes, Remove Background
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Save to Art Library modal (admin) */}
      {librarySaveOpen && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={() => !librarySaving && setLibrarySaveOpen(false)}>
          <form
            onSubmit={(e) => { e.preventDefault(); handleSaveToLibrary(); }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-display font-semibold text-gray-900">Save to Art Library</h3>
              <button type="button" onClick={() => setLibrarySaveOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-500">Composes the current front-side elements into a transparent PNG and saves it as an Art Library asset (no product needed).</p>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Name *</label>
              <input
                type="text" required autoFocus
                value={librarySaveName}
                onChange={(e) => setLibrarySaveName(e.target.value)}
                placeholder="e.g. Vintage axe logo"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Category</label>
              <select
                value={librarySaveCategory}
                onChange={(e) => setLibrarySaveCategory(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none"
              >
                {['general', 'logos', 'typography', 'illustrations', 'backgrounds', 'badges', 'icons', 'patterns'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setLibrarySaveOpen(false)} disabled={librarySaving} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="submit" disabled={librarySaving || !librarySaveName.trim()} className="px-4 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 rounded-lg disabled:opacity-50 flex items-center gap-2">
                {librarySaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {librarySaving ? 'Saving…' : 'Save to Library'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
