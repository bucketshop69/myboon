import HeroSection from '@/components/hero/HeroSection'
import { FeaturesSection } from '@/components/features/FeaturesSection'
import { FooterCTA } from '@/components/footer/FooterCTA'

export default function Home() {
  return (
    <main className="landing-page-gradient">
      <HeroSection />
      <FeaturesSection />
      <FooterCTA />
    </main>
  )
}
