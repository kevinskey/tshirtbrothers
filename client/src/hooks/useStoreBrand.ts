// Whitelabel entry point for the franchise-store flow.
//
// When the studio (or storefront) is loaded with ?store=<slug>, we fetch
// the store's public brand config and expose it here. The consumer picks
// up logo, primary color, back-URL, etc. and skins its own chrome.
//
// No auth required — the endpoint returns only public fields (name +
// brand_json). If the slug is missing or the fetch fails, we return null
// and callers fall back to default TSB chrome (backwards compatible).
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export interface StoreBrand {
  slug: string;
  name: string;
  brand_json: {
    logo_url?: string;
    primary_color?: string;
    /** Optional URL for the ← back button. If absent, the studio's default
     *  back-target is used. */
    back_url?: string;
    /** Small footer/legal text ("Powered by TShirt Brothers — Fulfilled by
     *  TSB") that the storefront can render. */
    footer_note?: string;
    /** Reserved for future custom-domain hosting. */
    custom_domain?: string;
  };
}

interface UseStoreBrand {
  brand: StoreBrand | null;
  loading: boolean;
  slug: string | null;
}

export function useStoreBrand(): UseStoreBrand {
  const [params] = useSearchParams();
  const slug = params.get('store');
  const [brand, setBrand] = useState<StoreBrand | null>(null);
  const [loading, setLoading] = useState(!!slug);

  useEffect(() => {
    if (!slug) {
      setBrand(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/stores/${encodeURIComponent(slug)}/public-brand`, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) throw new Error(`brand fetch ${res.status}`);
        const data = (await res.json()) as StoreBrand;
        if (!cancelled) setBrand(data);
      } catch {
        // Silent fallback — the caller degrades to default TSB chrome.
        if (!cancelled) setBrand(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  return { brand, loading, slug };
}

/** True when a non-null store brand is active. Convenience for JSX. */
export function isWhitelabeled(brand: StoreBrand | null): brand is StoreBrand {
  return !!brand;
}
