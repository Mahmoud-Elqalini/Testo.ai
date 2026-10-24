'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/i18n/use-translation'
import { redeemGroupInvitation } from '@/lib/services/group-invitation-service'

export default function JoinGroupForm() {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [joined, setJoined] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setWorking(true)
    setMessage('')
    setJoined(false)
    const result = await redeemGroupInvitation(code.trim())
    if (result.error) {
      setMessage(t('student.joinGroup.error'))
    } else if (!result.data) {
      setMessage(t('student.joinGroup.invalidCode'))
    } else {
      setCode('')
      setJoined(true)
      setMessage(t('student.joinGroup.joined'))
    }
    setWorking(false)
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="group-invitation-code" className="block text-sm font-medium">{t('student.joinGroup.codeLabel')}</label>
        <Input
          id="group-invitation-code"
          name="invitationCode"
          type="text"
          dir="ltr"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={64}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder={t('student.joinGroup.codePlaceholder')}
          required
          aria-describedby="group-invitation-help"
        />
        <p id="group-invitation-help" className="text-sm text-muted dark:text-muted">{t('student.joinGroup.help')}</p>
      </div>
      <Button type="submit" loading={working} fullWidth>{t('student.joinGroup.submit')}</Button>
      {message && <p role={joined ? 'status' : 'alert'} className={joined ? 'text-sm text-success-text dark:text-success-text' : 'text-sm text-danger-text dark:text-danger-text'}>{message}</p>}
    </form>
  )
}
