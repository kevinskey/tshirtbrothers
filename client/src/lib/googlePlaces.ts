// Lightweight Google Places Autocomplete hook — loads the Maps JS SDK on
// first use and attaches an autocomplete widget to an <input ref>.
//
// Needs VITE_GOOGLE_MAPS_KEY set in the client build environment. If the
// key is missing the hook becomes a no-op so the form keeps working as a
// plain text input.

import { useEffect, useRef } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */

declare global {
  interface Window {
    google?: any;
    __tsbGoogleMapsLoader?: Promise<void>;
  }
}

export interface ParsedAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  formatted: string;
}

function loadScript(key: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.maps?.places) return Promise.resolve();
  if (window.__tsbGoogleMapsLoader) return window.__tsbGoogleMapsLoader;

  window.__tsbGoogleMapsLoader = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-tsb-google-maps]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Maps')));
      return;
    }
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&loading=async`;
    s.async = true;
    s.defer = true;
    s.setAttribute('data-tsb-google-maps', 'true');
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(s);
  });
  return window.__tsbGoogleMapsLoader;
}

interface AddressComponent { long_name: string; short_name: string; types: string[] }
interface PlaceResult {
  address_components?: AddressComponent[];
  formatted_address?: string;
}

function parsePlace(place: PlaceResult): ParsedAddress {
  const get = (type: string, short = false): string => {
    const comp = place.address_components?.find((c) => c.types.includes(type));
    if (!comp) return '';
    return short ? comp.short_name : comp.long_name;
  };
  const streetNumber = get('street_number');
  const route = get('route');
  const city = get('locality') || get('postal_town') || get('sublocality_level_1') || get('neighborhood');
  const state = get('administrative_area_level_1', true);
  const zip = get('postal_code');
  const country = get('country', true);
  const street = [streetNumber, route].filter(Boolean).join(' ').trim();
  return {
    street,
    city,
    state,
    zip,
    country,
    formatted: place.formatted_address || '',
  };
}

/**
 * Attach a Google Places autocomplete widget to the given input ref.
 * Calls `onPlace` with a parsed ParsedAddress whenever the user selects a
 * suggestion. No-op if VITE_GOOGLE_MAPS_KEY is unset.
 */
export function useGooglePlacesAutocomplete(
  ref: React.RefObject<HTMLInputElement | null>,
  onPlace: (addr: ParsedAddress) => void,
) {
  const handlerRef = useRef(onPlace);
  handlerRef.current = onPlace;

  useEffect(() => {
    const key = (import.meta as unknown as { env: { VITE_GOOGLE_MAPS_KEY?: string } }).env.VITE_GOOGLE_MAPS_KEY;
    if (!key) return;
    const input = ref.current;
    if (!input) return;

    let autocomplete: any = null;
    let listener: any = null;
    let cancelled = false;

    loadScript(key).then(() => {
      if (cancelled || !ref.current || !window.google?.maps?.places) return;
      autocomplete = new window.google.maps.places.Autocomplete(ref.current, {
        types: ['address'],
        fields: ['address_components', 'formatted_address', 'geometry'],
        componentRestrictions: { country: ['us'] },
      });
      listener = autocomplete.addListener('place_changed', () => {
        const place = autocomplete?.getPlace();
        if (!place) return;
        handlerRef.current(parsePlace(place));
      });
    }).catch(() => { /* silently fall back to plain input */ });

    return () => {
      cancelled = true;
      if (listener) listener.remove();
      if (autocomplete && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(autocomplete);
      }
    };
  }, [ref]);
}
