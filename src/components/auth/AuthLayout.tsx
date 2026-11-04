'use client'

import type { ReactNode } from 'react'
import Image from 'next/image'
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
        <aside className="auth-aside">
          <div className="auth-aside-copy">
            <span className="auth-kicker">{title}</span>
            <h2>{t('home.title')}</h2>
            <p>{t('home.description')}</p>
          </div>
        </aside>

        <section className={`auth-panel${compact ? ' auth-panel-compact' : ''}`}>
          <div className="auth-card">
            <header className="auth-heading">
              <span className="auth-heading-mark" aria-hidden="true">
                <Image className="manjam-logo-light" src="/images/logo/manjam-symbol-light.svg" alt="" width={40} height={40} />
                <Image className="manjam-logo-dark" src="/images/logo/manjam-symbol-dark.svg" alt="" width={40} height={40} />
              </span>
              <h1>{title}</h1>
              {description && <p>{description}</p>}
            </header>
            {children}
            {footer && <footer className="auth-footer">{footer}</footer>}
          </div>
          <p className="auth-copyright">© {new Date().getFullYear()} {t('publicHome.brandName')}</p>
        </section>
      </div>
    </main>
  )
}
