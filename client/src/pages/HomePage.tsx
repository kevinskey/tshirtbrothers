import Layout from '@/components/layout/Layout';
import HeroSection from '@/components/home/HeroSection';
import ServicesGrid from '@/components/home/ServicesGrid';
import FeaturedBrands from '@/components/home/FeaturedBrands';
import DeliveryBanner from '@/components/home/DeliveryBanner';
import TestimonialsSection from '@/components/home/TestimonialsSection';
import BottomCTA from '@/components/home/BottomCTA';
import HowItWorksSection from '@/components/home/HowItWorksSection';
import PricingHint from '@/components/home/PricingHint';
import QuoteCTA from '@/components/home/QuoteCTA';
import SalesPopup from '@/components/home/SalesPopup';

export default function HomePage() {
  return (
    <Layout>
      <HeroSection />
      <SalesPopup />
      
      <ServicesGrid />
      <QuoteCTA />
      <HowItWorksSection />
      <PricingHint />
      <FeaturedBrands />
      
      <DeliveryBanner />
      <TestimonialsSection />
      <BottomCTA />
    </Layout>
  );
}
