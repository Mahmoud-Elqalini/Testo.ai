'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { resetPassword, updatePassword, getSession } from '@/lib/auth'
import { useTranslation } from '@/lib/i18n/use-translation'
import { normalizeError } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { createClient } from '@/lib/supabase/client'

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
    getSession().then((res: any) => {
      if (!mounted) return
      if (res.data?.session) {
        setMode('confirm')
      }
      setLoading(false)
    })

    // Listen for the specific PASSWORD_RECOVERY event
    const { data: authListener } = supabase.auth.onAuthStateChange((event: string, session: any) => {
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
      setError(normalizeError(err).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)
    
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match") 
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
      <div className="flex min-h-screen items-center justify-center p-4">
        <p>{t('common.loading')}</p>
      </div>
    )
  }

  if (mode === 'confirm') {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md p-8">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold">{t('auth.setNewPassword')}</h1>
          </div>
          
          <form onSubmit={handleConfirm} className="space-y-4">
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
            
            {error && <p className="text-sm font-medium text-red-500">{error}</p>}
            
            <Button type="submit" fullWidth loading={isSubmitting}>
              {t('auth.updatePasswordButton')}
            </Button>
          </form>
        </Card>
      </div>
    )
  }

  if (requestSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 text-center">
          <h2 className="mb-4 text-xl font-bold text-green-600">{t('auth.resetSuccess')}</h2>
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
          <h1 className="text-2xl font-bold">{t('auth.resetPassword')}</h1>
          <p className="mt-2 text-sm text-neutral-500">{t('auth.resetDescription')}</p>
        </div>
        
        <form onSubmit={handleRequest} className="space-y-4">
          <FormField
            id="email"
            type="email"
            label={t('auth.email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          
          {error && <p className="text-sm font-medium text-red-500">{error}</p>}
          
          <Button type="submit" fullWidth loading={isSubmitting}>
            {t('auth.resetButton')}
          </Button>
        </form>
        
        <div className="mt-6 flex justify-center text-sm">
          <Link href="/login" className="font-semibold text-primary-600 hover:underline">
            {t('auth.backToLogin')}
          </Link>
        </div>
      </Card>
    </div>
  )
}
