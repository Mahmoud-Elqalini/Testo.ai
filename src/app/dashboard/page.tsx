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
import { getCourses } from '@/lib/fixtures/courses'

type DashboardSectionIconName = 'courses' | 'explore' | 'groups' | 'exams'

function DashboardEmptyState({ icon, children, description, action }: { icon: DashboardSectionIconName; children: string; description?: string; action?: { href: string; label: string } }) {
  return <div className="testo-dashboard-empty-state">
    <WorkspaceIcon name={icon} size={20} className="testo-dashboard-section-icon" />
    <div className="testo-dashboard-empty-copy"><strong>{children}</strong>{description && <p>{description}</p>}</div>
    {action && <Link className="testo-dashboard-empty-action" href={action.href}>{action.label}</Link>}
  </div>
}

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
  const courses = getCourses()

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
    return <WorkspaceLayout role={null} active="dashboard" dashboardHref="/dashboard" dashboardMode>
      {loadError ? <div className="dashboard-load-error"><Card className="w-full max-w-md space-y-3 p-8 text-center">
        <h1 className="text-xl font-semibold">{t('dashboard.profileErrorTitle')}</h1>
        <p className="text-sm text-muted dark:text-muted">{t('dashboard.profileError')}</p>
        <Button variant="secondary" onClick={() => window.location.reload()}>{t('common.retry')}</Button>
      </Card></div> : <div className="testo-dashboard-skeleton" role="status" aria-label={t('common.loading')}>
        <div className="testo-skeleton-hero"><i /><i /><i /></div>
        <div className="testo-skeleton-section"><i /><div><i /><i /></div></div>
        <div className="testo-skeleton-section"><i /><div className="testo-skeleton-course-grid">{[0, 1, 2, 3].map((n) => <i key={n} />)}</div></div>
        <div className="testo-skeleton-section"><i /><div><i /><i /></div></div>
        <div className="testo-skeleton-section"><i /><div><i /></div></div>
      </div>}
    </WorkspaceLayout>
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
          <h2 id="continue-learning-title"><WorkspaceIcon name="courses" size={20} className="testo-dashboard-section-icon" />{t('dashboard.continueLearning')}</h2>
          <Link href="#featured-course-list">{t('dashboard.viewAll')}</Link>
        </header>
        {courses.some((course) => course.isEnrolled) ? <div className="testo-dashboard-learning-grid">
          {courses.filter((course) => course.isEnrolled).map((course) => <article className="testo-learning-card" key={course.id}>
            <div className="testo-learning-thumb" style={{ backgroundImage: course.coverImageUrl }} aria-hidden="true"><WorkspaceIcon name="courses" /></div>
            <div className="testo-learning-detail"><small>{course.category}</small><h3>{course.title}</h3><p>{course.instructorName}</p><div className="testo-learning-progress"><strong>{t('dashboard.progress')}</strong><b>{course.progressPercent ?? 0}%</b></div><div className="testo-progress-track" role="progressbar" aria-label={`${t('dashboard.progress')}: ${course.title}`} aria-valuenow={course.progressPercent ?? 0} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${course.progressPercent ?? 0}%` }} /></div></div>
          </article>)}
        </div> : <DashboardEmptyState icon="courses">{t('dashboard.emptyCoursesTitle')}</DashboardEmptyState>}
      </section>

      <section id="featured-course-list" className="testo-dashboard-section" aria-labelledby="featured-courses-title">
        <header className="testo-dashboard-section-heading"><h2 id="featured-courses-title"><WorkspaceIcon name="explore" size={20} className="testo-dashboard-section-icon" />{t('dashboard.exploreFeaturedCourses')}</h2><Link href="#featured-course-list">{t('dashboard.viewAll')}</Link></header>
        {courses.length ? <div className="testo-featured-course-grid">
          {courses.map((course) => <article className="testo-featured-course" key={course.id}>
            <div className="testo-featured-cover" style={{ backgroundImage: course.coverImageUrl }}><span>{course.category}</span></div>
            <div className="testo-featured-body"><div className="testo-course-meta"><span>★ {course.rating.toFixed(1)}</span><small>{course.enrolledCount.toLocaleString(language)} {t('dashboard.enrolled')}</small></div><h3>{course.title}</h3><p>{course.instructorName}</p><button className="testo-enroll-button" type="button" disabled>{course.isEnrolled ? t('dashboard.enrolled') : t('dashboard.enrollCourse')}</button></div>
          </article>)}
        </div> : <DashboardEmptyState icon="explore" description={t('dashboard.featuredCoursesEmptyDescription')}>{t('dashboard.featuredCoursesEmptyTitle')}</DashboardEmptyState>}
      </section>

      <section className="testo-dashboard-section" aria-labelledby="my-groups-title">
        <header className="testo-dashboard-section-heading">
          <h2 id="my-groups-title"><WorkspaceIcon name="groups" size={20} className="testo-dashboard-section-icon" />{t('dashboard.groupsOverview')}</h2>
          <Link href={isTeacher ? '/admin/groups' : '/student/join-group'}>{t('dashboard.viewAll')}</Link>
        </header>
        <div className="testo-dashboard-groups-grid">
          <section className="testo-dashboard-group-panel" aria-labelledby="managed-groups-heading">
            <header className="testo-dashboard-group-panel-heading">
              <h3 id="managed-groups-heading">{t('dashboard.managedGroups')}</h3>
              <span className="testo-dashboard-count testo-dashboard-count-managed">{isTeacher ? groups.length : 0}</span>
            </header>
            {isTeacher && groups.length > 0 ? <div className="testo-dashboard-group-rows">
              {groups.slice(0, 4).map((group) => <Link key={group.id} href={`/admin/groups/${group.id}`} className="testo-dashboard-group-row">
                <span className="testo-dashboard-group-copy"><strong><SafeText value={group.name} /></strong><small>{t('dashboard.teacherRole')}</small></span>
                <span className="testo-dashboard-role-tag">{t('dashboard.instructorYou')}</span>
              </Link>)}
            </div> : <DashboardEmptyState icon="groups" action={isTeacher ? { href: '/admin/groups', label: t('dashboard.createGroup') } : undefined}>{isTeacher ? t('dashboard.noManagedGroups') : t('dashboard.instructorGroupsUnavailable')}</DashboardEmptyState>}
          </section>
          <section className="testo-dashboard-group-panel" aria-labelledby="joined-groups-heading">
            <header className="testo-dashboard-group-panel-heading">
              <h3 id="joined-groups-heading">{t('dashboard.joinedGroups')}</h3>
              <span className="testo-dashboard-count testo-dashboard-count-muted">{!isTeacher ? joinedGroups.length : 0}</span>
            </header>
            {!isTeacher && joinedGroups.length > 0 ? <div className="testo-dashboard-group-rows">
              {joinedGroups.slice(0, 4).map((group) => <article key={group.group_id} className="testo-dashboard-group-row">
                <span className="testo-dashboard-group-copy"><strong><SafeText value={group.group_name} /></strong><small>{t('dashboard.studentRole')}</small></span>
                <span className="testo-dashboard-role-tag testo-dashboard-role-tag-student">{t('dashboard.studentRole')}</span>
              </article>)}
            </div> : <DashboardEmptyState icon="groups" action={!isTeacher ? { href: '/student/join-group', label: t('dashboard.joinGroup') } : undefined}>{!isTeacher ? t('dashboard.noJoinedGroups') : t('dashboard.studentGroupsUnavailable')}</DashboardEmptyState>}
          </section>
        </div>
      </section>

      <section className="testo-dashboard-section" aria-labelledby="dashboard-exams-title">
        <header className="testo-dashboard-section-heading">
          <h2 id="dashboard-exams-title"><WorkspaceIcon name="exams" size={20} className="testo-dashboard-section-icon" />{t('dashboard.examsSection')}</h2>
          <Link href={isTeacher ? '/admin#exam-list' : '/student#open-exams-title'}>{t('dashboard.viewAll')}</Link>
        </header>
        <Card className="testo-dashboard-exams">
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
          </ul> : <DashboardEmptyState icon="exams" action={isTeacher ? { href: '/admin/exams/create', label: t('dashboard.createExam') } : { href: '/student/join-group', label: t('dashboard.joinGroup') }}>{t('dashboard.noUpcomingExams')}</DashboardEmptyState>}
        </Card>
      </section>
    </main>
  </WorkspaceLayout>
}
