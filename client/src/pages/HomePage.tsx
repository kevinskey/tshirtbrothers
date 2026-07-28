import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';
import HeroSection from '@/components/home/HeroSection';
import AttractionsGrid from '@/components/home/AttractionsGrid';
import PlanVisit from '@/components/home/PlanVisit';
import EatsAndParties from '@/components/home/EatsAndParties';
import GoogleReviews from '@/components/home/GoogleReviews';

export default function HomePage() {
  return (
    <Layout>
      <Seo
        title="Swing & Fling · Mini Golf, Axe Throwing & Good Food in South Atlanta"
        description="South Atlanta's premier outdoor entertainment venue — 18-hole mini golf, axe throwing, ninja stars, and food truck bites. No reservations needed, just swing by!"
        path="/"
      />
      <HeroSection />
      <AttractionsGrid />
      <EatsAndParties />
      <PlanVisit />
      <GoogleReviews />
    </Layout>
  );
}
