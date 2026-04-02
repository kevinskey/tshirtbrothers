import Layout from '@/components/layout/Layout';
import HeroSection from '@/components/home/HeroSection';
import ServicesGrid from '@/components/home/ServicesGrid';
import FeaturedBrands from '@/components/home/FeaturedBrands';
import DeliveryBanner from '@/components/home/DeliveryBanner';
import TestimonialsSection from '@/components/home/TestimonialsSection';
import BottomCTA from '@/components/home/BottomCTA';

export default function HomePage() {
  return (
    <Layout>
      <HeroSection />
      <ServicesGrid />
      <FeaturedBrands />
      <DeliveryBanner />
      <TestimonialsSection />
      <BottomCTA />
    </Layout>
  );
}
