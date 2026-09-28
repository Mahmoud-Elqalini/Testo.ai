'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useTranslation } from '@/lib/i18n/use-translation'
import {
  createGroupInvitation,
  getGroupInvitationStatus,
  revokeGroupInvitation,
  rotateGroupInvitation,
  type GroupInvitationIssue,
  type GroupInvitationStatus,
} from '@/lib/services/group-invitation-service'

export default function GroupInvitation({ groupId }: { groupId: string }) {
  const { language, t } = useTranslation()
  const [status, setStatus] = useState<GroupInvitationStatus | null>(null)
  const [statusFetchedAt, setStatusFetchedAt] = useState<number | null>(null)
  const [code, setCode] = useState<GroupInvitationIssue | null>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')
  const [messageIsSuccess, setMessageIsSuccess] = useState(false)
  const [copied, setCopied] = useState(false)

  const refreshStatus = useCallback(async () => {
    const result = await getGroupInvitationStatus(groupId)
    if (result.error || !result.data) {
      setStatus(null)
      setStatusFetchedAt(null)
      setMessage(t('admin.groups.invitation.loadError'))
    } else {
      setStatus(result.data)
      setStatusFetchedAt(Date.now())
    }
    setLoading(false)
  }, [groupId, t])

  useEffect(() => { void Promise.resolve().then(refreshStatus) }, [refreshStatus])

  const active = Boolean(status?.exists && !status.revoked_at && status.expires_at && statusFetchedAt !== null && Date.parse(status.expires_at) > statusFetchedAt)
  const revoked = Boolean(status?.exists && status.revoked_at)
  const expired = Boolean(status?.exists && !status.revoked_at && status.expires_at && statusFetchedAt !== null && Date.parse(status.expires_at) <= statusFetchedAt)

  async function issue(rotate: boolean) {
    if (rotate && !window.confirm(t('admin.groups.invitation.rotateConfirm'))) return
    setWorking(true)
    setMessage('')
    setMessageIsSuccess(false)
    setCode(null)
    setCopied(false)
    const result = rotate ? await rotateGroupInvitation(groupId) : await createGroupInvitation(groupId)
    if (result.error || !result.data) {
      setMessage(t('admin.groups.invitation.actionError'))
    } else {
      setCode(result.data)
      await refreshStatus()
      setMessage(t(rotate ? 'admin.groups.invitation.rotated' : 'admin.groups.invitation.created'))
      setMessageIsSuccess(true)
    }
    setWorking(false)
  }

  async function revoke() {
    if (!window.confirm(t('admin.groups.invitation.revokeConfirm'))) return
    setWorking(true)
    setMessage('')
    setMessageIsSuccess(false)
    setCode(null)
    const result = await revokeGroupInvitation(groupId)
    if (result.error || !result.data) {
      setMessage(t('admin.groups.invitation.actionError'))
    } else {
      await refreshStatus()
      setMessage(t('admin.groups.invitation.revoked'))
      setMessageIsSuccess(true)
    }
    setWorking(false)
  }

  async function copyCode() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code.code)
      setCopied(true)
    } catch {
      setMessageIsSuccess(false)
      setMessage(t('admin.groups.invitation.copyError'))
    }
  }

  if (loading) {
    return <Card className="p-5"><p role="status">{t('common.loading')}</p></Card>
  }

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-lg font-semibold">{t('admin.groups.invitation.title')}</h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{t('admin.groups.invitation.description')}</p>
      </div>

      {status?.exists && (
        <dl className="grid gap-2 rounded-lg bg-neutral-50 p-4 text-sm dark:bg-neutral-800 sm:grid-cols-2">
          <div>
            <dt className="font-medium">{t('admin.groups.invitation.status')}</dt>
            <dd className="mt-1">{active ? t('admin.groups.invitation.active') : revoked ? t('admin.groups.invitation.revokedStatus') : expired ? t('admin.groups.invitation.expired') : t('admin.groups.invitation.inactive')}</dd>
          </div>
          <div>
            <dt className="font-medium">{t('admin.groups.invitation.expires')}</dt>
            <dd className="mt-1">{status.expires_at ? new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(new Date(status.expires_at)) : t('admin.groups.invitation.notAvailable')}</dd>
          </div>
        </dl>
      )}

      {status && !status.exists ? (
        <Button type="button" loading={working} onClick={() => void issue(false)}>{t('admin.groups.invitation.create')}</Button>
      ) : status?.exists ? (
        <div className="flex flex-wrap gap-3">
          <Button type="button" loading={working} onClick={() => void issue(true)}>{t('admin.groups.invitation.rotate')}</Button>
          {!revoked && <Button type="button" variant="secondary" loading={working} onClick={() => void revoke()}>{t('admin.groups.invitation.revoke')}</Button>}
        </div>
      ) : <Button type="button" variant="secondary" loading={working} onClick={() => { setLoading(true); void refreshStatus() }}>{t('common.retry')}</Button>}

      {code && (
        <div className="space-y-3 rounded-lg border border-primary-300 p-4 dark:border-primary-700">
          <p className="text-sm font-medium">{t('admin.groups.invitation.shareOnce')}</p>
          <div className="flex flex-wrap items-center gap-3">
            <code dir="ltr" className="select-all break-all rounded bg-neutral-100 px-3 py-2 font-mono text-lg tracking-wider dark:bg-neutral-800">{code.code}</code>
            <Button type="button" variant="secondary" onClick={() => void copyCode()}>{t('admin.groups.invitation.copy')}</Button>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('admin.groups.invitation.expires')}: {new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(new Date(code.expires_at))}</p>
          {copied && <p role="status" className="text-sm text-green-700 dark:text-green-400">{t('admin.groups.invitation.copied')}</p>}
        </div>
      )}

      {message && <p role={messageIsSuccess ? 'status' : 'alert'} className={messageIsSuccess ? 'text-sm text-green-700 dark:text-green-400' : 'text-sm text-red-600 dark:text-red-400'}>{message}</p>}
    </Card>
  )
}
