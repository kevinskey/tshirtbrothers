import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import {
  Shirt,
  Type,
  Upload,
  MapPin,
  Trash2,
  Plus,
  ChevronDown,
  Save,
  ShoppingCart,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types & constants                                                  */
/* ------------------------------------------------------------------ */

interface TextElement {
  id: string;
  text: string;
  fontSize: number;
  color: string;
}

const GARMENTS = [
  { id: 'tshirt', label: 'T-Shirt' },
  { id: 'hoodie', label: 'Hoodie' },
  { id: 'polo', label: 'Polo' },
  { id: 'longsleeve', label: 'Long Sleeve' },
  { id: 'sweatshirt', label: 'Sweatshirt' },
  { id: 'tanktop', label: 'Tank Top' },
];

const COLORS: { name: string; hex: string }[] = [
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Black', hex: '#000000' },
  { name: 'Navy', hex: '#1e3a5f' },
  { name: 'Red', hex: '#dc2626' },
  { name: 'Green', hex: '#16a34a' },
  { name: 'Gray', hex: '#6b7280' },
  { name: 'Royal Blue', hex: '#2563eb' },
  { name: 'Purple', hex: '#7c3aed' },
  { name: 'Kelly Green', hex: '#15803d' },
  { name: 'Maroon', hex: '#7f1d1d' },
];

const PLACEMENTS = ['Full Center', 'Left Chest', 'Full Back', 'Right Chest'];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DesignStudioPage() {
  const [garmentType, setGarmentType] = useState('tshirt');
  const [selectedColor, setSelectedColor] = useState('White');
  const [currentView, setCurrentView] = useState<'front' | 'back'>('front');

  /* Text tool */
  const [textInput, setTextInput] = useState('');
  const [textFontSize, setTextFontSize] = useState(24);
  const [textColor, setTextColor] = useState('#000000');
  const [textElements, setTextElements] = useState<TextElement[]>([]);

  /* Upload tool */
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* Placement */
  const [designPosition, setDesignPosition] = useState('Full Center');

  /* Accordion */
  const [openSection, setOpenSection] = useState<'text' | 'upload' | 'placement'>('text');

  /* helpers */
  const selectedHex = COLORS.find((c) => c.name === selectedColor)?.hex ?? '#FFFFFF';
  const isLightColor = ['White', 'Gray'].includes(selectedColor);

  const addText = () => {
    if (!textInput.trim()) return;
    setTextElements((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        text: textInput.trim(),
        fontSize: textFontSize,
        color: textColor,
      },
    ]);
    setTextInput('');
  };

  const removeText = (id: string) =>
    setTextElements((prev) => prev.filter((t) => t.id !== id));

  const handleFile = (file: File) => {
    setUploadedImage(URL.createObjectURL(file));
  };

  const toggleSection = (section: 'text' | 'upload' | 'placement') =>
    setOpenSection((prev) => (prev === section ? section : section));

  /* ---------------------------------------------------------------- */
  /*  Sidebar                                                          */
  /* ---------------------------------------------------------------- */

  const sidebar = (
    <aside className="w-full space-y-6 overflow-y-auto border-r border-brand-gray-200 bg-white p-5 lg:w-80">
      <h2 className="font-display text-xl font-bold">Design Studio</h2>

      {/* Product selector */}
      <div>
        <label className="mb-1 block text-sm font-semibold text-brand-gray-600">
          Garment
        </label>
        <div className="relative">
          <select
            value={garmentType}
            onChange={(e) => setGarmentType(e.target.value)}
            className="w-full appearance-none rounded-lg border border-brand-gray-200 bg-white px-4 py-2.5 pr-10 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-red"
          >
            {GARMENTS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-brand-gray-400" />
        </div>
      </div>

      {/* Color selector */}
      <div>
        <label className="mb-2 block text-sm font-semibold text-brand-gray-600">
          Color
        </label>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            <button
              key={c.name}
              type="button"
              title={c.name}
              onClick={() => setSelectedColor(c.name)}
              className={`h-8 w-8 rounded-full border transition ${
                selectedColor === c.name
                  ? 'ring-2 ring-red ring-offset-2'
                  : 'border-brand-gray-200'
              }`}
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>
        <p className="mt-1 text-xs text-brand-gray-400">{selectedColor}</p>
      </div>

      {/* View toggle */}
      <div>
        <label className="mb-2 block text-sm font-semibold text-brand-gray-600">
          View
        </label>
        <div className="flex gap-2">
          {(['front', 'back'] as const).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() => setCurrentView(view)}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold capitalize transition ${
                currentView === view
                  ? 'bg-red text-white'
                  : 'bg-brand-gray-100 text-brand-gray-600 hover:bg-brand-gray-200'
              }`}
            >
              {view}
            </button>
          ))}
        </div>
      </div>

      {/* ------- Design Tools (accordion) ------- */}
      <div className="space-y-2">
        {/* Text section */}
        <div className="rounded-xl border border-brand-gray-200">
          <button
            type="button"
            onClick={() => toggleSection('text')}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-brand-gray-700"
          >
            <Type className="h-4 w-4" />
            <span className="flex-1">Text</span>
            <ChevronDown
              className={`h-4 w-4 transition ${openSection === 'text' ? 'rotate-180' : ''}`}
            />
          </button>
          {openSection === 'text' && (
            <div className="space-y-3 border-t border-brand-gray-100 px-4 pb-4 pt-3">
              <div className="flex gap-2">
                <input
                  placeholder="Enter text..."
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addText()}
                  className="flex-1 rounded-lg border border-brand-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red"
                />
                <button
                  type="button"
                  onClick={addText}
                  className="flex items-center gap-1 rounded-lg bg-red px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-dark"
                >
                  <Plus className="h-3 w-3" /> Add
                </button>
              </div>

              {/* Font size slider */}
              <div>
                <label className="text-xs text-brand-gray-500">
                  Font size: {textFontSize}px
                </label>
                <input
                  type="range"
                  min={12}
                  max={72}
                  value={textFontSize}
                  onChange={(e) => setTextFontSize(Number(e.target.value))}
                  className="w-full accent-red"
                />
              </div>

              {/* Text color */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-brand-gray-500">Color:</label>
                <input
                  type="color"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                  className="h-7 w-7 cursor-pointer rounded border-none"
                />
              </div>

              {/* Added elements */}
              {textElements.length > 0 && (
                <div className="space-y-1">
                  {textElements.map((el) => (
                    <div
                      key={el.id}
                      className="flex items-center gap-2 rounded-lg bg-brand-gray-50 px-3 py-2 text-sm"
                    >
                      <span
                        className="flex-1 truncate font-medium"
                        style={{ color: el.color }}
                      >
                        {el.text}
                      </span>
                      <span className="text-xs text-brand-gray-400">
                        {el.fontSize}px
                      </span>
                      <button
                        type="button"
                        onClick={() => removeText(el.id)}
                        className="text-brand-gray-400 transition hover:text-red"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Upload section */}
        <div className="rounded-xl border border-brand-gray-200">
          <button
            type="button"
            onClick={() => toggleSection('upload')}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-brand-gray-700"
          >
            <Upload className="h-4 w-4" />
            <span className="flex-1">Upload</span>
            <ChevronDown
              className={`h-4 w-4 transition ${openSection === 'upload' ? 'rotate-180' : ''}`}
            />
          </button>
          {openSection === 'upload' && (
            <div className="border-t border-brand-gray-100 px-4 pb-4 pt-3">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files[0];
                  if (f) handleFile(f);
                }}
                onClick={() => fileRef.current?.click()}
                className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-brand-gray-300 bg-brand-gray-50 p-6 text-center transition hover:border-red"
              >
                <Upload className="h-8 w-8 text-brand-gray-400" />
                <p className="text-xs text-brand-gray-500">
                  Drag & drop or click to upload
                </p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".png,.jpg,.jpeg,.svg"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              {uploadedImage && (
                <div className="mt-3 flex items-center gap-3">
                  <img
                    src={uploadedImage}
                    alt="Uploaded"
                    className="h-14 w-14 rounded-lg border border-brand-gray-200 object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => setUploadedImage(null)}
                    className="text-xs text-brand-gray-400 transition hover:text-red"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Placement section */}
        <div className="rounded-xl border border-brand-gray-200">
          <button
            type="button"
            onClick={() => toggleSection('placement')}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-brand-gray-700"
          >
            <MapPin className="h-4 w-4" />
            <span className="flex-1">Placement</span>
            <ChevronDown
              className={`h-4 w-4 transition ${openSection === 'placement' ? 'rotate-180' : ''}`}
            />
          </button>
          {openSection === 'placement' && (
            <div className="space-y-2 border-t border-brand-gray-100 px-4 pb-4 pt-3">
              {PLACEMENTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDesignPosition(p)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                    designPosition === p
                      ? 'bg-red/10 font-semibold text-red'
                      : 'text-brand-gray-600 hover:bg-brand-gray-50'
                  }`}
                >
                  {p}
                </button>
              ))}
              <p className="text-xs text-brand-gray-400">
                Current: {designPosition}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons (desktop) */}
      <div className="hidden space-y-2 lg:block">
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-brand-gray-200 px-4 py-2.5 text-sm font-semibold text-brand-gray-600 transition hover:bg-brand-gray-50"
        >
          <Save className="h-4 w-4" /> Save Design
        </button>
        <Link
          to="/quote"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-red px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-dark"
        >
          <ShoppingCart className="h-4 w-4" /> Get Quote
        </Link>
      </div>
    </aside>
  );

  /* ---------------------------------------------------------------- */
  /*  Preview panel                                                    */
  /* ---------------------------------------------------------------- */

  const hasDesign = textElements.length > 0 || uploadedImage;

  const preview = (
    <div className="flex flex-1 flex-col items-center justify-center bg-brand-gray-100 p-6 lg:p-10">
      {/* Garment preview */}
      <div
        className="relative flex aspect-square w-full max-w-lg items-center justify-center rounded-2xl"
        style={{ backgroundColor: selectedHex }}
      >
        {/* T-shirt silhouette */}
        <Shirt
          className="h-3/4 w-3/4"
          style={{ color: isLightColor ? '#e5e5e5' : 'rgba(255,255,255,0.15)' }}
        />

        {/* Design overlay area */}
        <div
          className={`absolute flex flex-col items-center justify-center gap-2 ${
            designPosition === 'Left Chest'
              ? 'left-[20%] top-[25%] h-[20%] w-[20%]'
              : designPosition === 'Right Chest'
                ? 'right-[20%] top-[25%] h-[20%] w-[20%]'
                : 'left-1/2 top-1/2 h-[45%] w-[45%] -translate-x-1/2 -translate-y-1/2'
          }`}
        >
          {/* Uploaded image */}
          {uploadedImage && (
            <img
              src={uploadedImage}
              alt="Design"
              className="max-h-full max-w-full object-contain"
            />
          )}

          {/* Text elements */}
          {textElements.map((el) => (
            <span
              key={el.id}
              className="whitespace-nowrap font-display font-bold leading-tight"
              style={{ fontSize: `${el.fontSize * 0.5}px`, color: el.color }}
            >
              {el.text}
            </span>
          ))}

          {/* Placeholder */}
          {!hasDesign && (
            <span
              className="text-center text-sm font-semibold opacity-40"
              style={{ color: isLightColor ? '#737373' : '#ffffff' }}
            >
              YOUR DESIGN HERE
            </span>
          )}
        </div>
      </div>

      {/* View label */}
      <p className="mt-4 text-sm font-semibold uppercase tracking-wide text-brand-gray-400">
        {currentView} view -{' '}
        {GARMENTS.find((g) => g.id === garmentType)?.label}
      </p>

      {/* Mobile action buttons */}
      <div className="mt-6 flex gap-3 lg:hidden">
        <button
          type="button"
          className="flex items-center gap-2 rounded-lg border border-brand-gray-200 px-5 py-2.5 text-sm font-semibold text-brand-gray-600 transition hover:bg-brand-gray-50"
        >
          <Save className="h-4 w-4" /> Save Design
        </button>
        <Link
          to="/quote"
          className="flex items-center gap-2 rounded-lg bg-red px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-dark"
        >
          <ShoppingCart className="h-4 w-4" /> Get Quote
        </Link>
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <Layout>
      <div className="flex min-h-[calc(100vh-200px)] flex-col lg:flex-row">
        {sidebar}
        {preview}
      </div>
    </Layout>
  );
}
