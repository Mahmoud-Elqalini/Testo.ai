'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from '@/lib/i18n/use-translation'

export default function CountdownTimer({ endsAt }: { endsAt: string }) {
  const { t } = useTranslation()
  const [seconds, setSeconds] = useState(() => Math.max(0, Math.floor((Date.parse(endsAt) - Date.now()) / 1000)))
  useEffect(() => {
    const update = () => setSeconds(Math.max(0, Math.floor((Date.parse(endsAt) - Date.now()) / 1000)))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [endsAt])
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainder = seconds % 60
  const urgent = seconds <= 300
  return <div role="timer" aria-live="off" className={`rounded-lg px-4 py-2 text-center font-mono text-lg font-bold tabular-nums ${urgent ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200' : 'bg-neutral-100 dark:bg-neutral-800'}`}>
    <span className="sr-only">{t('student.exam.timeRemaining')}: </span>{[hours, minutes, remainder].map((part) => String(part).padStart(2, '0')).join(':')}
  </div>
}
