// In the iOS app the SPA is served from capacitor://localhost, so the
// relative '/api' paths used across ~70 files would resolve against the app
// bundle and 404. Rewriting fetch here, once, beats editing every call site.
// Import this before anything that might fetch (first import in main.tsx).
//
// Scoped to '/api' on purpose: bundled assets must keep resolving locally.
const NATIVE_API_ORIGIN = 'https://tshirtbrothers.com';

if (window.location.protocol === 'capacitor:') {
  const realFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && input.startsWith('/api')) {
      input = NATIVE_API_ORIGIN + input;
    } else if (input instanceof URL && input.protocol === 'capacitor:' && input.pathname.startsWith('/api')) {
      input = NATIVE_API_ORIGIN + input.pathname + input.search;
    } else if (input instanceof Request) {
      const u = new URL(input.url);
      if (u.protocol === 'capacitor:' && u.pathname.startsWith('/api')) {
        input = new Request(NATIVE_API_ORIGIN + u.pathname + u.search, input);
      }
    }
    return realFetch(input, init);
  };
}

export {};
