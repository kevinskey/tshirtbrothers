import { type ReactNode } from 'react';
import Navbar from './Navbar';
import Footer from './Footer';
import StickyMobileCTA from './StickyMobileCTA';

interface LayoutProps {
  children: ReactNode;
  /** 'es' renders the footer in Spanish (used by /es pages). */
  lang?: 'en' | 'es';
}

export default function Layout({ children, lang = 'en' }: LayoutProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      {/* pb-20 on mobile reserves room for the sticky StickyMobileCTA
          so the bottom of the footer isn't permanently hidden under it. */}
      <div className="pb-20 md:pb-0"><Footer lang={lang} /></div>
      <StickyMobileCTA />
    </div>
  );
}
