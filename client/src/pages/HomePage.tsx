import { useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import HeroSection from '@/components/home/HeroSection';
import SocialProofBar from '@/components/home/SocialProofBar';
import ServicesGrid from '@/components/home/ServicesGrid';
import PopularProducts from '@/components/home/PopularProducts';
import FeaturedBrands from '@/components/home/FeaturedBrands';
import ValueProps from '@/components/home/ValueProps';
import DeliveryBanner from '@/components/home/DeliveryBanner';
import TestimonialsSection from '@/components/home/TestimonialsSection';
import HowItWorks from '@/components/home/HowItWorks';
import LocalCTA from '@/components/home/LocalCTA';

export default function HomePage() {
  useEffect(() => {
    document.title = 'TShirt Brothers | Custom T-Shirt Printing in Fairburn & Tyrone, GA';
  }, []);

  return (
    <Layout>
      <HeroSection />
      <SocialProofBar />
      <ServicesGrid />
      <PopularProducts />
      <FeaturedBrands />
      <ValueProps />
      <DeliveryBanner />
      <TestimonialsSection />
      <HowItWorks />
      <LocalCTA />
    </Layout>
  );
}
