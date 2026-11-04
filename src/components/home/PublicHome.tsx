'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, BookOpenCheck, Clock, Compass, MapPin, TrendingUp } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/use-translation'

export type PublicHomeCourse = Readonly<{
  id: string
  title: { ar: string; en: string }
  category?: { ar: string; en: string }
  summary?: { ar: string; en: string }
}>

function CourseLoadingCards({ label }: { label: string }) {
  return <div className="manjam-course-grid" role="status" aria-label={label} aria-busy="true">
    {[0, 1, 2].map((item) => <div className="manjam-course-card manjam-course-skeleton" aria-hidden="true" key={item}>
      <div className="manjam-skeleton-cover" />
      <div className="manjam-course-content"><i className="manjam-skeleton-line is-short" /><i className="manjam-skeleton-line is-title" /><i className="manjam-skeleton-line" /><i className="manjam-skeleton-line is-medium" /></div>
    </div>)}
  </div>
}

export default function PublicHome({ courses, coursesLoading = false }: { courses: readonly PublicHomeCourse[]; coursesLoading?: boolean }) {
  const { language, t } = useTranslation()
  const localize = (value: { ar: string; en: string }) => value[language]

  return <main id="home" className="manjam-home">
    <section className="manjam-hero" aria-labelledby="manjam-hero-title">
      <div className="manjam-hero-box"><div className="manjam-hero-copy">
        <span className="manjam-eyebrow"><i className="manjam-hero-dot" aria-hidden="true" />{t('publicHome.heroEyebrow')}</span>
        <h1 id="manjam-hero-title">{t('publicHome.heroTitle')}</h1>
        <p>{t('publicHome.heroDescription')}</p>
        <div className="manjam-hero-actions">
          <a className="manjam-button manjam-button-primary" href="#courses">{t('publicHome.exploreCourses')}<ArrowRight className="manjam-cta-arrow" size={17} aria-hidden="true" /></a>
          <Link className="manjam-button manjam-button-secondary" href="/register">{t('publicHome.startLearning')}</Link>
        </div>
      </div>
      <div className="manjam-hero-art" aria-hidden="true">
        <div className="manjam-art-orbit manjam-art-orbit-one" />
        <div className="manjam-book"><span className="manjam-book-icon">✦</span><strong>{t('publicHome.heroArtTitle')}</strong><small>{t('publicHome.heroArtLabel')}</small></div>
        <div className="manjam-float-tag manjam-tag-one"><span aria-hidden="true">✦</span><b>{t('publicHome.heroTagOne')}</b></div>
        <div className="manjam-float-tag manjam-tag-two"><span aria-hidden="true">✦</span><b>{t('publicHome.heroTagTwo')}</b></div>
      </div></div>
    </section>

    <section id="courses" className="manjam-courses" aria-labelledby="manjam-courses-title">
      <div className="manjam-content-wrap">
      <div className="manjam-section-heading"><div><span className="manjam-eyebrow">{t('publicHome.coursesEyebrow')}</span><h2 id="manjam-courses-title">{t('publicHome.coursesTitle')}</h2><p className="manjam-courses-intro">{t('publicHome.coursesDescription')}</p></div><div className="manjam-course-heading-aside"><a className="manjam-all-courses" href="#courses">{t('publicHome.allCourses')}<ArrowRight size={17} aria-hidden="true" /></a></div></div>
      {coursesLoading ? <CourseLoadingCards label={t('publicHome.coursesLoading')} /> : courses.length ? <div className="manjam-course-grid">{courses.slice(0, 3).map((course) => <article className="manjam-course-card" key={course.id}>
        <div className="manjam-course-cover" aria-hidden="true"><span className="manjam-course-cover-art"><BookOpenCheck size={40} strokeWidth={1.5} /></span></div>
        <div className="manjam-course-content">
          {course.category && <span className="manjam-course-category">{localize(course.category)}</span>}
          <h3>{localize(course.title)}</h3>
          {course.summary && <p>{localize(course.summary)}</p>}
        </div>
      </article>)}</div> : <div className="manjam-empty-state"><span className="manjam-empty-icon"><Compass size={26} aria-hidden="true" /></span><h3>{t('publicHome.emptyTitle')}</h3><p>{t('publicHome.emptyDescription')}</p></div>}
      </div>
    </section>

    <section id="why" className="manjam-benefits" aria-labelledby="manjam-benefits-title">
      <div className="manjam-content-wrap">
      <div className="manjam-section-heading"><div><span className="manjam-eyebrow">{t('publicHome.aboutEyebrow')}</span><h2 id="manjam-benefits-title">{t('publicHome.aboutTitle')}</h2></div></div>
      <div className="manjam-benefit-grid">
        {(['clarity', 'flexibility', 'progress'] as const).map((item, index) => { const Icon = [MapPin, Clock, TrendingUp][index]; return <article className="manjam-benefit-card" key={item}><span className="manjam-benefit-icon"><Icon size={22} aria-hidden="true" /></span><div><h3>{t(`publicHome.benefit${item}Title`)}</h3><p>{t(`publicHome.benefit${item}Description`)}</p></div></article> })}
      </div>
      </div>
    </section>

    <footer className="manjam-footer">
      <div className="manjam-footer-inner">
        <div className="manjam-footer-main">
          <div className="manjam-footer-brand">
            <Image className="manjam-logo-light" src="/images/logo/manjam-logo-horizontal-light.svg" alt={t('publicHome.brandName')} width={150} height={50} />
            <Image className="manjam-logo-dark" src="/images/logo/manjam-logo-horizontal-dark.svg" alt="" width={150} height={50} />
            <p>{t('publicHome.footerTagline')}</p>
            <p className="manjam-footer-languages">{t('publicHome.footerLanguages')}</p>
          </div>
          <div className="manjam-footer-group">
            <h3>{t('publicHome.quickLinks')}</h3>
            <nav aria-label={t('publicHome.quickLinks')}>
              <Link href="/">{t('nav.home')}</Link>
              <Link href="#courses">{t('publicHome.navCourses')}</Link>
              <Link href="/login">{t('publicHome.signIn')}</Link>
              <Link href="/register">{t('publicHome.createAccount')}</Link>
            </nav>
          </div>
          <div className="manjam-footer-group manjam-footer-contact">
            <h3>{t('publicHome.footerContactLegal')}</h3>
            <p>{t('publicHome.footerContactNote')}</p>
            <a href={`mailto:${t('publicHome.footerEmail')}`}>{t('publicHome.footerEmail')}</a>
            <div className="manjam-footer-legal" role="group" aria-label={t('publicHome.footerLegalLabels')}>
              <span>{t('publicHome.footerPrivacyPolicy')}</span>
              <span>{t('publicHome.footerTermsOfService')}</span>
            </div>
          </div>
        </div>
        <div className="manjam-footer-bottom">
          <span>© {new Date().getFullYear()} {t('publicHome.brandName')} — {t('publicHome.rights')}</span>
          <span>{t('publicHome.footerMotto')}</span>
        </div>
      </div>
    </footer>
  </main>
}
