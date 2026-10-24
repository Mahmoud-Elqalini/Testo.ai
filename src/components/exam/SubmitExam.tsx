'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n/use-translation'

export default function SubmitExam({ disabled, loading, onSubmit }: { disabled: boolean; loading: boolean; onSubmit: () => Promise<void> }) {
  const { t } = useTranslation()
  const [confirming, setConfirming] = useState(false)
  if (confirming) return <div role="alertdialog" aria-labelledby="submit-title" aria-describedby="submit-description" className="space-y-3 rounded-lg border border-warning-border bg-warning-soft p-4 dark:border-warning-border dark:bg-warning-soft/40">
    <h2 id="submit-title" className="font-semibold">{t('student.exam.submitConfirmTitle')}</h2>
    <p id="submit-description" className="text-sm">{t('student.exam.submitConfirm')}</p>
    <div className="flex flex-wrap gap-2"><Button loading={loading} disabled={disabled} onClick={() => void onSubmit()}>{t('student.exam.confirmSubmit')}</Button><Button variant="secondary" onClick={() => setConfirming(false)} disabled={loading}>{t('common.cancel')}</Button></div>
  </div>
  return <Button disabled={disabled} onClick={() => setConfirming(true)}>{t('student.exam.submit')}</Button>
}
