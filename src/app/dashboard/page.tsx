'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { signOut } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n/use-translation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { WorkspaceIcon, WorkspaceLayout } from '@/components/shared/WorkspaceLayout'
import { SafeText } from '@/components/shared/SafeText'
import type { Group, UserRole } from '@/lib/types'
import { getDashboardData, type DashboardExam } from '@/lib/services/dashboard-service'
import type { JoinedGroup } from '@/lib/services/group-service'

// Course management is not yet part of the production data model. Keep visual
// fixtures confined to development until authenticated course data is available.
const USE_MOCK_DATA = process.env.NODE_ENV === 'development'
const MOCK_COURSES = [
  { id: 'course-algebra', title: 'Algebra Foundations', titleAr: 'أساسيات الجبر', category: 'Mathematics', categoryAr: 'الرياضيات', progress: 68, rating: 4.9, enrolled: 1240, image: 'linear-gradient(135deg,#dbeafe,#c4b5fd)' },
  { id: 'course-writing', title: 'Academic Writing Essentials', titleAr: 'أساسيات الكتابة الأكاديمية', category: 'Language', categoryAr: 'اللغة', progress: 32, rating: 4.8, enrolled: 860, image: 'linear-gradient(135deg,#fde68a,#fdba74)' },
  { id: 'course-science', title: 'Introduction to Biology', titleAr: 'مقدمة في علم الأحياء', category: 'Science', categoryAr: 'العلوم', progress: 0, rating: 4.7, enrolled: 2100, image: 'linear-gradient(135deg,#a7f3d0,#67e8f9)' },
  { id: 'course-history', title: 'World History: Modern Era', titleAr: 'تاريخ العالم الحديث', category: 'Humanities', categoryAr: 'العلوم الإنسانية', progress: 0, rating: 4.9, enrolled: 970, image: 'linear-gradient(135deg,#fecaca,#fbcfe8)' },
  { id: 'course-physics', title: 'Physics in Everyday Life', titleAr: 'الفيزياء في حياتنا اليومية', category: 'Science', categoryAr: 'العلوم', progress: 0, rating: 4.8, enrolled: 1500, image: 'linear-gradient(135deg,#bae6fd,#c7d2fe)' },
]

