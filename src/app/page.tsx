import type { Metadata } from 'next'
import PublicHome, { type PublicHomeCourse } from '@/components/home/PublicHome'
import { getPublicHomeCourseSeed } from '@/lib/fixtures/public-home-course-seed.server'

export const metadata: Metadata = {
  title: 'Manjam | منجم',
  description: 'اكتشف طريقك للتعلّم مع منجم — Discover your next learning step with Manjam.',
}

export default function Home() {
  const courses: readonly PublicHomeCourse[] = getPublicHomeCourseSeed()
  return <PublicHome courses={courses} />
}
