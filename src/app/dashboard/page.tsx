'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { signOut } from '@/lib/auth'
import { createClient } from '@/lib/supabase/client'
import { useTranslation } from '@/lib/i18n/use-translation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function DashboardPage() {
  const router = useRouter()
  const { t } = useTranslation()
  const [isStudent, setIsStudent] = useState(false)

  useEffect(() => {
    let active = true
    async function loadRole() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
      if (active) setIsStudent(profile?.role === 'student')
    }
    void loadRole()
    return () => { active = false }
  }, [])

  const handleLogout = async () => {
    await signOut()
    router.push('/login')
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 text-center space-y-6">
        <h1 className="text-3xl font-bold text-primary-600">{t('dashboard.title')}</h1>
        <p className="text-lg">{t('dashboard.welcome')}</p>
        <p className="text-sm text-neutral-500">{t('dashboard.loggedIn')}</p>

        {isStudent && <Link href="/student/join-group" className="block rounded-md bg-[var(--color-primary-600)] px-4 py-3 font-medium text-white hover:bg-[var(--color-primary-700)]">{t('dashboard.joinGroup')}</Link>}
        
        <Button onClick={handleLogout} variant="secondary" fullWidth>
          {t('dashboard.logout')}
        </Button>
      </Card>
    </div>
  )
}
