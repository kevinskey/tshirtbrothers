import './lib/nativeApi'; // must run before anything that fetches (iOS app)
import { initPushRegistration } from './lib/pushRegistration';
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
