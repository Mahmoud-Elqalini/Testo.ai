'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/i18n/use-translation'
import { listAdminGroups, searchStudentsByEmail } from '@/lib/services/group-service'
import { grantExamGroupAccess, grantExamStudentAccess, listExamPermissions, revokeExamPermission, type ExamPermissionDetails } from '@/lib/services/exam-permissions-service'
import type { Group } from '@/lib/types'

export function ExamPermissions({ examId, onPermissionsChanged }: { examId: string; onPermissionsChanged?: () => void | Promise<void> }) {
  const { t } = useTranslation()
  const [groups, setGroups] = useState<Group[]>([])
  const [permissions, setPermissions] = useState<ExamPermissionDetails[]>([])
  const [email, setEmail] = useState('')
  const [groupId, setGroupId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function refresh() {
    const [groupResult, permissionResult] = await Promise.all([listAdminGroups(), listExamPermissions(examId)])
    if (groupResult.error || permissionResult.error) setMessage(t('admin.permissions.loadError'))
    else { setGroups(groupResult.data ?? []); setPermissions(permissionResult.data ?? []); setMessage('') }
  }
  useEffect(() => { void Promise.resolve().then(refresh) }, [examId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function grantStudent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('')
    const result = await searchStudentsByEmail(email)
    if (result.error) setMessage(t('admin.permissions.searchError'))
    else if (!result.data?.length) setMessage(t('admin.permissions.noStudent'))
    else {
      const grant = await grantExamStudentAccess(examId, result.data[0].id)
      if (grant.error) setMessage(t('admin.permissions.changeError'))
      else { setEmail(''); setMessage(t('admin.permissions.studentGranted')); await refresh(); await onPermissionsChanged?.() }
    }
    setBusy(false)
  }

  async function grantGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('')
    const result = await grantExamGroupAccess(examId, groupId)
    if (result.error) setMessage(t('admin.permissions.changeError'))
    else { setMessage(t('admin.permissions.groupGranted')); await refresh(); await onPermissionsChanged?.() }
    setBusy(false)
  }

  async function revoke(permission: ExamPermissionDetails) {
    setBusy(true); setMessage('')
    const result = await revokeExamPermission(examId, permission.student_id ? { studentId: permission.student_id } : { groupId: permission.group_id! })
    if (result.error) setMessage(t('admin.permissions.changeError'))
    else { setMessage(t('admin.permissions.removed')); await refresh(); await onPermissionsChanged?.() }
    setBusy(false)
  }

  return (
    <Card className="w-full space-y-5 p-5">
      <div><h2 className="text-lg font-semibold">{t('admin.permissions.title')}</h2><p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{t('admin.permissions.description')}</p></div>
      <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => void grantStudent(event)}>
        <label className="sr-only" htmlFor="permission-email">{t('admin.permissions.email')}</label>
        <Input id="permission-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t('admin.permissions.email')} required />
        <Button type="submit" loading={busy}>{t('admin.permissions.grantStudent')}</Button>
      </form>
      <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => void grantGroup(event)}>
        <label className="sr-only" htmlFor="permission-group">{t('admin.permissions.chooseGroup')}</label>
        <select id="permission-group" value={groupId} onChange={(event) => setGroupId(event.target.value)} required className="h-10 min-w-0 flex-1 rounded-md border border-neutral-300 bg-transparent px-3 text-sm dark:border-neutral-700">
          <option value="">{t('admin.permissions.chooseGroup')}</option>
          {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
        <Button type="submit" loading={busy} disabled={!groups.length}>{t('admin.permissions.grantGroup')}</Button>
      </form>
      {message && <p role="status" className="text-sm text-neutral-700 dark:text-neutral-200">{message}</p>}
      <div className="space-y-2">
        <h3 className="font-semibold">{t('admin.permissions.current')}</h3>
        {permissions.length === 0 ? <p className="text-sm text-amber-800 dark:text-amber-200">{t('admin.permissions.empty')}</p> :
          <ul className="space-y-2">{permissions.map((permission) => {
            const label = permission.student_id
              ? `${t('admin.permissions.student')} · ${permission.student_name || permission.student_email}`
              : `${t('admin.permissions.group')} · ${groups.find(({ id }) => id === permission.group_id)?.name ?? permission.group_name}`
            return <li key={permission.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-neutral-50 px-3 py-2 text-sm dark:bg-neutral-800"><span className="break-all">{label}</span><Button type="button" variant="ghost" loading={busy} onClick={() => void revoke(permission)}>{t('admin.permissions.remove')}</Button></li>
          })}</ul>}
      </div>
    </Card>
  )
}
