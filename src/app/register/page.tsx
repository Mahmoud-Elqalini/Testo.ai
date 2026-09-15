'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signUp } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n/use-translation'
import { useTheme } from '@/lib/theme/provider'
import { normalizeError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'

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
      setError(normalizeError(err).message)
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <h2 className="mb-4 text-xl font-bold text-green-600">{t('auth.registerSuccess')}</h2>
          <Link href="/login">
            <Button variant="secondary" fullWidth>{t('auth.backToLogin')}</Button>
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold">{t('auth.register')}</h1>
        </div>
        
        <form onSubmit={handleRegister} className="space-y-4">
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
          
          {error && <p className="text-sm font-medium text-red-500">{error}</p>}
          
          <Button type="submit" fullWidth loading={loading}>
            {t('auth.registerButton')}
          </Button>
        </form>
        
        <div className="mt-6 flex justify-center text-sm text-neutral-500">
          <div>
            {t('auth.hasAccount')}{' '}
            <Link href="/login" className="font-semibold text-primary-600 hover:underline">
              {t('auth.login')}
            </Link>
          </div>
        </div>
      </Card>
    </div>
  )
}
