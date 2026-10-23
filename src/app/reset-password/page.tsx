'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { resetPassword, updatePassword, getSession, SecureAuthContextError } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n/use-translation'
import { normalizeError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { createClient } from '@/lib/supabase/client'
import type { AuthChangeEvent, AuthError, Session } from '@supabase/supabase-js'

export default function ResetPasswordPage() {
  const [mode, setMode] = useState<'request' | 'confirm'>('request')
  
  // Request mode state
  const [email, setEmail] = useState('')
  const [requestSuccess, setRequestSuccess] = useState(false)
  
  // Confirm mode state
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  
  // Shared state
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const router = useRouter()
  const { t } = useTranslation()
  const supabase = createClient()

  // SECONDARY ROBUSTNESS FIX: Dual-check recovery session on mount + listener
  useEffect(() => {
    let mounted = true
    
    // Check initial session
    getSession().then((res: { data: { session: Session | null }; error: AuthError | null }) => {
      if (!mounted) return
      if (res.data?.session) {
        setMode('confirm')
      }
      setLoading(false)
    })

    // Listen for the specific PASSWORD_RECOVERY event
    const { data: authListener } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (!mounted) return
      if (event === 'PASSWORD_RECOVERY' || session) {
        setMode('confirm')
      }
    })

    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
    }
  }, [supabase.auth])

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)
    
    try {
      const { error: resetError } = await resetPassword(email)
      if (resetError) throw resetError
      setRequestSuccess(true)
    } catch (err) {
      setError(
        err instanceof SecureAuthContextError
          ? t('auth.secureContextRequired')
          : normalizeError(err).message,
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)
    
    if (newPassword !== confirmPassword) {
      setError(t('auth.passwordMismatch'))
      setIsSubmitting(false)
      return
    }

    try {
      const { error: updateError } = await updatePassword(newPassword)
      if (updateError) throw updateError
      
      router.push('/dashboard')
    } catch (err) {
      setError(normalizeError(err).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <AuthLayout title={t('auth.resetPassword')}><p className="auth-loading">{t('common.loading')}</p></AuthLayout>
    )
  }

  if (mode === 'confirm') {
    return (
      <AuthLayout title={t('auth.setNewPassword')}>
          <form onSubmit={handleConfirm}>
            <FormField
              id="newPassword"
              type="password"
              label={t('auth.newPassword')}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <FormField
              id="confirmPassword"
              type="password"
              label={t('auth.confirmPassword')}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            
            {error && <p role="alert" className="auth-message">{error}</p>}
            
            <Button type="submit" fullWidth loading={isSubmitting}>
              {t('auth.updatePasswordButton')}
            </Button>
          </form>
      </AuthLayout>
    )
  }

  if (requestSuccess) {
    return (
      <AuthLayout title={t('auth.resetPassword')} compact>
        <div className="auth-success text-center">
          <h2>{t('auth.resetSuccess')}</h2>
          <Link href="/login">
            <Button variant="secondary" fullWidth>{t('auth.backToLogin')}</Button>
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={t('auth.resetPassword')} description={t('auth.resetDescription')}>
        <form onSubmit={handleRequest}>
          <FormField
            id="email"
            type="email"
            label={t('auth.email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          
          {error && <p role="alert" className="auth-message">{error}</p>}
          
          <Button type="submit" fullWidth loading={isSubmitting}>
            {t('auth.resetButton')}
          </Button>
        </form>
        
        <div className="mt-5 flex justify-center text-sm">
          <Link href="/login" className="font-semibold">
            {t('auth.backToLogin')}
          </Link>
        </div>
    </AuthLayout>
  )
}
