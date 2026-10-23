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
    return <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md space-y-3 p-8 text-center">
        {loadError ? <>
          <h1 className="text-xl font-semibold">{t('dashboard.profileErrorTitle')}</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('dashboard.profileError')}</p>
          <Button variant="secondary" onClick={() => window.location.reload()}>{t('common.retry')}</Button>
        </> : <p role="status" className="text-sm text-neutral-600 dark:text-neutral-300">{t('common.loading')}</p>}
      </Card>
    </div>
  }

  const isTeacher = role === 'admin'
  const title = fullName
    ? t('dashboard.welcomeName').replace('{name}', fullName)
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
          <span className="testo-dashboard-coming-soon">{t('dashboard.coursesComingSoon')}</span>
        </header>
        <Card className="testo-dashboard-empty-course">
          <span className="testo-dashboard-empty-icon" aria-hidden="true">▱</span>
          <div><h3>{t('dashboard.emptyCoursesTitle')}</h3><p>{t('dashboard.coursesDescription')}</p></div>
        </Card>
      </section>

      <section className="testo-dashboard-section" aria-labelledby="featured-courses-title">
        <header className="testo-dashboard-section-heading">
          <h2 id="featured-courses-title">{t('dashboard.exploreCourses')}</h2>
          <span className="testo-dashboard-coming-soon">{t('dashboard.coursesComingSoon')}</span>
        </header>
        <Card className="testo-dashboard-course-catalog">
          <span className="testo-dashboard-catalog-icon" aria-hidden="true">◎</span>
          <div><h3>{t('dashboard.catalogNotReady')}</h3><p>{t('dashboard.catalogDescription')}</p></div>
        </Card>
      </section>

      <section className="testo-dashboard-section" aria-labelledby="my-groups-title">
        <header className="testo-dashboard-section-heading">
          <h2 id="my-groups-title"><WorkspaceIcon name="groups" />{t('dashboard.groupsOverview')}</h2>
          <Link href={isTeacher ? '/admin/groups' : '/student/join-group'}>{isTeacher ? t('dashboard.viewAll') : t('dashboard.joinGroup')} <span aria-hidden="true">→</span></Link>
        </header>
        <div className="testo-dashboard-groups-grid">
          <section className="testo-dashboard-group-panel" aria-labelledby="managed-groups-heading">
            <header className="testo-dashboard-group-panel-heading">
              <h3 id="managed-groups-heading">{t('dashboard.managedGroups')}</h3>
              <span className="testo-dashboard-count">{isTeacher ? groups.length : 0}</span>
            </header>
            {isTeacher && groups.length > 0 ? <div className="testo-dashboard-group-rows">
              {groups.slice(0, 4).map((group) => <Link key={group.id} href={`/admin/groups/${group.id}`} className="testo-dashboard-group-row">
                <span className="testo-dashboard-group-copy"><strong><SafeText value={group.name} /></strong><small>{t('dashboard.teacherRole')}</small></span>
                <span className="testo-dashboard-role-tag">{t('dashboard.instructorYou')}</span>
              </Link>)}
            </div> : <div className="testo-dashboard-group-empty"><p>{isTeacher ? t('dashboard.noManagedGroups') : t('dashboard.instructorGroupsUnavailable')}</p>{isTeacher && <Link href="/admin/groups">{t('dashboard.createGroup')} <span aria-hidden="true">→</span></Link>}</div>}
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
            </div> : <div className="testo-dashboard-group-empty"><p>{!isTeacher ? t('dashboard.noJoinedGroups') : t('dashboard.studentGroupsUnavailable')}</p>{!isTeacher && <Link href="/student/join-group">{t('dashboard.joinGroup')} <span aria-hidden="true">→</span></Link>}</div>}
          </section>
        </div>
      </section>

      <section className="testo-dashboard-section" aria-labelledby="dashboard-exams-title">
        <Card className="testo-dashboard-exams">
          <header className="testo-dashboard-exams-heading">
            <h2 id="dashboard-exams-title"><WorkspaceIcon name="exams" />{t('dashboard.examsSection')}</h2>
            <Link href={isTeacher ? '/admin#exam-list' : '/student#open-exams-title'}>{t('dashboard.viewAll')} <span aria-hidden="true">→</span></Link>
          </header>
          {sortedExams.length > 0 ? <ul>
            {sortedExams.slice(0, 5).map((exam) => <li key={exam.id}>
              <div><strong><SafeText value={exam.title} /></strong><small>{isTeacher && exam.is_published === false ? t('admin.exams.draft') : t('admin.exams.starts')} · {formatDate(exam.start_time, true)} · {exam.duration_minutes} {t('student.exam.minutes')}</small></div>
              <span className="testo-dashboard-exam-date"><WorkspaceIcon name="exams" />{formatDate(exam.start_time)}</span>
            </li>)}
          </ul> : <p className="testo-dashboard-exam-empty">{isTeacher ? t('dashboard.noTeacherExams') : t('student.exam.noAvailable')}</p>}
        </Card>
      </section>
    </main>
  </WorkspaceLayout>
}
