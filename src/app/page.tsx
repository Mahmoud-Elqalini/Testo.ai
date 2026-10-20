'use client'

import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/use-translation'

export default function Home() {
  const { t } = useTranslation()

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <section className="w-full max-w-2xl space-y-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{t('home.title')}</h1>
        <p className="mx-auto max-w-xl text-lg text-neutral-600 dark:text-neutral-300">{t('home.description')}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/login" className="rounded-md bg-[var(--color-primary-600)] px-5 py-3 font-medium text-white hover:bg-[var(--color-primary-700)]">{t('home.login')}</Link>
          <Link href="/register" className="rounded-md border border-neutral-300 px-5 py-3 font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900">{t('home.register')}</Link>
        </div>
      </section>
    </main>
  )
}
