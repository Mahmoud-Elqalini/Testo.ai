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
  dashboardMode?: boolean
  userName?: string
  onSignOut?: () => void
}

export function WorkspaceLayout({ role, active, children, focusMode = false, dashboardHref, dashboardMode = false, userName = '', onSignOut }: WorkspaceLayoutProps) {
  const { t, language, setLanguage } = useTranslation()
  const admin = role === 'admin'
  const links = dashboardMode
    ? [
        { key: 'dashboard', href: dashboardHref ?? '/dashboard', label: t('nav.dashboard'), icon: '⌂' },
        { key: 'courses', href: null, label: t('dashboard.myCourses'), icon: '▣' },
        { key: 'explore', href: null, label: t('dashboard.exploreCourses'), icon: '◉' },
        { key: 'groups', href: admin ? '/admin/groups' : '/student/join-group', label: t('dashboard.myGroups'), icon: '♧' },
        { key: 'exams', href: admin ? '/admin#exam-list' : '/student#open-exams-title', label: t('dashboard.studentExams'), icon: '▤' },
        { key: 'settings', href: null, label: t('dashboard.settings'), icon: '⚙' },
      ]
    : admin
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
    <div dir={language === 'ar' ? 'rtl' : 'ltr'} className={`testo-workspace${focusMode ? ' testo-workspace-focus' : ''}${dashboardMode ? ' testo-workspace-dashboard' : ''}`}>
      {!focusMode && <aside className="testo-sidebar">
        <Link className="testo-brand" href={dashboardHref ?? (admin ? '/admin' : '/student')}>
          <span className="testo-brand-mark">T</span><span><strong>Testo</strong>{!dashboardMode && <small>{language === 'ar' ? 'مساحة المدرسة' : 'School workspace'}</small>}</span>
        </Link>
        {!dashboardMode && <p className="testo-nav-label">{t('nav.dashboard')}</p>}
        <nav className="testo-nav" aria-label={t('nav.dashboard')}>
          {links.map((item) => item.href ? <Link key={item.key} className={`testo-nav-item${active === item.key ? ' is-active' : ''}`} href={item.href}>
            <span className="testo-nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>
          </Link> : <span key={item.key} className="testo-nav-item is-disabled" aria-disabled="true" title={t('dashboard.comingSoon')}>
            <span className="testo-nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span><small>{t('dashboard.comingSoon')}</small>
          </span>)}
        </nav>
        <div className="testo-sidebar-spacer" />
        {dashboardMode ? <>
          <button type="button" className="testo-language-toggle" onClick={() => void setLanguage(language === 'en' ? 'ar' : 'en')}>
            <span><span aria-hidden="true">◎</span> {t('dashboard.languageLabel')}: {language === 'en' ? t('preferences.english') : t('preferences.arabic')}</span>
            <strong>{language === 'en' ? t('preferences.arabic') : 'English'}</strong>
          </button>
          <div className="testo-account-card">
            <span className="testo-account-avatar" aria-hidden="true">{userName.trim().charAt(0).toLocaleUpperCase(language) || 'T'}</span>
            <span className="testo-account-copy"><strong>{userName || t('dashboard.account')}</strong><small>{admin ? t('dashboard.teacherAccount') : t('dashboard.studentAccount')}</small></span>
            {onSignOut && <button type="button" className="testo-account-signout" onClick={onSignOut} aria-label={t('dashboard.logout')} title={t('dashboard.logout')}>⇥</button>}
          </div>
        </> : <div className="testo-help-card"><span className="testo-help-icon">?</span><span><strong>{language === 'ar' ? 'مركز المساعدة' : 'Help center'}</strong><small>{language === 'ar' ? 'نحن هنا لمساعدتك' : 'We’re here to help'}</small></span></div>}
      </aside>}
      <div className="testo-main">
        {!dashboardMode && <header className="testo-topbar">
          {focusMode ? <Link className="testo-brand testo-brand-compact" href="/student"><span className="testo-brand-mark">✦</span><strong>testo</strong></Link> : <div className="testo-breadcrumb">{admin ? (language === 'ar' ? 'مساحة المدرسة' : 'School workspace') : t('student.exam.dashboardTitle')} <span>/</span> {links.find((item) => item.key === active)?.label}</div>}
          {focusMode && <span className="testo-saved-indicator"><i />{t('student.exam.autosaveHint')}</span>}
        </header>}
        <div className="testo-page-content">{children}</div>
      </div>
    </div>
  )
}
