import { ReactNode } from 'react';
import { Sun, Leaf, Flower, Branch, GrassStrip } from '@/components/decorations/GardenDecorations';

type Theme = 'sun' | 'flowers' | 'leaves' | 'branches' | 'grass' | 'roots';

type Props = {
  theme: Theme;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
};

export default function PageBanner({ theme, eyebrow, title, subtitle, children }: Props) {
  return (
    <section className="relative overflow-hidden bg-meadow-gradient border-b border-meadow-200">
      <DecorLayer theme={theme} />
      <div className="relative max-w-5xl mx-auto px-4 sm:px-8 py-8 sm:py-12">
        {eyebrow && (
          <div className="text-[10px] uppercase tracking-[0.2em] text-meadow-600 font-semibold mb-2">
            {eyebrow}
          </div>
        )}
        <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-meadow-800 mb-2">{title}</h1>
        {subtitle && <p className="text-sm sm:text-base text-meadow-700 max-w-2xl">{subtitle}</p>}
        {children && <div className="mt-4">{children}</div>}
      </div>
      {theme !== 'grass' && (
        <div className="relative">
          <GrassStrip className="w-full h-6 sm:h-8 opacity-50" />
        </div>
      )}
    </section>
  );
}

function DecorLayer({ theme }: { theme: Theme }) {
  // `hidden sm:block` wrappers on the heavier decorations keep mobile banners tidy.
  switch (theme) {
    case 'sun':
      return (
        <>
          <Sun className="absolute -top-16 -right-12 opacity-70 sm:opacity-80" size={180} />
          <Leaf className="hidden sm:block absolute top-8 left-8 opacity-50" color="#8eb063" rotate={-30} size={34} />
          <Leaf className="hidden sm:block absolute bottom-12 left-24 opacity-40" color="#6b8f42" rotate={40} size={28} />
        </>
      );
    case 'flowers':
      return (
        <>
          <Flower className="absolute top-4 right-6 opacity-80" petal="#e89b9b" center="#f5c842" size={36} />
          <Flower className="hidden sm:block absolute top-16 right-32 opacity-70" petal="#cfe7f2" center="#f5c842" size={32} />
          <Flower className="hidden sm:block absolute bottom-10 right-20 opacity-75" petal="#f2c6c6" center="#e6b020" size={38} />
          <Flower className="hidden md:block absolute top-20 left-12 opacity-60" petal="#dc7878" center="#f5c842" size={28} />
          <Leaf className="hidden sm:block absolute bottom-16 left-24 opacity-50" color="#8eb063" rotate={-20} size={30} />
        </>
      );
    case 'leaves':
      return (
        <>
          <Leaf className="absolute top-4 right-6 opacity-70" color="#527132" rotate={-25} size={48} />
          <Leaf className="hidden sm:block absolute top-20 right-36 opacity-60" color="#6b8f42" rotate={30} size={44} />
          <Leaf className="hidden sm:block absolute bottom-10 right-10 opacity-50" color="#8eb063" rotate={-60} size={52} />
          <Leaf className="hidden md:block absolute top-10 left-10 opacity-45" color="#b9cc98" rotate={15} size={38} />
          <Leaf className="hidden sm:block absolute bottom-16 left-28 opacity-55" color="#527132" rotate={50} size={32} />
        </>
      );
    case 'branches':
      return (
        <>
          <Branch className="absolute top-4 right-0 opacity-70" size={220} />
          <Branch className="hidden sm:block absolute -bottom-2 -left-10 opacity-50" size={280} />
          <Flower className="hidden sm:block absolute top-8 right-20 opacity-70" petal="#f2c6c6" center="#f5c842" size={26} />
        </>
      );
    case 'grass':
      return (
        <>
          <Sun className="absolute -top-10 right-4 opacity-60" size={120} />
          <GrassStrip className="absolute bottom-0 left-0 w-full h-10 sm:h-14 opacity-80" />
        </>
      );
    case 'roots':
      return (
        <>
          <Branch className="absolute bottom-0 -right-8 opacity-50" size={220} />
          <Leaf className="hidden sm:block absolute top-10 left-10 opacity-40" color="#527132" rotate={90} size={40} />
          <Leaf className="hidden sm:block absolute top-24 left-36 opacity-50" color="#6b8f42" rotate={-60} size={32} />
        </>
      );
    default:
      return null;
  }
}
