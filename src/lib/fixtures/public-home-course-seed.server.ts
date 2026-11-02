import 'server-only'

type LocalizedText = Readonly<{ ar: string; en: string }>

/**
 * Synthetic display-only records for reviewing the public home page.
 * This file is not a database seed and must never be used as production data.
 * Preview locally by setting MANJAM_PUBLIC_HOME_SEED=true in the root .env.local
 * and restarting the dev server.
 * Delete this file and its single call site when a public course catalog exists.
 */
export type PublicHomeCourseSeed = Readonly<{
  id: string
  title: LocalizedText
  category: LocalizedText
  instructor: LocalizedText
  summary: LocalizedText
  coverStyle: 'navy' | 'ring' | 'cream'
  source: 'development-seed'
}>

const seedCourses: readonly PublicHomeCourseSeed[] = [
  {
    id: 'seed-mathematics-foundations',
    title: { ar: 'أساسيات الرياضيات', en: 'Mathematics Foundations' },
    category: { ar: 'رياضيات', en: 'Mathematics' },
    instructor: { ar: 'مدرّس تجريبي', en: 'Sample instructor' },
    summary: {
      ar: 'مراجعة المفاهيم الأساسية والتدرّب عليها خطوة بخطوة.',
      en: 'Review core concepts and practice them step by step.',
    },
    coverStyle: 'navy',
    source: 'development-seed',
  },
  {
    id: 'seed-physics-mechanics',
    title: { ar: 'مدخل إلى الميكانيكا', en: 'Introduction to Mechanics' },
    category: { ar: 'فيزياء', en: 'Physics' },
    instructor: { ar: 'مدرّس تجريبي', en: 'Sample instructor' },
    summary: {
      ar: 'تعرّف على الحركة والقوى من خلال أمثلة تعليمية مبسطة.',
      en: 'Explore motion and forces through clear learning examples.',
    },
    coverStyle: 'ring',
    source: 'development-seed',
  },
  {
    id: 'seed-english-essentials',
    title: { ar: 'أساسيات اللغة الإنجليزية', en: 'English Essentials' },
    category: { ar: 'لغة إنجليزية', en: 'English' },
    instructor: { ar: 'مدرّس تجريبي', en: 'Sample instructor' },
    summary: {
      ar: 'راجع القواعد والمفردات الأساسية في دروس قصيرة.',
      en: 'Build confidence with short lessons on essential grammar and vocabulary.',
    },
    coverStyle: 'cream',
    source: 'development-seed',
  },
]

/**
 * Returns preview data only when explicitly enabled in local development.
 * Keep live catalog selection in the caller and prefer live courses whenever
 * they exist. This function never reads from or writes to Supabase.
 */
export function getPublicHomeCourseSeed(): readonly PublicHomeCourseSeed[] {
  if (process.env.NODE_ENV !== 'development' || process.env.MANJAM_PUBLIC_HOME_SEED !== 'true') {
    return []
  }

  return seedCourses
}
