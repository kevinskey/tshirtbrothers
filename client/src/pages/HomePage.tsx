import Layout from '@/components/layout/Layout';
import Seo from '@/components/Seo';
import HeroSection from '@/components/home/HeroSection';
import ServicesGrid from '@/components/home/ServicesGrid';
import FeaturedBrands from '@/components/home/FeaturedBrands';
import DeliveryBanner from '@/components/home/DeliveryBanner';
import TestimonialsSection from '@/components/home/TestimonialsSection';
import GoogleReviews from '@/components/home/GoogleReviews';
import BottomCTA from '@/components/home/BottomCTA';
import HowItWorksSection from '@/components/home/HowItWorksSection';
import PricingHint from '@/components/home/PricingHint';
import QuoteCTA from '@/components/home/QuoteCTA';
import SalesPopup from '@/components/home/SalesPopup';

export default function HomePage() {
  return (
    <Layout>
      <Seo
        title="Custom T-Shirt Printing in Atlanta · Screen Print, DTF, Embroidery · TShirt Brothers"
        description="Custom t-shirts, hoodies, and apparel printed in Atlanta. Screen printing, DTF, embroidery — no minimums, 2–7 day turnaround, free local pickup in Fairburn, GA."
        path="/"
      />
      <HeroSection />
      <SalesPopup />
      
      <ServicesGrid />
      <QuoteCTA />
      <HowItWorksSection />
      <PricingHint />
      <FeaturedBrands />
      
      <DeliveryBanner />
      <GoogleReviews />
      <TestimonialsSection />
      <BottomCTA />
    </Layout>
  );
}
