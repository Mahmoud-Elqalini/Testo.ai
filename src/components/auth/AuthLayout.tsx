'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n/use-translation'

export function AuthLayout({
  title,
  description,
  children,
  footer,
  compact = false,
}: {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  compact?: boolean
}) {
  const { t } = useTranslation()

  return (
    <main className="auth-page">
      <div className="auth-layout">
        <aside className="auth-aside" aria-label="Testo">
          <Link href="/" className="auth-brand" aria-label="Testo home">
            <span className="auth-brand-mark" aria-hidden="true"><img src="/testo-mark.png" alt="" /></span>
            <span>Testo</span>
          </Link>
          <div className="auth-aside-copy">
            <span className="auth-kicker">{title}</span>
            <h2>{t('home.title')}</h2>
            <p>{t('home.description')}</p>
          </div>
          <div className="auth-orbit auth-orbit-one" aria-hidden="true" />
          <div className="auth-orbit auth-orbit-two" aria-hidden="true" />
          <div className="auth-aside-note" aria-hidden="true">
            <span className="auth-note-dot" />
            <span>Testo</span>
          </div>
        </aside>

        <section className={`auth-panel${compact ? ' auth-panel-compact' : ''}`}>
          <div className="auth-card">
            <div className="auth-mobile-brand" aria-hidden="true">
              <span className="auth-brand-mark"><img src="/testo-mark.png" alt="" /></span><span>Testo</span>
            </div>
            <header className="auth-heading">
              <span className="auth-heading-mark" aria-hidden="true">✦</span>
              <h1>{title}</h1>
              {description && <p>{description}</p>}
            </header>
            {children}
            {footer && <footer className="auth-footer">{footer}</footer>}
          </div>
          <p className="auth-copyright">© {new Date().getFullYear()} Testo</p>
        </section>
      </div>
    </main>
  )
}
