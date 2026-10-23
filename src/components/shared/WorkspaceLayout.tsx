'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useTranslation } from '@/lib/i18n/use-translation'

type WorkspaceLayoutProps = {
  role: 'admin' | 'student'
  active: 'dashboard' | 'exams' | 'groups' | 'exam-room'
  children: ReactNode
  focusMode?: boolean
  dashboardHref?: string
}

export function WorkspaceLayout({ role, active, children, focusMode = false, dashboardHref }: WorkspaceLayoutProps) {
  const { t, language } = useTranslation()
  const admin = role === 'admin'
  const links = admin
    ? [
        { key: 'dashboard', href: dashboardHref ?? '/admin', label: t('nav.dashboard'), icon: '▦' },
        { key: 'exams', href: '/admin#exam-list', label: t('admin.exams.title'), icon: '▤' },
        { key: 'groups', href: '/admin/groups', label: t('admin.groups.title'), icon: '♧' },
      ]
    : [
        { key: 'dashboard', href: dashboardHref ?? '/student', label: t('nav.dashboard'), icon: '▦' },
        { key: 'exams', href: '/student#open-exams-title', label: t('student.exam.available'), icon: '▤' },
        { key: 'groups', href: '/student/join-group', label: t('dashboard.joinGroup'), icon: '♧' },
      ]

  return (
    <div dir={language === 'ar' ? 'rtl' : 'ltr'} className={`testo-workspace${focusMode ? ' testo-workspace-focus' : ''}`}>
      {!focusMode && <aside className="testo-sidebar">
        <Link className="testo-brand" href={dashboardHref ?? (admin ? '/admin' : '/student')}>
          <span className="testo-brand-mark">✦</span><span><strong>testo</strong><small>{language === 'ar' ? 'مساحة المدرسة' : 'School workspace'}</small></span>
        </Link>
        <p className="testo-nav-label">{t('nav.dashboard')}</p>
        <nav className="testo-nav" aria-label={t('nav.dashboard')}>
          {links.map((item) => <Link key={item.key} className={`testo-nav-item${active === item.key ? ' is-active' : ''}`} href={item.href}>
            <span className="testo-nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>
          </Link>)}
        </nav>
        <div className="testo-sidebar-spacer" />
        <div className="testo-help-card"><span className="testo-help-icon">?</span><span><strong>{language === 'ar' ? 'مركز المساعدة' : 'Help center'}</strong><small>{language === 'ar' ? 'نحن هنا لمساعدتك' : 'We’re here to help'}</small></span></div>
      </aside>}
      <div className="testo-main">
        <header className="testo-topbar">
          {focusMode ? <Link className="testo-brand testo-brand-compact" href="/student"><span className="testo-brand-mark">✦</span><strong>testo</strong></Link> : <div className="testo-breadcrumb">{admin ? (language === 'ar' ? 'مساحة المدرسة' : 'School workspace') : t('student.exam.dashboardTitle')} <span>/</span> {links.find((item) => item.key === active)?.label}</div>}
          {focusMode && <span className="testo-saved-indicator"><i />{t('student.exam.autosaveHint')}</span>}
        </header>
        <div className="testo-page-content">{children}</div>
      </div>
    </div>
  )
}
