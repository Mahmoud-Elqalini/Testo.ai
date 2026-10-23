'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { SecureAuthContextError, signUp } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n/use-translation'
import { useTheme } from '@/lib/theme/provider'
import { normalizeError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { AuthLayout } from '@/components/auth/AuthLayout'

export default function RegisterPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  
  const router = useRouter()
  const { t, language } = useTranslation()
  const { theme } = useTheme()

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    
    try {
      const { data, error: signUpError } = await signUp(email, password, {
        full_name: fullName,
        preferred_language: language,
        preferred_theme: theme,
      })
      
      if (signUpError) {
        throw signUpError
      }
      
      if (data.session) {
        router.push('/dashboard')
      } else {
        setSuccess(true)
      }
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

  if (success) {
    return (
      <AuthLayout title={t('auth.register')} compact>
        <div className="auth-success text-center">
          <h2>{t('auth.registerSuccess')}</h2>
          <Link href="/login">
            <Button variant="secondary" fullWidth>{t('auth.backToLogin')}</Button>
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={t('auth.register')} footer={<div>{t('auth.hasAccount')}<Link href="/login" className="font-semibold">{t('auth.login')}</Link></div>}>
        <form onSubmit={handleRegister}>
          <FormField
            id="fullName"
            type="text"
            label={t('auth.fullName')}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
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
          
          <Button type="submit" fullWidth loading={loading}>
            {t('auth.registerButton')}
          </Button>
        </form>
        
    </AuthLayout>
  )
}
