import { useState, useCallback, useRef } from 'react';
import Layout from '@/components/layout/Layout';
import { submitQuote } from '@/lib/api';
import {
  Shirt,
  ChevronRight,
  ChevronLeft,
  Check,
  Upload,
  Sparkles,
  X,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface FormData {
  garment: string;
  color: string;
  sizes: Record<string, number>;
  printAreas: string[];
  designFile: File | null;
  designPreview: string | null;
  aiPrompt: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes: string;
}

const INITIAL_FORM: FormData = {
  garment: '',
  color: '',
  sizes: { S: 0, M: 0, L: 0, XL: 0, '2XL': 0, '3XL': 0 },
  printAreas: ['Full Front'],
  designFile: null,
  designPreview: null,
  aiPrompt: '',
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  notes: '',
};

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STEPS = [
  'Choose Garment',
  'Select Color & Size',
  'Print Areas',
  'Upload Design',
  'Review & Submit',
];

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

const SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL'];

const PRINT_AREAS: { id: string; label: string; price: string }[] = [
  { id: 'Full Front', label: 'Full Front', price: 'included' },
  { id: 'Full Back', label: 'Full Back', price: '+$2/shirt' },
  { id: 'Left Chest', label: 'Left Chest', price: '+$1/shirt' },
  { id: 'Left Sleeve', label: 'Left Sleeve', price: '+$3/shirt' },
  { id: 'Right Sleeve', label: 'Right Sleeve', price: '+$3/shirt' },
];

const PRINT_AREA_COST: Record<string, number> = {
  'Full Front': 0,
  'Full Back': 2,
  'Left Chest': 1,
  'Left Sleeve': 3,
  'Right Sleeve': 3,
};

const BASE_PRICES: Record<string, number> = {
  tshirt: 8,
  hoodie: 18,
  polo: 14,
  longsleeve: 12,
  sweatshirt: 16,
  tanktop: 7,
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function QuotePage() {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [designTab, setDesignTab] = useState<'upload' | 'ai'>('upload');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /* helpers */
  const update = useCallback(
    (patch: Partial<FormData>) => setFormData((prev) => ({ ...prev, ...patch })),
    [],
  );

  const totalQty = Object.values(formData.sizes).reduce((a, b) => a + b, 0);

  const printAreaExtra = formData.printAreas.reduce(
    (sum, area) => sum + (PRINT_AREA_COST[area] ?? 0),
    0,
  );

  const unitPrice = (BASE_PRICES[formData.garment] ?? 0) + printAreaExtra;
  const estimatedTotal = unitPrice * totalQty;

  const canAdvance = (): boolean => {
    if (currentStep === 1) return !!formData.garment;
    if (currentStep === 2) return !!formData.color && totalQty > 0;
    if (currentStep === 3) return formData.printAreas.length > 0;
    if (currentStep === 4) return !!(formData.designPreview || formData.aiPrompt);
    return true;
  };

  /* file handling */
  const handleFile = (file: File) => {
    update({ designFile: file, designPreview: URL.createObjectURL(file) });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  /* submit */
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await submitQuote({
        garment: formData.garment,
        color: formData.color,
        sizes: formData.sizes,
        printAreas: formData.printAreas,
        hasDesign: !!formData.designPreview,
        aiPrompt: formData.aiPrompt,
        customerName: formData.customerName,
        customerEmail: formData.customerEmail,
        customerPhone: formData.customerPhone,
        notes: formData.notes,
        estimatedTotal,
      });
      setSubmitted(true);
    } catch {
      /* silently handle -- real app would show error */
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Step renderers                                                    */
  /* ---------------------------------------------------------------- */

  const renderStep1 = () => (
    <div>
      <h2 className="font-display text-2xl font-bold">Choose your garment</h2>
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        {GARMENTS.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => update({ garment: g.id })}
            className={`flex flex-col items-center gap-3 rounded-xl border p-6 transition hover:shadow-md ${
              formData.garment === g.id
                ? 'ring-2 ring-red border-transparent'
                : 'border-brand-gray-200'
            }`}
          >
            <Shirt className="h-10 w-10 text-brand-gray-500" />
            <span className="font-medium">{g.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div>
      <h2 className="font-display text-2xl font-bold">Select color and sizes</h2>

      {/* Color picker */}
      <p className="mt-6 font-medium text-brand-gray-700">Color</p>
      <div className="mt-3 flex flex-wrap gap-3">
        {COLORS.map((c) => (
          <button
            key={c.name}
            type="button"
            title={c.name}
            onClick={() => update({ color: c.name })}
            className={`h-10 w-10 rounded-full border-2 transition ${
              formData.color === c.name
                ? 'ring-2 ring-red ring-offset-2'
                : 'border-brand-gray-200'
            }`}
            style={{ backgroundColor: c.hex }}
          />
        ))}
      </div>
      {formData.color && (
        <p className="mt-2 text-sm text-brand-gray-500">
          Selected: {formData.color}
        </p>
      )}

      {/* Sizes */}
      <p className="mt-8 font-medium text-brand-gray-700">Quantity per size</p>
      <div className="mt-3 grid grid-cols-3 gap-4 sm:grid-cols-6">
        {SIZES.map((size) => (
          <div key={size} className="flex flex-col items-center gap-1">
            <label className="text-sm font-semibold text-brand-gray-600">
              {size}
            </label>
            <input
              type="number"
              min={0}
              value={formData.sizes[size] || 0}
              onChange={(e) =>
                update({
                  sizes: {
                    ...formData.sizes,
                    [size]: Math.max(0, parseInt(e.target.value) || 0),
                  },
                })
              }
              className="w-full rounded-lg border border-brand-gray-200 px-3 py-2 text-center focus:outline-none focus:ring-2 focus:ring-red"
            />
          </div>
        ))}
      </div>
      {totalQty > 0 && (
        <p className="mt-3 text-sm text-brand-gray-500">
          Total quantity: {totalQty}
        </p>
      )}
    </div>
  );

  const renderStep3 = () => {
    const toggle = (area: string) => {
      if (area === 'Full Front') return; // always included
      update({
        printAreas: formData.printAreas.includes(area)
          ? formData.printAreas.filter((a) => a !== area)
          : [...formData.printAreas, area],
      });
    };

    return (
      <div>
        <h2 className="font-display text-2xl font-bold">Choose print areas</h2>
        <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:gap-12">
          {/* Checkboxes */}
          <div className="flex-1 space-y-3">
            {PRINT_AREAS.map((pa) => (
              <label
                key={pa.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-brand-gray-200 p-4 transition hover:bg-brand-gray-50"
              >
                <input
                  type="checkbox"
                  checked={formData.printAreas.includes(pa.id)}
                  onChange={() => toggle(pa.id)}
                  disabled={pa.id === 'Full Front'}
                  className="h-5 w-5 rounded border-brand-gray-300 text-red accent-red"
                />
                <span className="flex-1 font-medium">{pa.label}</span>
                <span className="text-sm text-brand-gray-500">{pa.price}</span>
              </label>
            ))}
          </div>

          {/* Visual garment outline */}
          <div className="flex flex-1 items-start justify-center gap-8">
            {/* Front */}
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-brand-gray-400">
                Front
              </span>
              <div className="relative flex h-48 w-36 items-center justify-center rounded-xl bg-brand-gray-100">
                <Shirt className="h-28 w-28 text-brand-gray-300" />
                {formData.printAreas.includes('Full Front') && (
                  <span className="absolute inset-x-6 top-14 flex items-center justify-center rounded bg-red/20 py-2 text-[10px] font-bold text-red">
                    FRONT
                  </span>
                )}
                {formData.printAreas.includes('Left Chest') && (
                  <span className="absolute left-4 top-12 flex h-6 w-6 items-center justify-center rounded-full bg-red/20 text-[8px] font-bold text-red">
                    LC
                  </span>
                )}
              </div>
            </div>
            {/* Back */}
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-brand-gray-400">
                Back
              </span>
              <div className="relative flex h-48 w-36 items-center justify-center rounded-xl bg-brand-gray-100">
                <Shirt className="h-28 w-28 text-brand-gray-300" />
                {formData.printAreas.includes('Full Back') && (
                  <span className="absolute inset-x-6 top-14 flex items-center justify-center rounded bg-red/20 py-2 text-[10px] font-bold text-red">
                    BACK
                  </span>
                )}
                {formData.printAreas.includes('Left Sleeve') && (
                  <span className="absolute left-1 top-16 flex h-5 w-5 items-center justify-center rounded-full bg-red/20 text-[7px] font-bold text-red">
                    LS
                  </span>
                )}
                {formData.printAreas.includes('Right Sleeve') && (
                  <span className="absolute right-1 top-16 flex h-5 w-5 items-center justify-center rounded-full bg-red/20 text-[7px] font-bold text-red">
                    RS
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderStep4 = () => (
    <div>
      <h2 className="font-display text-2xl font-bold">Upload your design</h2>

      {/* Tabs */}
      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={() => setDesignTab('upload')}
          className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition ${
            designTab === 'upload'
              ? 'bg-red text-white'
              : 'bg-brand-gray-100 text-brand-gray-600 hover:bg-brand-gray-200'
          }`}
        >
          <Upload className="h-4 w-4" /> Upload File
        </button>
        <button
          type="button"
          onClick={() => setDesignTab('ai')}
          className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition ${
            designTab === 'ai'
              ? 'bg-red text-white'
              : 'bg-brand-gray-100 text-brand-gray-600 hover:bg-brand-gray-200'
          }`}
        >
          <Sparkles className="h-4 w-4" /> AI Generate
        </button>
      </div>

      {/* Upload tab */}
      {designTab === 'upload' && (
        <div className="mt-6">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className="flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-brand-gray-300 bg-brand-gray-50 p-12 text-center transition hover:border-red"
          >
            <Upload className="h-10 w-10 text-brand-gray-400" />
            <p className="font-medium text-brand-gray-600">
              Drag & drop your file here, or click to browse
            </p>
            <p className="text-sm text-brand-gray-400">
              PNG, JPG, or SVG accepted
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
        </div>
      )}

      {/* AI tab */}
      {designTab === 'ai' && (
        <div className="mt-6 space-y-4">
          <textarea
            rows={4}
            placeholder="Describe the design you want (e.g., 'A bold eagle holding a flag with patriotic red and blue colors')"
            value={formData.aiPrompt}
            onChange={(e) => update({ aiPrompt: e.target.value })}
            className="w-full rounded-xl border border-brand-gray-200 p-4 focus:outline-none focus:ring-2 focus:ring-red"
          />
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-red px-6 py-2.5 font-semibold text-white transition hover:bg-red-dark"
          >
            <Sparkles className="h-4 w-4" /> Generate
          </button>
        </div>
      )}

      {/* Preview */}
      {formData.designPreview && (
        <div className="mt-6">
          <p className="mb-2 text-sm font-medium text-brand-gray-600">Preview</p>
          <div className="relative inline-block">
            <img
              src={formData.designPreview}
              alt="Design preview"
              className="h-48 w-48 rounded-xl border border-brand-gray-200 object-contain"
            />
            <button
              type="button"
              onClick={() => update({ designFile: null, designPreview: null })}
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand-gray-800 text-white transition hover:bg-red"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const renderStep5 = () => {
    if (submitted) {
      return (
        <div className="flex flex-col items-center py-12 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
            <Check className="h-10 w-10 text-green-600" />
          </div>
          <h2 className="mt-6 font-display text-3xl font-bold">
            Quote submitted!
          </h2>
          <p className="mt-3 text-lg text-brand-gray-500">
            We'll respond within 24 hours.
          </p>
        </div>
      );
    }

    const garmentLabel =
      GARMENTS.find((g) => g.id === formData.garment)?.label ?? '';
    const sizeEntries = Object.entries(formData.sizes).filter(([, v]) => v > 0);

    return (
      <div>
        <h2 className="font-display text-2xl font-bold">Review your quote</h2>

        {/* Summary card */}
        <div className="mt-6 space-y-4 rounded-2xl border border-brand-gray-200 bg-brand-gray-50 p-6">
          <div className="flex flex-wrap gap-8">
            <div className="flex-1 space-y-2 text-sm">
              <p>
                <span className="font-semibold text-brand-gray-700">Garment:</span>{' '}
                {garmentLabel}
              </p>
              <p>
                <span className="font-semibold text-brand-gray-700">Color:</span>{' '}
                {formData.color}
              </p>
              <p>
                <span className="font-semibold text-brand-gray-700">Sizes:</span>{' '}
                {sizeEntries.map(([s, q]) => `${s} x${q}`).join(', ')}
              </p>
              <p>
                <span className="font-semibold text-brand-gray-700">
                  Print areas:
                </span>{' '}
                {formData.printAreas.join(', ')}
              </p>
            </div>
            {formData.designPreview && (
              <img
                src={formData.designPreview}
                alt="Design"
                className="h-24 w-24 rounded-lg border border-brand-gray-200 object-contain"
              />
            )}
          </div>

          <div className="border-t border-brand-gray-200 pt-4">
            <p className="text-lg font-bold">
              Estimated total:{' '}
              <span className="text-red">
                ${estimatedTotal.toFixed(2)}
              </span>
            </p>
            <p className="text-xs text-brand-gray-400">
              ${unitPrice.toFixed(2)}/shirt x {totalQty} shirts
            </p>
          </div>
        </div>

        {/* Contact form */}
        <div className="mt-8 space-y-4">
          <h3 className="font-display text-lg font-bold">Your information</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <input
              placeholder="Full name *"
              value={formData.customerName}
              onChange={(e) => update({ customerName: e.target.value })}
              className="rounded-lg border border-brand-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red"
            />
            <input
              type="email"
              placeholder="Email address *"
              value={formData.customerEmail}
              onChange={(e) => update({ customerEmail: e.target.value })}
              className="rounded-lg border border-brand-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red"
            />
            <input
              type="tel"
              placeholder="Phone number *"
              value={formData.customerPhone}
              onChange={(e) => update({ customerPhone: e.target.value })}
              className="rounded-lg border border-brand-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red"
            />
          </div>
          <textarea
            rows={3}
            placeholder="Additional notes (optional)"
            value={formData.notes}
            onChange={(e) => update({ notes: e.target.value })}
            className="w-full rounded-lg border border-brand-gray-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red"
          />
        </div>

        {/* Submit */}
        <button
          type="button"
          disabled={
            submitting ||
            !formData.customerName ||
            !formData.customerEmail ||
            !formData.customerPhone
          }
          onClick={handleSubmit}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-red px-8 py-3 font-semibold text-white transition hover:bg-red-dark disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : 'Submit Quote'}
        </button>
      </div>
    );
  };

  const stepRenderers = [renderStep1, renderStep2, renderStep3, renderStep4, renderStep5];

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <Layout>
      <section className="container py-12 md:py-16">
        {/* Progress bar */}
        <div className="mb-10">
          <div className="flex items-center justify-between">
            {STEPS.map((label, i) => {
              const step = i + 1;
              const done = currentStep > step;
              const active = currentStep === step;
              return (
                <div
                  key={label}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition ${
                      done
                        ? 'bg-red text-white'
                        : active
                          ? 'bg-red text-white ring-4 ring-red-light'
                          : 'bg-brand-gray-200 text-brand-gray-500'
                    }`}
                  >
                    {done ? <Check className="h-4 w-4" /> : step}
                  </div>
                  <span
                    className={`hidden text-center text-xs sm:block ${
                      active ? 'font-semibold text-brand-gray-800' : 'text-brand-gray-400'
                    }`}
                  >
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
          {/* connector line */}
          <div className="relative mt-[-30px] flex px-[18px]">
            {STEPS.slice(1).map((_, i) => (
              <div
                key={i}
                className={`h-0.5 flex-1 ${
                  currentStep > i + 1 ? 'bg-red' : 'bg-brand-gray-200'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="min-h-[400px]">{stepRenderers[currentStep - 1]?.()}</div>

        {/* Navigation (hidden on step 5 once submitted or for submit btn) */}
        {currentStep < 5 && (
          <div className="mt-10 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
              disabled={currentStep === 1}
              className="inline-flex items-center gap-2 rounded-lg border border-brand-gray-200 px-5 py-2.5 font-semibold text-brand-gray-600 transition hover:bg-brand-gray-50 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            <button
              type="button"
              onClick={() => setCurrentStep((s) => Math.min(5, s + 1))}
              disabled={!canAdvance()}
              className="inline-flex items-center gap-2 rounded-lg bg-red px-6 py-2.5 font-semibold text-white transition hover:bg-red-dark disabled:opacity-50"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {currentStep === 5 && !submitted && (
          <div className="mt-10 flex items-center justify-start">
            <button
              type="button"
              onClick={() => setCurrentStep(4)}
              className="inline-flex items-center gap-2 rounded-lg border border-brand-gray-200 px-5 py-2.5 font-semibold text-brand-gray-600 transition hover:bg-brand-gray-50"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
          </div>
        )}
      </section>
    </Layout>
  );
}
