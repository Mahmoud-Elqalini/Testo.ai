'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { useTranslation } from '@/lib/i18n/use-translation'
import JoinGroupForm from './JoinGroupForm'

export default function JoinGroupPageContent() {
  const { t } = useTranslation()

  return (
    <main className="mx-auto w-full max-w-xl space-y-6 px-4 py-10 sm:px-6">
      <header>
        <Link href="/dashboard" className="text-sm text-primary-text hover:underline dark:text-primary-text">{t('common.backArrow')} {t('nav.dashboard')}</Link>
        <h1 className="mt-4 text-3xl font-bold">{t('student.joinGroup.title')}</h1>
        <p className="mt-2 text-muted dark:text-muted">{t('student.joinGroup.description')}</p>
      </header>
      <Card className="p-6"><JoinGroupForm /></Card>
    </main>
  )
}
