import { useEffect, useRef, useState } from 'react';

// Module-level cache of loaded PDF documents keyed by URL. Multiple
// <PdfPageImage> instances for the same PDF share the parsed document,
// so showing pages 14 + 15 of the same file only downloads once.
const docCache = new Map<string, Promise<any>>();
let pdfjsModulePromise: Promise<any> | null = null;

function loadPdfJs() {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = import('pdfjs-dist').then(async (pdfjs) => {
      // pdfjs-dist ships a separate worker file; point the library at a
      // bundled URL so the worker can be served from our origin.
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    });
  }
  return pdfjsModulePromise;
}

function getDoc(url: string): Promise<any> {
  if (!docCache.has(url)) {
    const promise = loadPdfJs().then(async (pdfjs) => {
      const doc = await pdfjs.getDocument({ url }).promise;
      return doc;
    });
    docCache.set(url, promise);
  }
  return docCache.get(url)!;
}

type Props = {
  pdfUrl: string;
  pageNumber: number;
  maxWidth?: number;   // render at this CSS width in px (rendered higher DPR internally)
  className?: string;
};

export default function PdfPageImage({ pdfUrl, pageNumber, maxWidth = 900, className = '' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    let renderTask: any = null;

    async function render() {
      setStatus('loading');
      try {
        const doc = await getDoc(pdfUrl);
        if (cancelled) return;
        if (pageNumber < 1 || pageNumber > doc.numPages) {
          throw new Error(`Page ${pageNumber} out of range (PDF has ${doc.numPages} pages)`);
        }
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        // Compute scale so the rendered output fits maxWidth CSS pixels.
        const baseViewport = page.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const targetCssWidth = Math.min(maxWidth, baseViewport.width * 2);
        const scale = (targetCssWidth / baseViewport.width) * dpr;
        const viewport = page.getViewport({ scale });

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas 2d context unavailable');

        renderTask = page.render({ canvasContext: ctx, viewport });
        await renderTask.promise;
        if (cancelled) return;
        setStatus('ready');
      } catch (err: any) {
        if (!cancelled) {
          setErrorMessage(err?.message || 'Failed to render PDF page');
          setStatus('error');
        }
      }
    }

    render();

    return () => {
      cancelled = true;
      if (renderTask && typeof renderTask.cancel === 'function') {
        try { renderTask.cancel(); } catch { /* noop */ }
      }
    };
  }, [pdfUrl, pageNumber, maxWidth]);

  return (
    <div className={`relative ${className}`}>
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-meadow-400 text-sm">
          Rendering page {pageNumber}…
        </div>
      )}
      {status === 'error' && (
        <div className="p-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded">
          {errorMessage || `Couldn't render page ${pageNumber}`}
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={`mx-auto bg-white shadow-sm rounded border border-meadow-200 ${status === 'ready' ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}
