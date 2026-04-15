import { useState, useRef, useEffect, useCallback } from 'react';
import { Link, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DesignElement {
  id: string;
  type: 'image' | 'text';
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

function ShapedText({ text, shape, intensity, fontSize, color, fontFamily, outline }: {
  text: string; shape: TextShapeName; intensity: number;
  fontSize: number; color: string; fontFamily: string; outline?: boolean;
}) {
  if (shape === 'normal') return null; // handled by regular span
  const pathId = `shape-${shape}-${intensity}-${text.length}`;
  const path = getShapePath(shape, intensity);
  const isCircle = shape === 'circle' || shape === 'circle-bottom';
  const scaledSize = isCircle ? fontSize * 0.35 : fontSize * 0.5;
  const vb = isCircle ? '0 0 200 200' : '0 0 200 100';
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
        style={outline ? {
          stroke: 'rgba(0,0,0,0.5)',
          strokeWidth: 1,
          paintOrder: 'stroke fill',
        } : {}}
      >
        <textPath href={`#${pathId}`} startOffset="50%">
          {text}
        </textPath>
      </text>
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
  // Serif
  'Playfair Display', 'Merriweather', 'Lora', 'PT Serif', 'Bitter', 'Libre Baskerville',
  'EB Garamond', 'Crimson Text', 'Cormorant Garamond', 'Spectral', 'Source Serif 4',
  'DM Serif Display', 'Noto Serif',
  // Display / Decorative
  'Bebas Neue', 'Anton', 'Righteous', 'Passion One', 'Bungee', 'Bangers',
  'Fredoka One', 'Lobster', 'Pacifico', 'Permanent Marker', 'Press Start 2P',
  'Russo One', 'Orbitron', 'Audiowide', 'Black Ops One', 'Bungee Shade',
  'Creepster', 'Fascinate Inline', 'Monoton', 'Racing Sans One', 'Sigmar One',
  'Special Elite', 'Titan One', 'Ultra',
  // Handwriting / Script
  'Dancing Script', 'Great Vibes', 'Sacramento', 'Satisfy', 'Kalam',
  'Caveat', 'Indie Flower', 'Shadows Into Light', 'Patrick Hand', 'Architects Daughter',
  'Amatic SC', 'Gloria Hallelujah', 'Covered By Your Grace', 'Rock Salt',
  // Monospace
  'Roboto Mono', 'Source Code Pro', 'Fira Code', 'JetBrains Mono', 'Space Mono', 'DM Mono',
  // System fallbacks
  'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Verdana', 'Comic Sans MS',
];

// Track which Google Fonts have been loaded
const loadedFonts = new Set<string>();
const SYSTEM_FONTS = ['Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Verdana', 'Comic Sans MS', 'Inter'];

function loadGoogleFont(fontName: string): Promise<void> {
  if (SYSTEM_FONTS.includes(fontName) || loadedFonts.has(fontName)) return Promise.resolve();
  loadedFonts.add(fontName);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, '+')}:wght@400;700&display=swap`;
  document.head.appendChild(link);
  // Wait for the font to actually load
  return document.fonts.ready.then(() => {});
}

// Preload a batch of fonts (for the font list preview)
let fontsPreloaded = false;
function preloadAllFonts() {
  if (fontsPreloaded) return;
  fontsPreloaded = true;
  // Load all fonts in one request using Google Fonts API
  const googleFonts = FONT_OPTIONS.filter(f => !SYSTEM_FONTS.includes(f));
  const families = googleFonts.map(f => `family=${f.replace(/ /g, '+')}:wght@700`).join('&');
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

type ToolName = 'upload' | 'text' | 'art' | 'products' | 'details' | 'names' | null;
type ViewName = 'front' | 'back' | 'sleeve';

// const DEFAULT_PRODUCT_ID = '39'; // Gildan Unisex Ultra Cotton T-Shirt

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DesignStudioPage() {
  const [searchParams] = useSearchParams();
  const initialProductId = searchParams.get('product') || '';
  // Auth gate — require login before designing
  const authNav = useNavigate();
  useEffect(() => {
    const token = localStorage.getItem('tsb_token');
    if (!token) {
      authNav('/auth?redirect=' + encodeURIComponent(window.location.pathname + window.location.search) + '&reason=design');
    }
  }, [authNav]);


  const location = useLocation();
  const loadState = location.state as { loadDesign?: boolean; designName?: string; elements?: DesignElement[]; colorIndex?: number } | null;

  // --- Core state ---
  const navigate = useNavigate();
  // On mobile the welcome panel covers the whole canvas and hides the
  // t-shirt. Default it to false on small screens so users see the product
  // immediately and can access tools via the bottom toolbar.
  const [showWelcome, setShowWelcome] = useState(() => {
    if (loadState?.loadDesign) return false;
    if (typeof window !== 'undefined' && window.innerWidth < 768) return false;
    return true;
  });
  const [activeTool, setActiveTool] = useState<ToolName>(null);
  const [aiChatOpen, setAiChatOpen] = useState(false);

  // When AI Design button is clicked, tell the ChatWidget to open
  useEffect(() => {
    if (aiChatOpen) {
      window.dispatchEvent(new CustomEvent('tsb:open-chat'));
      setAiChatOpen(false);
    }
  }, [aiChatOpen]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedColorIdx, setSelectedColorIdx] = useState(loadState?.colorIndex || 0);
  const [userPickedColor, setUserPickedColor] = useState(!!loadState?.colorIndex);
  const [currentView, setCurrentView] = useState<ViewName>('front');
  const [viewSwitcherOpen, setViewSwitcherOpen] = useState(true);
  const [designElements, setDesignElements] = useState<DesignElement[]>(loadState?.elements || []);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [designName, setDesignName] = useState(loadState?.designName || 'Untitled design');
  const [isEditingName, setIsEditingName] = useState(false);
  const [savedDesignId, setSavedDesignId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
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

      const body = {
        name: designName,
        product_ss_id: selectedProduct?.ss_id,
        product_name: selectedProduct?.name,
        product_image: displayImage,
        color_index: selectedColorIdx,
        elements: designElements,
        design_data: designData,
      };
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

  // Download design as image
  // Navigate to quote with design data pre-filled
  const handleGetPrice = () => {
    navigate('/quote', {
      state: {
        fromDesignStudio: true,
        product: selectedProduct,
        color: productColors[selectedColorIdx] || null,
        designElements,
        designImage: displayImage,
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
  const [textFontSize, setTextFontSize] = useState(24);
  const [textColor, setTextColor] = useState('#FFFFFF');

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
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [, setFontsReady] = useState(0); // force re-render when fonts load

  // --- Drag / resize state ---
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{
    elementId: string;
    mode: 'move' | 'resize';
    startMx: number;
    startMy: number;
    startX: number;
    startY: number;
    startWidth: number;
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
    const targetId = initialProductId || '39';
    fetch(`/api/products/by-ssid/${targetId}`)
      .then(r => r.ok ? r.json() : null)
      .then(p => {
        if (p) setSelectedProduct(prev => prev || (p as Product));
      })
      .catch(() => {});
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

  const addDesignElement = useCallback((el: Omit<DesignElement, 'id'>) => {
    const newEl: DesignElement = { ...el, id: Date.now().toString() + Math.random().toString(36).slice(2) };
    setDesignElements(prev => [...prev, newEl]);
    setSelectedElementId(newEl.id);
  }, []);

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
    // Close the Upload panel on mobile so the canvas is visible.
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setActiveTool(null);
    }
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
  async function autoCropTransparent(dataUrl: string, alphaThreshold = 8): Promise<{ dataUrl: string; widthRatio: number; heightRatio: number }> {
    console.log('[autocrop] start, src prefix:', dataUrl.slice(0, 40));
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
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

    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      const rowStart = y * w * 4;
      for (let x = 0; x < w; x++) {
        const a = data[rowStart + x * 4 + 3]!;
        if (a > alphaThreshold) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    console.log('[autocrop] bounds', { minX, minY, maxX, maxY });
    if (maxX < 0) {
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
        }

        setDesignElements((prev) => prev.map((el) =>
          el.type === 'image' && el.content === original
            ? { ...el, content: cutout, width: Math.max(5, el.width * widthRatio) }
            : el
        ));
        setUploadedImages((prev) => prev.map((u) => (u === original ? cutout : u)));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[remove-bg] failed:', msg);
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
  const removeBgOnCanvas = async (elementId: string) => {
    const el = designElements.find(e => e.id === elementId);
    if (!el || el.type !== 'image') return;
    setCanvasRemovingBg(true);
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
      try {
        const cropped = await autoCropTransparent(cutout);
        cutout = cropped.dataUrl;
        widthRatio = cropped.widthRatio;
      } catch (cropErr) {
        console.warn('[autocrop] failed on canvas Rm BG:', cropErr);
      }
      updateElement(elementId, {
        content: cutout,
        width: Math.max(5, el.width * widthRatio),
      });
    } catch (err) {
      console.error('[canvas Rm BG] failed:', err);
      alert(err instanceof Error ? err.message : 'Background removal failed');
    } finally {
      setCanvasRemovingBg(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Text handler                                                     */
  /* ---------------------------------------------------------------- */

  const addTextToCanvas = useCallback(() => {
    if (!textInput.trim()) return;
    addDesignElement({
      type: 'text',
      x: 30,
      y: 40,
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
      const { elementId, mode, startMx, startMy, startX, startY, startWidth } = dragState;

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
        setDesignElements(prev =>
          prev.map(el =>
            el.id === elementId ? { ...el, width: Math.max(5, Math.min(80, startWidth + dx)) } : el,
          ),
        );
      }
    };

    const handleMouseUp = () => setDragState(null);

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (touch) handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY } as MouseEvent);
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
    { name: 'ai', icon: Sparkles, label: 'AI\nDesign' },
    { name: 'details', icon: Shirt, label: 'Product\nDetails' },
    { name: 'products', icon: Move, label: 'Change\nProducts' },
  ];

  /* ---------------------------------------------------------------- */
  /*  Render: Top Header Bar                                           */
  /* ---------------------------------------------------------------- */

  const headerBar = (
    <header className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4">
      {/* Left */}
      <div className="flex items-center gap-3">
        <Link to="/" className="text-gray-500 hover:text-gray-900 transition">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <img src="https://tshirtbrothers.atl1.digitaloceanspaces.com/tsb-logo.png" alt="TSB" className="h-8 w-8 object-contain hidden sm:block" />
        <span className="text-lg font-bold text-gray-900 hidden sm:inline">TShirt Brothers</span>
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
            className="text-sm font-medium text-gray-700 hover:text-gray-900 transition px-2 py-1"
          >
            {designName}
          </button>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="hidden sm:flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isSaving ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={handleGetPrice}
          className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 transition"
        >
          Get Price
        </button>
      </div>
    </header>
  );

  /* ---------------------------------------------------------------- */
  /*  Render: Left Toolbar (desktop)                                   */
  /* ---------------------------------------------------------------- */

  const leftToolbar = (
    <aside className="fixed left-0 top-14 bottom-16 z-40 hidden w-16 flex-col justify-center border-r border-gray-200 bg-white md:flex">
      {tools.map(tool => {
        const isAi = tool.name === 'ai';
        const isActive = !isAi && activeTool === tool.name;
        const Icon = tool.icon;
        return (
          <button
            key={tool.name}
            type="button"
            onClick={() => {
              if (isAi) {
                window.dispatchEvent(new CustomEvent('tsb:open-chat'));
              } else {
                toggleTool(tool.name as ToolName);
              }
            }}
            className={`relative flex w-full flex-col items-center py-4 transition ${
              isAi ? 'text-orange-500 hover:bg-orange-50 hover:text-orange-600'
              : isActive ? 'text-red-600 bg-red-50' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            }`}
          >
            {isActive && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-red-600" />}
            <Icon className="h-6 w-6" />
            <span className="mt-1.5 text-[10px] leading-tight text-center whitespace-pre-line">{tool.label}</span>
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
      {tools.map(tool => {
        const isAi = tool.name === 'ai';
        const isActive = !isAi && activeTool === tool.name;
        const Icon = tool.icon;
        return (
          <button
            key={tool.name}
            type="button"
            onClick={() => {
              if (isAi) {
                window.dispatchEvent(new CustomEvent('tsb:open-chat'));
              } else {
                toggleTool(tool.name as ToolName);
              }
            }}
            className={`flex flex-1 flex-col items-center py-2 transition ${
              isAi ? 'text-orange-500' : isActive ? 'text-red-600' : 'text-gray-500'
            }`}
          >
            {isActive && <div className="absolute top-0 left-0 right-0 h-0.5 bg-red-600" />}
            <Icon className="h-5 w-5" />
            <span className="mt-0.5 text-[10px]">{tool.label}</span>
          </button>
        );
      })}
    </nav>
  );

  /* ---------------------------------------------------------------- */
  /*  Render: Tool Panels                                              */
  /* ---------------------------------------------------------------- */

  const panelBase = 'fixed z-30 bg-white shadow-xl overflow-y-auto';
  const desktopPanel = `${panelBase} top-14 bottom-0 left-16 w-80 border-r border-gray-200 hidden md:block`;
  const mobilePanel = `${panelBase} bottom-12 left-0 right-0 mobile-max-35vh rounded-t-2xl border-t border-gray-200 md:hidden`;

  const panelHeader = (title: string) => (
    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <button type="button" onClick={() => setActiveTool(null)} className="text-gray-400 hover:text-gray-600">
        <X className="h-4 w-4" />
      </button>
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
                onClick={() => placeImageOnCanvas(url)}
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
  const textPanelContent = (
    <div className="p-4 space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Text</label>
        <input
          placeholder="Enter your text..."
          value={textInput}
          onChange={e => setTextInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addTextToCanvas(); }}
          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
          Font Size: {textFontSize}px
        </label>
        <input
          type="range"
          min={12}
          max={72}
          value={textFontSize}
          onChange={e => setTextFontSize(Number(e.target.value))}
          className="w-full accent-red-600"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Color</label>
        <input
          type="color"
          value={textColor}
          onChange={e => setTextColor(e.target.value)}
          className="h-8 w-8 cursor-pointer rounded border-none"
        />
        <span className="text-xs text-gray-400">{textColor}</span>
      </div>
      <button
        type="button"
        onClick={addTextToCanvas}
        disabled={!textInput.trim()}
        className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Add to Design
      </button>

      {/* List of text elements on canvas */}
      {designElements.filter(e => e.type === 'text').length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Text on canvas</p>
          <div className="space-y-1">
            {designElements
              .filter(e => e.type === 'text')
              .map(el => (
                <div
                  key={el.id}
                  className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm"
                >
                  <span className="flex-1 truncate font-medium" style={{ color: el.color }}>
                    {el.content}
                  </span>
                  <span className="text-xs text-gray-400">{el.fontSize}px</span>
                  <button
                    type="button"
                    onClick={() => removeElement(el.id)}
                    className="text-gray-400 hover:text-red-600 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
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

  // --- Product Details Panel ---
  const detailsPanelContent = (
    <div className="p-5 space-y-4">
      {selectedProduct ? (
        <>
          <div className="flex items-center gap-4">
            {selectedProduct.image_url && (
              <img src={selectedProduct.image_url} alt="" className="w-20 h-20 rounded-lg bg-gray-100 object-contain" />
            )}
            <div>
              <p className="font-semibold text-gray-900">{selectedProduct.name}</p>
              <p className="text-sm text-gray-500">{selectedProduct.brand}</p>
              <p className="text-xs text-gray-400 mt-1">{selectedProduct.category}</p>
            </div>
          </div>
          {productColors.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                Color: {productColors[selectedColorIdx]?.name}
              </p>
              <div className="flex flex-wrap gap-2">
                {productColors.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    title={c.name}
                    onClick={() => { setSelectedColorIdx(i); setUserPickedColor(true); }}
                    className={`h-8 w-8 rounded-full border-2 transition ${
                      selectedColorIdx === i ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
                    }`}
                    style={{ backgroundColor: c.hex || '#ccc' }}
                  />
                ))}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => { setActiveTool('products'); }}
            className="w-full rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            Change Product
          </button>
        </>
      ) : (
        <p className="text-sm text-gray-500">No product selected</p>
      )}
    </div>
  );

  const panelContentMap: Record<string, { title: string; content: React.ReactNode }> = {
    upload: { title: 'Upload Design', content: uploadPanelContent },
    text: { title: 'Add Text', content: textPanelContent },
    art: { title: 'Add Art', content: artPanelContent },
    details: { title: 'Product Details', content: detailsPanelContent },
    products: { title: 'Change Products', content: productsPanelContent },
  };

  const activePanel = activeTool ? panelContentMap[activeTool] : null;

  const toolPanel = activePanel ? (
    <>
      {/* Desktop panel */}
      <div className={desktopPanel}>
        {panelHeader(activePanel.title)}
        {activePanel.content}
      </div>
      {/* Mobile panel */}
      <div className={mobilePanel}>
        {panelHeader(activePanel.title)}
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

  const imageToolbar = selectedEl && selectedEl.type === 'image' ? (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 flex items-center gap-0.5 bg-white rounded-xl shadow-lg border border-gray-200 px-1.5 py-1 max-w-[calc(100vw-1rem)] overflow-x-auto">

      {/* Size */}
      <div className="relative">
        <button type="button" onClick={() => setImgPop(imgPop === 'sz' ? null : 'sz')} className={`px-2 py-1.5 rounded-md text-[10px] font-semibold flex flex-col items-center w-11 ${imgPop === 'sz' ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}>⤢<span>Size</span></button>
        {imgPop === 'sz' && <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white border rounded-lg shadow-xl p-3 w-48 z-50"><div className="flex items-center gap-2"><input type="range" min={5} max={80} value={selectedEl.width} onChange={e => updateElement(selectedEl.id, { width: Number(e.target.value) })} className="flex-1 accent-blue-600" /><span className="text-xs w-10 text-right">{selectedEl.width}%</span></div></div>}
      </div>

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

  const canvasLeftOffset = (activeTool || showWelcome || showTextEditor) ? 'md:ml-80' : '';

  const canvas = (
    <main
      className={`relative flex-1 flex flex-col items-center bg-gray-100 pt-16 pb-14 md:pt-24 md:pb-20 md:ml-16 ${canvasLeftOffset} transition-all duration-200 overflow-y-auto`}
      onClick={() => setSelectedElementId(null)}
    >
      {/* Product image + overlay area */}
      <div className="relative w-full max-w-none md:max-w-4xl lg:max-w-5xl xl:max-w-6xl px-1 md:px-6" ref={canvasRef}>
        <div
          className="relative bg-white rounded-2xl shadow-sm overflow-hidden flex items-center justify-center select-none
                     h-[calc(100svh-8rem)] md:h-auto md:aspect-square"
          style={{ touchAction: 'pinch-zoom' }}
        >
          {displayImage ? (
            <img
              src={displayImage}
              alt={selectedProduct?.name ?? 'Product'}
              className="w-full h-full object-contain p-4 pointer-events-none"
              draggable={false}
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-gray-400">
              <Shirt className="h-16 w-16 mb-2" />
              <p className="text-sm font-medium">Select a product to start designing</p>
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  setActiveTool('products');
                }}
                className="mt-2 text-sm text-red-600 font-semibold hover:underline"
              >
                Browse Products
              </button>
            </div>
          )}

          {/* Design elements on canvas */}
          {designElements.map(el => {
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
                  transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                }}
              >
                {el.type === 'image' ? (
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
                    />
                  </div>
                ) : (
                  <span
                    className="block whitespace-pre-wrap pointer-events-none"
                    style={{
                      fontSize: `${(el.fontSize ?? 24) * 0.5}px`,
                      color: el.color ?? '#fff',
                      fontFamily: el.fontFamily ?? 'Inter',
                      fontWeight: 700,
                      textAlign: el.textAlign ?? 'center',
                      letterSpacing: el.letterSpacing ? `${el.letterSpacing}em` : undefined,
                      wordSpacing: el.wordSpacing ? `${el.wordSpacing}em` : undefined,
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
                        className={`absolute w-3 h-3 bg-white border-2 border-blue-500 cursor-se-resize z-10 ${
                          corner === 'top-left'
                            ? '-top-1.5 -left-1.5'
                            : corner === 'top-right'
                              ? '-top-1.5 -right-1.5'
                              : corner === 'bottom-left'
                                ? '-bottom-1.5 -left-1.5'
                                : '-bottom-1.5 -right-1.5'
                        }`}
                      />
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

          {/* Placeholder when no elements */}
          {designElements.length === 0 && displayImage && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="border-2 border-dashed border-gray-300 rounded-lg px-8 py-6 flex flex-col items-center gap-1">
                <Move className="h-5 w-5 text-gray-400" />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Your Design Here
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* View Switcher — left column, collapses once a side is chosen */}
      {selectedProduct && frontImage && (
        viewSwitcherOpen ? (
          <div className="absolute left-2 top-20 md:top-24 z-20 flex flex-col gap-2 bg-white/90 backdrop-blur rounded-xl shadow-lg border border-gray-200 p-1.5">
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
                <div className="h-8 w-8 rounded bg-gray-100 overflow-hidden flex items-center justify-center">
                  {frontImage && (
                    <img
                      src={view === 'back' ? (backImage ?? frontImage) : frontImage}
                      alt={view}
                      className="h-full w-full object-contain"
                    />
                  )}
                </div>
                <span className="text-[9px] font-semibold capitalize">{view === 'sleeve' ? 'Slv' : view === 'back' ? 'Back' : 'Front'}</span>
              </button>
            ))}
          </div>
        ) : (
          // Tiny pill button to reopen the switcher after it's been dismissed
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setViewSwitcherOpen(true); }}
            className="absolute left-2 top-20 md:top-24 z-20 bg-white/90 backdrop-blur border border-gray-200 rounded-full shadow px-2 py-1 text-[10px] font-semibold text-gray-600 hover:bg-white capitalize"
          >
            {currentView === 'sleeve' ? 'Sleeve' : currentView} ▾
          </button>
        )
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
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowColorPicker(prev => !prev)}
                  className="text-xs font-medium text-blue-600 hover:underline whitespace-nowrap"
                >
                  Change Product Color
                </button>
                {showColorPicker && productColors.length > 0 && (
                  <div className="absolute bottom-full left-0 mb-3 rounded-xl bg-white border border-gray-200 shadow-2xl p-4 min-w-[240px] z-[100]">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Colors</p>
                    <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                      {productColors.map((c, i) => (
                        <button
                          key={i}
                          type="button"
                          title={c.name}
                          onClick={() => { setSelectedColorIdx(i); setUserPickedColor(true); setShowColorPicker(false); }}
                          className={`h-7 w-7 rounded-full border-2 transition ${
                            selectedColorIdx === i ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
                          }`}
                          style={{ backgroundColor: c.hex || '#ccc' }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
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
          <Save className="h-4 w-4" /> Get Price
        </button>
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Render: Edit Text Panel (shows when text element is selected)    */
  /* ---------------------------------------------------------------- */

  const textEditorPanel = showTextEditor && selectedEl ? (
    <div
      className="fixed z-30 flex flex-col overflow-y-auto bg-white border-gray-200
                 md:top-14 md:left-16 md:bottom-16 md:w-80 md:border-r
                 inset-x-0 bottom-12 top-auto rounded-t-2xl border-t shadow-2xl
                 mobile-max-35vh"
    >
      {/* Drag handle (mobile only) */}
      <div className="flex justify-center pt-2 md:hidden">
        <div className="w-10 h-1.5 rounded-full bg-gray-300" />
      </div>

      {/* Sticky header with prominent Done button */}
      <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-3 border-b border-gray-200">
        <span className="font-semibold text-gray-900">Edit Text</span>
        <button
          type="button"
          onClick={() => setSelectedElementId(null)}
          className="md:hidden bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg"
        >
          Done
        </button>
        <button
          type="button"
          onClick={() => setSelectedElementId(null)}
          className="hidden md:block text-gray-400 hover:text-gray-700"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* Text content */}
        <input
          type="text"
          value={selectedEl.content}
          onChange={e => updateElement(selectedEl.id, { content: e.target.value })}
          className="w-full rounded-lg border border-gray-200 px-4 py-3 text-center text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* Change Font */}
        <div>
          <span className="text-sm text-gray-600 mb-2 block">Change Font</span>
          <div
            className="text-lg font-bold border border-gray-200 rounded-lg px-4 py-3 mb-2 cursor-pointer hover:bg-gray-50 transition"
            style={{ fontFamily: selectedEl.fontFamily ?? 'Inter' }}
            onClick={() => {
              const el = document.getElementById('font-search');
              if (el) el.focus();
            }}
          >
            {selectedEl.fontFamily ?? 'Inter'}
          </div>
          <input
            id="font-search"
            type="text"
            placeholder="Search fonts..."
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            onChange={e => {
              const container = document.getElementById('font-list');
              if (!container) return;
              const query = e.target.value.toLowerCase();
              Array.from(container.children).forEach(child => {
                const name = child.getAttribute('data-font') ?? '';
                (child as HTMLElement).style.display = name.toLowerCase().includes(query) ? '' : 'none';
              });
            }}
          />
          <div id="font-list" className="max-h-48 overflow-y-auto rounded-lg border border-gray-200">
            {FONT_OPTIONS.map(f => (
              <button
                key={f}
                type="button"
                data-font={f}
                onMouseEnter={() => loadGoogleFont(f)}
                onClick={() => {
                  loadGoogleFont(f).then(() => setFontsReady(n => n + 1));
                  updateElement(selectedEl.id, { fontFamily: f });
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition ${
                  (selectedEl.fontFamily ?? 'Inter') === f ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700'
                }`}
                style={{ fontFamily: f }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Edit Color */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Edit Color</span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">{selectedEl.color ?? '#000000'}</span>
            <input
              type="color"
              value={selectedEl.color ?? '#000000'}
              onChange={e => updateElement(selectedEl.id, { color: e.target.value })}
              className="h-8 w-8 cursor-pointer rounded border border-gray-200"
            />
          </div>
        </div>

        {/* Rotation */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Rotation</span>
          <div className="flex items-center gap-2 flex-1 ml-4">
            <input
              type="range"
              min={-180}
              max={180}
              value={selectedEl.rotation ?? 0}
              onChange={e => updateElement(selectedEl.id, { rotation: Number(e.target.value) })}
              className="flex-1 accent-blue-600"
            />
            <span className="text-sm text-gray-700 w-10 text-right">{selectedEl.rotation ?? 0}&deg;</span>
          </div>
        </div>

        {/* Letter Spacing */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Letters</span>
          <div className="flex items-center gap-2 flex-1 ml-4">
            <input
              type="range"
              min={-10}
              max={30}
              step={1}
              value={Math.round((selectedEl.letterSpacing ?? 0) * 100)}
              onChange={e => updateElement(selectedEl.id, { letterSpacing: Number(e.target.value) / 100 })}
              className="flex-1 accent-blue-600"
            />
            <span className="text-sm text-gray-700 w-14 text-right">{(selectedEl.letterSpacing ?? 0).toFixed(2)}</span>
          </div>
        </div>

        {/* Word Spacing */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Words</span>
          <div className="flex items-center gap-2 flex-1 ml-4">
            <input
              type="range"
              min={-10}
              max={30}
              step={1}
              value={Math.round((selectedEl.wordSpacing ?? 0) * 100)}
              onChange={e => updateElement(selectedEl.id, { wordSpacing: Number(e.target.value) / 100 })}
              className="flex-1 accent-blue-600"
            />
            <span className="text-sm text-gray-700 w-14 text-right">{(selectedEl.wordSpacing ?? 0).toFixed(2)}</span>
          </div>
        </div>

        {/* Line Height */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Lines</span>
          <div className="flex items-center gap-2 flex-1 ml-4">
            <input
              type="range"
              min={50}
              max={300}
              step={5}
              value={Math.round((selectedEl.lineHeight ?? 1.2) * 100)}
              onChange={e => updateElement(selectedEl.id, { lineHeight: Number(e.target.value) / 100 })}
              className="flex-1 accent-blue-600"
            />
            <span className="text-sm text-gray-700 w-14 text-right">{(selectedEl.lineHeight ?? 1.2).toFixed(1)}</span>
          </div>
        </div>

        {/* Outline */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Outline</span>
          <button
            type="button"
            onClick={() => updateElement(selectedEl.id, { outline: !selectedEl.outline })}
            className={`px-4 py-1.5 text-xs font-medium rounded-lg border transition ${
              selectedEl.outline ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
          >
            {selectedEl.outline ? 'On' : 'Off'}
          </button>
        </div>

        {/* Text Shape */}
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
                className={`rounded-lg border px-2 py-2.5 text-[10px] font-bold transition ${
                  (selectedEl.textShape ?? 'normal') === shape.name
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
                style={{
                  fontStyle: shape.name === 'curve' || shape.name === 'arch' ? 'italic' : undefined,
                  letterSpacing: shape.name === 'pinch' ? '-0.05em' : shape.name === 'bulge' ? '0.1em' : undefined,
                }}
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
              <input
                type="range"
                min={10}
                max={100}
                value={selectedEl.shapeIntensity ?? 50}
                onChange={e => updateElement(selectedEl.id, { shapeIntensity: Number(e.target.value) })}
                className="w-full accent-blue-600"
              />
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => updateElement(selectedEl.id, { textShape: 'normal', shapeIntensity: 50 })}
                  className="text-xs text-gray-400 hover:text-gray-700 transition"
                >
                  Remove Shape
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Text Size */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Text Size</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => updateElement(selectedEl.id, { fontSize: Math.max(12, (selectedEl.fontSize ?? 24) - 2) })}
              className="w-8 h-8 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center justify-center font-bold"
            >
              -
            </button>
            <span className="text-sm font-semibold w-8 text-center">{selectedEl.fontSize ?? 24}</span>
            <button
              type="button"
              onClick={() => updateElement(selectedEl.id, { fontSize: Math.min(120, (selectedEl.fontSize ?? 24) + 2) })}
              className="w-8 h-8 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center justify-center font-bold"
            >
              +
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 pt-4 grid grid-cols-4 gap-2">
          {/* Center */}
          <button
            type="button"
            onClick={() => updateElement(selectedEl.id, { x: 50 - (selectedEl.width) / 2 })}
            className="flex flex-col items-center gap-1 rounded-lg border border-gray-200 p-2 hover:bg-gray-50 transition text-gray-600"
          >
            <Move className="h-4 w-4" />
            <span className="text-[9px] font-medium">Center</span>
          </button>

          {/* Text Alignment */}
          {(['left', 'center', 'right'] as const).map(align => (
            <button
              key={align}
              type="button"
              onClick={() => updateElement(selectedEl.id, { textAlign: align })}
              className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition ${
                selectedEl.textAlign === align ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Type className="h-4 w-4" />
              <span className="text-[9px] font-medium capitalize">{align}</span>
            </button>
          ))}
        </div>

        {/* Duplicate & Delete */}
        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            type="button"
            onClick={() => duplicateElement(selectedEl.id)}
            className="rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            Duplicate
          </button>
          <button
            type="button"
            onClick={() => removeElement(selectedEl.id)}
            className="rounded-lg border border-red-200 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  ) : null;

  /* ---------------------------------------------------------------- */
  /*  Render: Welcome Panel                                            */
  /* ---------------------------------------------------------------- */

  const welcomePanel = showWelcome ? (
    <div className="fixed top-14 left-0 right-0 bottom-12 md:left-16 md:right-auto md:bottom-16 md:w-80 bg-white md:border-r border-gray-200 z-20 flex flex-col p-6 overflow-y-auto">
      <h2 className="text-xl font-bold text-gray-900 mb-6">How do you want to start?</h2>
      <div className="grid grid-cols-2 gap-3 mb-6">
        {[
          { label: 'AI Design', icon: Sparkles, action: () => { setShowWelcome(false); setAiChatOpen(true); }, highlight: true },
          { label: 'Uploads', icon: Upload, action: () => { setShowWelcome(false); setActiveTool('upload'); } },
          { label: 'Add Text', icon: Type, action: () => { setShowWelcome(false); setActiveTool('text'); } },
          { label: 'Add Art', icon: Image, action: () => { setShowWelcome(false); setActiveTool('art'); } },
          { label: 'Change\nProducts', icon: Shirt, action: () => { setShowWelcome(false); setActiveTool('products'); } },
        ].map(item => (
          <button
            key={item.label}
            type="button"
            onClick={item.action}
            className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 transition group ${
              (item as { highlight?: boolean }).highlight
                ? 'border-orange-400 bg-orange-50 hover:border-orange-500 hover:bg-orange-100'
                : 'border-gray-200 hover:border-blue-500 hover:bg-blue-50'
            }`}
          >
            <item.icon className={`h-8 w-8 group-hover:scale-110 transition-transform ${
              (item as { highlight?: boolean }).highlight ? 'text-orange-500' : 'text-blue-600'
            }`} />
            <span className="text-sm font-semibold text-gray-700 whitespace-pre-line text-center">{item.label}</span>
          </button>
        ))}
      </div>
      <div className="mt-auto">
        <p className="text-sm font-bold text-gray-900 mb-2">Uploading anytime is simple!</p>
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
          <Move className="h-4 w-4 text-blue-500" /> Drag and drop anywhere
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Upload className="h-4 w-4 text-blue-500" /> Copy and paste from clipboard
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

  return (
    <div className="h-screen w-screen overflow-hidden bg-gray-100">
      {headerBar}
      {leftToolbar}
      {bottomToolbar}
      {!showWelcome && !showTextEditor && toolPanel}
      {!showTextEditor && welcomePanel}
      {textEditorPanel}
      {imageToolbar}
      {canvas}
      {bottomBar}
      {loginPromptModal}

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
    </div>
  );
}