export default function DashboardPage() {
  const router = useRouter()
  const { t, language } = useTranslation()
  const [role, setRole] = useState<UserRole | null>(null)
  const [fullName, setFullName] = useState('')
  const [loadError, setLoadError] = useState(false)
  const [groups, setGroups] = useState<Group[]>([])
  const [joinedGroups, setJoinedGroups] = useState<JoinedGroup[]>([])
  const [exams, setExams] = useState<DashboardExam[]>([])
  const [now, setNow] = useState(0)
  const [showAllCourses, setShowAllCourses] = useState(false)

  useEffect(() => {
    let active = true
    async function loadDashboard() {
      const result = await getDashboardData()
      if (!active) return
      if (result.unauthenticated) {
        router.replace('/login')
        return
      }
      if (result.error || !result.data) {
        setLoadError(true)
        return
      }

      setGroups(result.data.groups)
      setJoinedGroups(result.data.joinedGroups)
      setExams(result.data.exams)
      setRole(result.data.role as UserRole)
      setFullName(result.data.fullName)
      setNow(Date.now())
    }
    void loadDashboard()
    return () => { active = false }
  }, [router])

  const handleLogout = async () => {
    await signOut()
    router.push('/login')
  }

  if (!role) {
    if (loadError) return <div className="testo-workspace testo-workspace-dashboard flex min-h-screen items-center justify-center p-6"><Card className="w-full max-w-md space-y-3 p-8 text-center">
          <>
          <h1 className="text-xl font-semibold">{t('dashboard.profileErrorTitle')}</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('dashboard.profileError')}</p>
          <Button variant="secondary" onClick={() => window.location.reload()}>{t('common.retry')}</Button>
          </>
    </Card></div>
    return <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="testo-workspace testo-workspace-dashboard"><header className="testo-mobile-header"><span className="testo-mobile-brand"><span className="testo-brand-mark">T</span><strong>Testo</strong></span><div className="testo-mobile-header-actions"><i className="testo-skeleton-control" /><i className="testo-skeleton-control" /><i className="testo-skeleton-control" /></div></header><main className="testo-dashboard-skeleton" role="status" aria-label={t('common.loading')}><div className="testo-skeleton-hero"><i /><i /><i /></div><div className="testo-skeleton-section"><i /><div><i /><i /></div></div><div className="testo-skeleton-section"><i /><div className="testo-skeleton-course-grid">{[0, 1, 2, 3].map((n) => <i key={n} />)}</div></div><div className="testo-skeleton-section"><i /><div><i /><i /></div></div><div className="testo-skeleton-section"><i /><div><i /></div></div></main></div>
  }

  const isTeacher = role === 'admin'
  const firstName = fullName.trim().split(/\s+/)[0]
  const title = firstName
    ? t('dashboard.welcomeName').replace('{name}', firstName)
    : t('dashboard.welcome')
  const sortedExams = exams.slice().sort((a, b) =>
    Math.abs(Date.parse(a.start_time) - now) - Math.abs(Date.parse(b.start_time) - now),
  )
  const formatDate = (date: string, includeTime = false) => new Intl.DateTimeFormat(language, {
    dateStyle: 'medium',
    ...(includeTime ? { timeStyle: 'short' as const } : {}),
  }).format(new Date(date))

  return <WorkspaceLayout
    role={role}
    active="dashboard"
    dashboardHref="/dashboard"
    dashboardMode
    userName={fullName}
    onSignOut={() => void handleLogout()}
  >
    <main className="testo-dashboard">
      <section className="testo-dashboard-hero">
        <div className="testo-dashboard-hero-copy">
          <span className="testo-dashboard-eyebrow">{isTeacher ? t('dashboard.teacherAccount') : t('dashboard.studentAccount')}</span>
          <h1>{title} <span aria-hidden="true">👋</span></h1>
          <p>{t('dashboard.heroDescription')}</p>
        </div>
        <div className="testo-dashboard-actions">
          {isTeacher ? <>
            <Link href="/admin/exams/create" className="testo-dashboard-action testo-dashboard-action-light"><WorkspaceIcon name="exams" />{t('dashboard.createExam')}</Link>
            <Link href="/admin/groups" className="testo-dashboard-action testo-dashboard-action-outline"><WorkspaceIcon name="groups" />{t('dashboard.createGroup')}</Link>
          </> : <>
            <Link href="/student" className="testo-dashboard-action testo-dashboard-action-light"><WorkspaceIcon name="exams" />{t('dashboard.studentExams')}</Link>
            <Link href="/student/join-group" className="testo-dashboard-action testo-dashboard-action-outline"><WorkspaceIcon name="groups" />{t('dashboard.joinGroup')}</Link>
          </>}
        </div>
      </section>

      <section className="testo-dashboard-section" aria-labelledby="continue-learning-title">
        <header className="testo-dashboard-section-heading">
          <h2 id="continue-learning-title"><WorkspaceIcon name="courses" />{t('dashboard.continueLearning')}</h2>
          <Link href="#featured-course-list">{t('dashboard.viewAll')}</Link>
        </header>
        {USE_MOCK_DATA ? <div className="testo-dashboard-learning-grid">{MOCK_COURSES.filter((course) => course.progress > 0).map((course) => <article className="testo-learning-card" key={course.id}>
          <span className="testo-learning-thumb" style={{ background: course.image }} aria-hidden="true"><WorkspaceIcon name="courses" /></span>
          <div className="testo-learning-detail"><small>{language === 'ar' ? course.categoryAr : course.category}</small><h3>{language === 'ar' ? course.titleAr : course.title}</h3><p>{t('dashboard.mockInstructor')}</p><div className="testo-learning-progress"><strong>{t('dashboard.progress')}</strong><b>{course.progress}%</b></div><div className="testo-progress-track" role="progressbar" aria-label={`${language === 'ar' ? course.titleAr : course.title} ${t('dashboard.progress')}`} aria-valuenow={course.progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${course.progress}%` }} /></div></div>
          <button className="testo-course-continue" type="button" disabled title={t('dashboard.courseUnavailable')}>{t('dashboard.continue')} <span aria-hidden="true">▶</span></button>
        </article>)}</div> : <Card className="testo-dashboard-empty-course"><span className="testo-dashboard-empty-icon" aria-hidden="true"><WorkspaceIcon name="courses" /></span><div><h3>{t('dashboard.emptyCoursesTitle')}</h3><p>{t('dashboard.coursesDescription')}</p></div></Card>}
      </section>

      <section id="featured-course-list" className="testo-dashboard-section" aria-labelledby="featured-courses-title">
        <header className="testo-dashboard-section-heading"><h2 id="featured-courses-title"><WorkspaceIcon name="explore" />{t('dashboard.exploreFeaturedCourses')}</h2><Link href="#featured-course-list">{t('dashboard.viewAll')}</Link></header>
        {USE_MOCK_DATA ? <><div className="testo-featured-course-grid">{MOCK_COURSES.slice(0, showAllCourses ? MOCK_COURSES.length : 4).map((course) => <article className="testo-featured-course" key={course.id}>
          <div className="testo-featured-cover" style={{ background: course.image }}><span>{language === 'ar' ? course.categoryAr : course.category}</span></div><div className="testo-featured-body"><div className="testo-course-meta"><span>★ {course.rating}</span><small>{course.enrolled.toLocaleString(language)} {t('dashboard.enrolled')}</small></div><h3>{language === 'ar' ? course.titleAr : course.title}</h3><p>{t('dashboard.mockInstructor')}</p><button type="button" className="testo-enroll-button" disabled title={t('dashboard.courseUnavailable')}>{t('dashboard.enrollCourse')}</button></div>
        </article>)}</div>{MOCK_COURSES.length > 4 && <button className="testo-show-more" type="button" onClick={() => setShowAllCourses((value) => !value)}>{showAllCourses ? t('dashboard.showLess') : t('dashboard.showMore')}</button>}</> : <Card className="testo-dashboard-course-catalog"><span className="testo-dashboard-catalog-icon" aria-hidden="true"><WorkspaceIcon name="explore" /></span><div><h3>{t('dashboard.catalogNotReady')}</h3><p>{t('dashboard.catalogDescription')}</p></div><Link href={isTeacher ? '/admin/groups' : '/student/join-group'}>{isTeacher ? t('dashboard.createGroup') : t('dashboard.joinGroup')}</Link></Card>}
      </section>

      <section className="testo-dashboard-section" aria-labelledby="my-groups-title">
        <header className="testo-dashboard-section-heading">
          <h2 id="my-groups-title"><WorkspaceIcon name="groups" />{t('dashboard.groupsOverview')}</h2>
          <Link href={isTeacher ? '/admin/groups' : '/student/join-group'}>{isTeacher ? t('dashboard.viewAll') : t('dashboard.joinGroup')}</Link>
        </header>
        <div className="testo-dashboard-groups-grid">
          <section className="testo-dashboard-group-panel" aria-labelledby="managed-groups-heading">
            <header className="testo-dashboard-group-panel-heading">
              <h3 id="managed-groups-heading">{t('dashboard.managedGroups')}</h3>
              <span className="testo-dashboard-count">{isTeacher ? groups.length : '—'}</span>
            </header>
            {isTeacher && groups.length > 0 ? <div className="testo-dashboard-group-rows">
              {groups.slice(0, 4).map((group) => <Link key={group.id} href={`/admin/groups/${group.id}`} className="testo-dashboard-group-row">
                <span className="testo-dashboard-group-copy"><strong><SafeText value={group.name} /></strong><small>{t('dashboard.teacherRole')}</small></span>
                <span className="testo-dashboard-role-tag">{t('dashboard.instructorYou')}</span>
              </Link>)}
            </div> : <div className="testo-dashboard-group-empty"><p>{isTeacher ? t('dashboard.noManagedGroups') : t('dashboard.instructorGroupsUnavailable')}</p>{isTeacher && <Link href="/admin/groups">{t('dashboard.createGroup')}</Link>}</div>}
          </section>
          <section className="testo-dashboard-group-panel" aria-labelledby="joined-groups-heading">
            <header className="testo-dashboard-group-panel-heading">
              <h3 id="joined-groups-heading">{t('dashboard.joinedGroups')}</h3>
              <span className="testo-dashboard-count testo-dashboard-count-muted">{!isTeacher ? joinedGroups.length : '—'}</span>
            </header>
            {!isTeacher && joinedGroups.length > 0 ? <div className="testo-dashboard-group-rows">
              {joinedGroups.slice(0, 4).map((group) => <article key={group.group_id} className="testo-dashboard-group-row">
                <span className="testo-dashboard-group-copy"><strong><SafeText value={group.group_name} /></strong><small>{t('dashboard.studentRole')}</small></span>
                <span className="testo-dashboard-role-tag testo-dashboard-role-tag-student">{t('dashboard.studentRole')}</span>
              </article>)}
            </div> : <div className="testo-dashboard-group-empty"><p>{!isTeacher ? t('dashboard.noJoinedGroups') : t('dashboard.studentGroupsUnavailable')}</p>{!isTeacher && <Link href="/student/join-group">{t('dashboard.joinGroup')}</Link>}</div>}
          </section>
        </div>
      </section>

      <section className="testo-dashboard-section" aria-labelledby="dashboard-exams-title">
        <Card className="testo-dashboard-exams">
          <header className="testo-dashboard-exams-heading">
            <h2 id="dashboard-exams-title"><WorkspaceIcon name="exams" />{t('dashboard.examsSection')}</h2>
            <Link href={isTeacher ? '/admin#exam-list' : '/student#open-exams-title'}>{t('dashboard.viewAll')}</Link>
          </header>
          {sortedExams.length > 0 ? <ul>
            {sortedExams.slice(0, 5).map((exam) => {
              const today = new Date(now)
              const examDay = new Date(exam.start_time)
              const todayKey = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
              const examDayKey = new Date(examDay.getFullYear(), examDay.getMonth(), examDay.getDate()).getTime()
              const dayOffset = Math.round((examDayKey - todayKey) / (24 * 60 * 60 * 1000))
              const dateStatus = dayOffset < 0 ? 'past' : dayOffset < 2 ? 'urgent' : 'upcoming'
              return <li key={exam.id}>
              <div><strong><SafeText value={exam.title} /></strong><small>{isTeacher && exam.is_published === false ? t('admin.exams.draft') : t('admin.exams.starts')} · {formatDate(exam.start_time, true)} · {exam.duration_minutes} {t('student.exam.minutes')}</small></div>
              <span className={`testo-dashboard-exam-date is-${dateStatus}`}><WorkspaceIcon name="calendar" />{formatDate(exam.start_time)}</span>
            </li>})}
          </ul> : <p className="testo-dashboard-exam-empty">{isTeacher ? t('dashboard.noTeacherExams') : t('student.exam.noAvailable')}</p>}
        </Card>
      </section>
    </main>
  </WorkspaceLayout>
}
