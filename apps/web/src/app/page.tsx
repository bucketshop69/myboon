import HeroSection from '@/components/hero/HeroSection'
import { FeaturesSection } from '@/components/features/FeaturesSection'
import { LiveFeedSection } from '@/components/feed/LiveFeedSection'
import { FooterCTA } from '@/components/footer/FooterCTA'

export default function Home() {
  return (
    <main>
      <HeroSection />
      <FeaturesSection />
      <LiveFeedSection />
      <FooterCTA />
    </main>
  )
}
