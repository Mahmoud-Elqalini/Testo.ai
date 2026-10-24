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

type DashboardSectionIconName = 'courses' | 'explore' | 'groups' | 'exams'

function DashboardSectionIcon({ name }: { name: DashboardSectionIconName }) {
  const shapes = {
    courses: <path d="M3 4.75A1.75 1.75 0 0 1 4.75 3H11v16H5a2 2 0 0 0-2 2V4.75ZM13 3h6.25A1.75 1.75 0 0 1 21 4.75V21a2 2 0 0 0-2-2h-6V3Z" />,
    explore: <path fillRule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.72 5.28-3.1 7.34-7.34 3.1 3.1-7.34 7.34-3.1ZM12 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />,
    groups: <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-1a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM1.5 20v-1.25A5.75 5.75 0 0 1 7.25 13h3.5a5.75 5.75 0 0 1 5.75 5.75V20h-15Zm16-6.8a5.7 5.7 0 0 1 5 5.65V20h-3.5v-1.25a7.2 7.2 0 0 0-1.5-4.4v-1.15Z" />,
    exams: <path fillRule="evenodd" d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1Zm-2 8v10h14V10H5Z" />,
  }
  return <svg className="testo-dashboard-section-icon" viewBox="0 0 24 24" aria-hidden="true">{shapes[name]}</svg>
}

function DashboardEmptyState({ icon, children, description, action }: { icon: DashboardSectionIconName; children: string; description?: string; action?: { href: string; label: string } }) {
  return <div className="testo-dashboard-empty-state">
    <DashboardSectionIcon name={icon} />
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
    return <div dir={language === 'ar' ? 'rtl' : 'ltr'} className="testo-workspace testo-workspace-dashboard"><header className="testo-mobile-header"><span className="testo-mobile-brand"><span className="testo-brand-mark"><img src="/testo-mark.png" alt="" /></span><strong>Testo</strong></span><div className="testo-mobile-header-actions"><i className="testo-skeleton-control" /><i className="testo-skeleton-control" /><i className="testo-skeleton-control" /></div></header><main className="testo-dashboard-skeleton" role="status" aria-label={t('common.loading')}><div className="testo-skeleton-hero"><i /><i /><i /></div><div className="testo-skeleton-section"><i /><div><i /><i /></div></div><div className="testo-skeleton-section"><i /><div className="testo-skeleton-course-grid">{[0, 1, 2, 3].map((n) => <i key={n} />)}</div></div><div className="testo-skeleton-section"><i /><div><i /><i /></div></div><div className="testo-skeleton-section"><i /><div><i /></div></div></main></div>
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
          <h2 id="continue-learning-title"><DashboardSectionIcon name="courses" />{t('dashboard.continueLearning')}</h2>
          <Link href="#featured-course-list">{t('dashboard.viewAll')}</Link>
        </header>
        <DashboardEmptyState icon="courses">{t('dashboard.emptyCoursesTitle')}</DashboardEmptyState>
      </section>

      <section id="featured-course-list" className="testo-dashboard-section" aria-labelledby="featured-courses-title">
        <header className="testo-dashboard-section-heading"><h2 id="featured-courses-title"><DashboardSectionIcon name="explore" />{t('dashboard.exploreFeaturedCourses')}</h2><Link href="#featured-course-list">{t('dashboard.viewAll')}</Link></header>
        <DashboardEmptyState icon="explore" description={t('dashboard.featuredCoursesEmptyDescription')}>{t('dashboard.featuredCoursesEmptyTitle')}</DashboardEmptyState>
      </section>

      <section className="testo-dashboard-section" aria-labelledby="my-groups-title">
        <header className="testo-dashboard-section-heading">
          <h2 id="my-groups-title"><DashboardSectionIcon name="groups" />{t('dashboard.groupsOverview')}</h2>
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
        <Card className="testo-dashboard-exams">
          <header className="testo-dashboard-exams-heading">
            <h2 id="dashboard-exams-title"><DashboardSectionIcon name="exams" />{t('dashboard.examsSection')}</h2>
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
          </ul> : <DashboardEmptyState icon="exams" action={isTeacher ? { href: '/admin/exams/create', label: t('dashboard.createExam') } : { href: '/student/join-group', label: t('dashboard.joinGroup') }}>{t('dashboard.noUpcomingExams')}</DashboardEmptyState>}
        </Card>
      </section>
    </main>
  </WorkspaceLayout>
}
