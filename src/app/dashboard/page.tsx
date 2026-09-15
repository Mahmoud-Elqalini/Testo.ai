'use client'

import { useRouter } from 'next/navigation'
import { signOut } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n/use-translation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function DashboardPage() {
  const router = useRouter()
  const { t } = useTranslation()

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
        
        <Button onClick={handleLogout} variant="secondary" fullWidth>
          {t('dashboard.logout')}
        </Button>
      </Card>
    </div>
  )
}
