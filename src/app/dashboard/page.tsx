'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { signOut } from '@/lib/auth'
import { createClient } from '@/lib/supabase/client'
import { useTranslation } from '@/lib/i18n/use-translation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { WorkspaceLayout } from '@/components/shared/WorkspaceLayout'
import type { UserRole } from '@/lib/types'

export default function DashboardPage() {
  const router = useRouter()
  const { t, language } = useTranslation()
  const [role, setRole] = useState<UserRole | null>(null)
  const [fullName, setFullName] = useState('')
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let active = true
    async function loadProfile() {
      const supabase = createClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        router.replace('/login')
        return
      }
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', user.id)
        .maybeSingle()
      if (!active) return
      if (error || !profile) {
        setLoadError(true)
        return
      }
      setRole(profile.role as UserRole)
      setFullName(profile.full_name ?? '')
    }
    void loadProfile()
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
  const primaryHref = isTeacher ? '/admin/exams/create' : '/student/join-group'
  const title = fullName
    ? t('dashboard.welcomeName').replace('{name}', fullName)
    : t('dashboard.welcome')

  return <WorkspaceLayout role={role} active="dashboard" dashboardHref="/dashboard">
    <main className="mx-auto w-full max-w-6xl space-y-7">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-[10px] font-bold tracking-[.14em] text-neutral-600 dark:text-neutral-300">
            {new Intl.DateTimeFormat(language, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()).toLocaleUpperCase(language)}
          </p>
          <h1 className="text-[27px] font-semibold leading-tight tracking-[-.04em] sm:text-[30px]">{title}</h1>
          <p className="mt-2 text-[13px] text-neutral-600 dark:text-neutral-300">{t('dashboard.intro')}</p>
        </div>
        <Button variant="secondary" onClick={handleLogout}>{t('dashboard.logout')}</Button>
      </header>

      <section aria-labelledby="dashboard-start-title" className="space-y-4">
        <div>
          <h2 id="dashboard-start-title" className="text-base font-semibold">{t('dashboard.startTitle')}</h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{t('dashboard.startDescription')}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {isTeacher ? <>
            <Link href="/admin/exams/create" className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
              <Card className="flex h-full min-h-36 items-center justify-between gap-4 border-primary-200 bg-primary-50/70 p-5 transition-colors group-hover:border-primary-400 dark:border-primary-900 dark:bg-primary-950/30">
                <div><span className="mb-3 grid size-10 place-items-center rounded-xl bg-white text-lg text-primary-700 shadow-sm dark:bg-neutral-900 dark:text-primary-300" aria-hidden="true">＋</span><h3 className="font-semibold">{t('dashboard.createExam')}</h3><p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{t('dashboard.createExamDescription')}</p></div>
                <span className="text-xl text-primary-700 dark:text-primary-300" aria-hidden="true">{language === 'ar' ? '←' : '→'}</span>
              </Card>
            </Link>
            <Link href="/admin/groups" className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
              <Card className="flex h-full min-h-36 items-center justify-between gap-4 p-5 transition-colors group-hover:border-primary-300">
                <div><span className="mb-3 grid size-10 place-items-center rounded-xl bg-primary-50 text-lg text-primary-700 dark:bg-primary-950 dark:text-primary-300" aria-hidden="true">♧</span><h3 className="font-semibold">{t('dashboard.createGroup')}</h3><p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{t('dashboard.createGroupDescription')}</p></div>
                <span className="text-xl text-primary-700 dark:text-primary-300" aria-hidden="true">{language === 'ar' ? '←' : '→'}</span>
              </Card>
            </Link>
          </> : <>
            <Link href="/student" className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
              <Card className="flex h-full min-h-36 items-center justify-between gap-4 border-primary-200 bg-primary-50/70 p-5 transition-colors group-hover:border-primary-400 dark:border-primary-900 dark:bg-primary-950/30">
                <div><span className="mb-3 grid size-10 place-items-center rounded-xl bg-white text-lg text-primary-700 shadow-sm dark:bg-neutral-900 dark:text-primary-300" aria-hidden="true">▤</span><h3 className="font-semibold">{t('dashboard.studentExams')}</h3><p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{t('dashboard.examsDescription')}</p></div>
                <span className="text-xl text-primary-700 dark:text-primary-300" aria-hidden="true">{language === 'ar' ? '←' : '→'}</span>
              </Card>
            </Link>
            <Link href="/student/join-group" className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
              <Card className="flex h-full min-h-36 items-center justify-between gap-4 p-5 transition-colors group-hover:border-primary-300">
                <div><span className="mb-3 grid size-10 place-items-center rounded-xl bg-primary-50 text-lg text-primary-700 dark:bg-primary-950 dark:text-primary-300" aria-hidden="true">♧</span><h3 className="font-semibold">{t('dashboard.joinGroup')}</h3><p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{t('dashboard.joinGroupDescription')}</p></div>
                <span className="text-xl text-primary-700 dark:text-primary-300" aria-hidden="true">{language === 'ar' ? '←' : '→'}</span>
              </Card>
            </Link>
          </>}
        </div>
      </section>

      <section aria-labelledby="dashboard-courses-title" className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="flex flex-col justify-between gap-5 p-6 sm:flex-row sm:items-center">
          <div className="max-w-xl">
            <span className="inline-flex rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700 dark:bg-primary-950 dark:text-primary-300">{t('dashboard.coursesComingSoon')}</span>
            <h2 id="dashboard-courses-title" className="mt-3 text-xl font-semibold">{t('dashboard.exploreCourses')}</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-300">{t('dashboard.coursesDescription')}</p>
          </div>
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary-50 text-2xl text-primary-700 dark:bg-primary-950 dark:text-primary-300" aria-hidden="true">▱</span>
        </Card>

        <Card className="flex flex-col justify-between gap-5 p-6">
          <div>
            <p className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">{isTeacher ? t('dashboard.teachingLabel') : t('dashboard.learningLabel')}</p>
            <h2 className="mt-2 text-lg font-semibold">{isTeacher ? t('dashboard.teachingTitle') : t('dashboard.learningTitle')}</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-300">{isTeacher ? t('dashboard.teachingDescription') : t('dashboard.learningDescription')}</p>
          </div>
          <Link href={primaryHref} className="text-sm font-semibold text-primary-700 hover:underline dark:text-primary-300">
            {isTeacher ? t('dashboard.manageWorkspace') : t('dashboard.studentExams')} {language === 'ar' ? '←' : '→'}
          </Link>
        </Card>
      </section>
    </main>
  </WorkspaceLayout>
}
