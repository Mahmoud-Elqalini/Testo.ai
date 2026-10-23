'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { SecureAuthContextError, signIn } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n/use-translation'
import { normalizeError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { AuthLayout } from '@/components/auth/AuthLayout'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const router = useRouter()
  const { t } = useTranslation()

  useEffect(() => {
    const timer = window.setTimeout(() => setHydrated(true), 0)
    return () => window.clearTimeout(timer)
  }, [])

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
      setError(
        err instanceof SecureAuthContextError
          ? t('auth.secureContextRequired')
          : normalizeError(err).message,
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title={t('auth.login')} footer={<div>{t('auth.noAccount')}<Link href="/register" className="font-semibold">{t('auth.register')}</Link></div>}>
        <form onSubmit={handleLogin}>
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
          
          {error && <p role="alert" className="auth-message">{error}</p>}
          
          <Button type="submit" fullWidth loading={loading} disabled={!hydrated}>
            {t('auth.loginButton')}
          </Button>
        </form>
        
        <div className="mt-5 flex justify-end text-sm">
          <Link href="/reset-password">
            {t('auth.forgotPassword')}
          </Link>
        </div>
    </AuthLayout>
  )
}
