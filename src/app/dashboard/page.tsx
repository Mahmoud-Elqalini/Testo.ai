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
import type { Group } from '@/lib/types'
import { getDashboardData, type DashboardExam } from '@/lib/services/dashboard-service'
import type { JoinedGroup } from '@/lib/services/group-service'

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
  const [loading, setLoading] = useState(true)
  const [fullName, setFullName] = useState('')
  const [loadError, setLoadError] = useState(false)
  const [groups, setGroups] = useState<Group[]>([])
  const [joinedGroups, setJoinedGroups] = useState<JoinedGroup[]>([])
  const [exams, setExams] = useState<DashboardExam[]>([])
  const [sectionErrors, setSectionErrors] = useState({ ownedGroups: false, joinedGroups: false, exams: false })
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
        setLoading(false)
        return
      }

      setGroups(result.data.groups)
      setJoinedGroups(result.data.joinedGroups)
      setExams(result.data.exams)
      setSectionErrors(result.data.sectionErrors)
      setFullName(result.data.fullName)
      setNow(Date.now())
      setLoading(false)
    }
    void loadDashboard()
    return () => { active = false }
  }, [router])

  const handleLogout = async () => {
    await signOut()
    router.push('/login')
  }

  if (loading) {
    return <WorkspaceLayout active="dashboard" dashboardHref="/dashboard" dashboardMode>
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
    active="dashboard"
    dashboardHref="/dashboard"
    dashboardMode
    userName={fullName}
    onSignOut={() => void handleLogout()}
  >
    <main className="testo-dashboard">
      <section className="testo-dashboard-hero">
        <div className="testo-dashboard-hero-copy">
          <span className="testo-dashboard-eyebrow">{t('dashboard.unifiedAccountBadge')}</span>
          <h1>{title}</h1>
          <p>{t('dashboard.heroDescription')}</p>
        </div>
        <div className="testo-dashboard-actions">
          <Link href="/admin/exams/create" className="testo-dashboard-action testo-dashboard-action-light"><WorkspaceIcon name="exams" />{t('dashboard.createExam')}</Link>
          <Link href="/admin/groups" className="testo-dashboard-action testo-dashboard-action-outline"><WorkspaceIcon name="groups" />{t('dashboard.createGroup')}</Link>
          <Link href="/student/join-group" className="testo-dashboard-action testo-dashboard-action-outline"><WorkspaceIcon name="groups" />{t('dashboard.joinGroup')}</Link>
        </div>
      </section>

      <section className="testo-dashboard-section" aria-labelledby="courses-not-ready-title">
        <header className="testo-dashboard-section-heading">
          <h2 id="courses-not-ready-title"><WorkspaceIcon name="courses" size={20} className="testo-dashboard-section-icon" />{t('dashboard.continueLearning')}</h2>
        </header>
        <DashboardEmptyState icon="courses">{t('dashboard.coursesNotReady')}</DashboardEmptyState>
      </section>

      <section className="testo-dashboard-section" aria-labelledby="my-groups-title">
        <header className="testo-dashboard-section-heading">
          <h2 id="my-groups-title"><WorkspaceIcon name="groups" size={20} className="testo-dashboard-section-icon" />{t('dashboard.groupsOverview')}</h2>
          <Link href="/admin/groups">{t('dashboard.viewAll')}</Link>
        </header>
        <div className="testo-dashboard-groups-grid">
          <section className="testo-dashboard-group-panel" aria-labelledby="managed-groups-heading">
            <header className="testo-dashboard-group-panel-heading">
              <div><span className="inline-flex items-center rounded-full border border-border bg-neutral-chip-bg px-2 py-1 text-[10px] font-bold tracking-wide text-neutral-chip-text uppercase">{t('dashboard.teachingSection')}</span><h3 id="managed-groups-heading">{t('dashboard.managedGroups')}</h3></div>
              <span className="testo-dashboard-count testo-dashboard-count-managed">{groups.length}</span>
            </header>
            {sectionErrors.ownedGroups ? <p className="testo-dashboard-empty-state" role="alert">{t('dashboard.sectionLoadError')}</p> : groups.length > 0 ? <div className="testo-dashboard-group-rows">
              {groups.slice(0, 4).map((group) => <Link key={group.id} href={`/admin/groups/${group.id}`} className="testo-dashboard-group-row">
                <span className="testo-dashboard-group-copy"><strong><SafeText value={group.name} /></strong><small>{t('dashboard.managedGroupLabel')}</small></span>
                <span className="testo-dashboard-role-tag">{t('dashboard.youManage')}</span>
              </Link>)}
            </div> : <DashboardEmptyState icon="groups" action={{ href: '/admin/groups', label: t('dashboard.createGroup') }}>{t('dashboard.noManagedGroups')}</DashboardEmptyState>}
          </section>
          <section className="testo-dashboard-group-panel" aria-labelledby="joined-groups-heading">
            <header className="testo-dashboard-group-panel-heading">
              <div><span className="inline-flex items-center rounded-full border border-border bg-neutral-chip-bg px-2 py-1 text-[10px] font-bold tracking-wide text-neutral-chip-text uppercase">{t('dashboard.learningSection')}</span><h3 id="joined-groups-heading">{t('dashboard.joinedGroups')}</h3></div>
              <span className="testo-dashboard-count testo-dashboard-count-muted">{joinedGroups.length}</span>
            </header>
            {sectionErrors.joinedGroups ? <p className="testo-dashboard-empty-state" role="alert">{t('dashboard.sectionLoadError')}</p> : joinedGroups.length > 0 ? <div className="testo-dashboard-group-rows">
              {joinedGroups.slice(0, 4).map((group) => <article key={group.group_id} className="testo-dashboard-group-row">
                <span className="testo-dashboard-group-copy"><strong><SafeText value={group.group_name} /></strong><small>{t('dashboard.joinedGroupLabel')}</small></span>
                <span className="rounded-sm bg-neutral-chip-bg px-2.5 py-1.5 text-[10px] font-bold text-neutral-chip-text">{t('dashboard.member')}</span>
              </article>)}
            </div> : <DashboardEmptyState icon="groups" action={{ href: '/student/join-group', label: t('dashboard.joinGroup') }}>{t('dashboard.noJoinedGroups')}</DashboardEmptyState>}
          </section>
        </div>
      </section>

      <section className="testo-dashboard-section" aria-labelledby="dashboard-exams-title">
        <header className="testo-dashboard-section-heading">
          <h2 id="dashboard-exams-title"><WorkspaceIcon name="exams" size={20} className="testo-dashboard-section-icon" />{t('dashboard.examsSection')}</h2>
        </header>
        <Card className="testo-dashboard-exams">
          {sectionErrors.exams ? <p className="testo-dashboard-empty-state" role="alert">{t('dashboard.sectionLoadError')}</p> : sortedExams.length > 0 ? <ul>
            {sortedExams.slice(0, 5).map((exam) => {
              const today = new Date(now)
              const examDay = new Date(exam.start_time)
              const todayKey = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
              const examDayKey = new Date(examDay.getFullYear(), examDay.getMonth(), examDay.getDate()).getTime()
              const dayOffset = Math.round((examDayKey - todayKey) / (24 * 60 * 60 * 1000))
              const dateStatus = dayOffset < 0 ? 'past' : dayOffset < 2 ? 'urgent' : 'upcoming'
              return <li key={exam.id}>
              <div><strong><SafeText value={exam.title} /></strong><small>{exam.is_published === false ? t('admin.exams.draft') : t('admin.exams.starts')} · {formatDate(exam.start_time, true)} · {exam.duration_minutes} {t('admin.exams.minutes')}</small></div>
              <span className={`testo-dashboard-exam-date is-${dateStatus}`}><WorkspaceIcon name="calendar" />{formatDate(exam.start_time)}</span>
            </li>})}
          </ul> : <DashboardEmptyState icon="exams" action={{ href: '/admin/exams/create', label: t('dashboard.createExam') }}>{t('dashboard.noUpcomingExams')}</DashboardEmptyState>}
        </Card>
      </section>
    </main>
  </WorkspaceLayout>
}
