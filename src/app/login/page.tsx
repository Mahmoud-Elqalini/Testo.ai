'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signIn } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n/use-translation'
import { normalizeError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const router = useRouter()
  const { t } = useTranslation()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    try {
      const { error: signInError } = await signIn(email, password)
      if (signInError) {
        throw signInError
      }
      
      router.push('/dashboard')
    } catch (err) {
      setError(normalizeError(err).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold">{t('auth.login')}</h1>
        </div>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <FormField
            id="email"
            type="email"
            label={t('auth.email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <FormField
            id="password"
            type="password"
            label={t('auth.password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          
          {error && <p className="text-sm font-medium text-red-500">{error}</p>}
          
          <Button type="submit" fullWidth loading={loading}>
            {t('auth.loginButton')}
          </Button>
        </form>
        
        <div className="mt-6 flex flex-col items-center space-y-2 text-sm text-neutral-500">
          <Link href="/reset-password" className="hover:text-primary-600 hover:underline">
            {t('auth.forgotPassword')}
          </Link>
          <div>
            {t('auth.noAccount')}{' '}
            <Link href="/register" className="font-semibold text-primary-600 hover:underline">
              {t('auth.register')}
            </Link>
          </div>
        </div>
      </Card>
    </div>
  )
}
