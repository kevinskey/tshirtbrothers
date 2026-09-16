import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { UploadCloud, CheckCircle2, XCircle, Loader2, ImageIcon } from 'lucide-react';

interface ArtworkQuoteInfo {
  id: number;
  customer_name: string | null;
  product_name: string | null;
  quantity: number | null;
  design_url: string | null;
  extra_design_urls: string[];
}

// Customer-facing artwork drop for the "we need your artwork" email. Files
// go up through the existing public /upload-design endpoint (base64 →
// Spaces), then attach to the quote via the tokenized /artwork endpoint.
export default function QuoteArtworkPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [info, setInfo] = useState<ArtworkQuoteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id || !token) { setError('This upload link is missing its token. Please use the link from your email.'); return; }
    fetch(`/api/quotes/artwork/${id}?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'This upload link is invalid or expired.');
        return r.json();
      })
      .then(setInfo)
      .catch((e) => setError(e.message));
  }, [id, token]);

  function toBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function upload() {
    if (uploading || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const urls: string[] = [];
      for (const [i, file] of files.entries()) {
        setProgress(`Uploading ${i + 1} of ${files.length}…`);
        const base64 = await toBase64(file);
        const res = await fetch('/api/quotes/upload-design', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, filename: file.name }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.url) throw new Error(data.error || `Upload failed for ${file.name}`);
        urls.push(data.url);
      }
      setProgress('Attaching to your order…');
      const attach = await fetch(`/api/quotes/artwork/${id}?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });
      if (!attach.ok) throw new Error((await attach.json().catch(() => ({}))).error || 'Could not attach the files to your order');
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      setProgress('');
    }
  }

  if (error && !info) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
          <XCircle className="w-16 h-16 text-red-500 mb-4" />
          <h1 className="text-2xl font-display font-bold text-gray-900 mb-2">Link Not Valid</h1>
          <p className="text-gray-500 max-w-md">{error}</p>
        </div>
      </Layout>
    );
  }

  if (!info) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
        </div>
      </Layout>
    );
  }

  if (done) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
          <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
          <h1 className="text-2xl font-display font-bold text-gray-900 mb-2">Artwork Received!</h1>
          <p className="text-gray-500 max-w-md">
            Your {files.length === 1 ? 'file is' : 'files are'} attached to order #{info.id}. Our team
            will put together a mockup for your approval — watch your email.
          </p>
        </div>
      </Layout>
    );
  }

  const existingCount = (info.design_url ? 1 : 0) + (info.extra_design_urls?.length || 0);

  return (
    <Layout>
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          <div className="text-center mb-6">
            <UploadCloud className="w-12 h-12 text-orange-500 mx-auto mb-3" />
            <h1 className="text-xl font-display font-bold text-gray-900 mb-1">
              Upload Artwork for Order #{info.id}
            </h1>
            <p className="text-sm text-gray-500">
              {info.customer_name ? `Hi ${info.customer_name}! ` : ''}
              {info.product_name ? `${info.product_name}${info.quantity ? ` × ${info.quantity}` : ''}. ` : ''}
              High-resolution PNG with a transparent background works best.
            </p>
            {existingCount > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                We already have {existingCount} file{existingCount === 1 ? '' : 's'} on this order — anything you add here goes with them.
              </p>
            )}
          </div>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
          />
          <button
            onClick={() => inputRef.current?.click()}
            className="w-full border-2 border-dashed border-gray-300 hover:border-orange-400 rounded-xl py-8 flex flex-col items-center gap-2 text-gray-500 hover:text-orange-600 mb-4"
          >
            <ImageIcon className="w-8 h-8" />
            <span className="text-sm font-medium">
              {files.length > 0 ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : 'Tap to choose your design files'}
            </span>
            {files.length > 0 && (
              <span className="text-xs text-gray-400">{files.map((f) => f.name).join(', ')}</span>
            )}
          </button>

          {error && <p className="text-sm text-red-600 mb-3 text-center">{error}</p>}
          <button
            onClick={upload}
            disabled={uploading || files.length === 0}
            className="w-full py-3 bg-orange-700 hover:bg-orange-800 disabled:opacity-50 text-white font-semibold rounded-lg"
          >
            {uploading ? (progress || 'Uploading…') : 'Send My Artwork'}
          </button>
          <p className="text-xs text-gray-400 text-center mt-3">
            No file? Reply to our email or call (470) 622-1392 — our design team helps for free.
          </p>
        </div>
      </div>
    </Layout>
  );
}
