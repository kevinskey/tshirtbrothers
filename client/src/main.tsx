import './lib/nativeApi'; // must run before anything that fetches (iOS app)
import { initPushRegistration } from './lib/pushRegistration';
import { initAttribution } from './lib/referral';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void initPushRegistration();

// Record how this visitor found us (ChatGPT, Perplexity, search, …)
// before any client-side navigation rewrites document.referrer. Stores
// first-touch attribution and logs one event per session. Entirely
// best-effort and self-contained — see lib/referral.ts, including why
// these numbers are a floor on AI referrals rather than a total.
initAttribution();
