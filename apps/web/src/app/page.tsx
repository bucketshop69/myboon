import HeroSection from '@/components/hero/HeroSection'
import { FeaturesScroll } from '@/components/features/FeaturesScroll'
import { NewsroomSection } from '@/components/world/NewsroomSection'

export default function Home() {
  return (
    <main>
      <HeroSection />
      <FeaturesScroll />
      <NewsroomSection />
    </main>
  )
}
