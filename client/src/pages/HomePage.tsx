import Layout from '@/components/layout/Layout';
import HeroSection from '@/components/home/HeroSection';
import SocialProofBar from '@/components/home/SocialProofBar';
import ServicesGrid from '@/components/home/ServicesGrid';
import HowItWorks from '@/components/home/HowItWorks';
import PopularProducts from '@/components/home/PopularProducts';
import ValueProps from '@/components/home/ValueProps';
import TestimonialsSection from '@/components/home/TestimonialsSection';
import LocalCTA from '@/components/home/LocalCTA';

export default function HomePage() {
  return (
    <Layout>
      <HeroSection />
      <SocialProofBar />
      <ServicesGrid />
      <HowItWorks />
      <PopularProducts />
      <ValueProps />
      <TestimonialsSection />
      <LocalCTA />
    </Layout>
  );
}
