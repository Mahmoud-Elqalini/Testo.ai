'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import GroupInvitation from '@/components/admin/GroupInvitation'
import { useTranslation } from '@/lib/i18n/use-translation'
import { getGroup, listGroupStudents, removeStudentFromGroup, type GroupStudent } from '@/lib/services/group-service'
import type { Group } from '@/lib/types'

export default function AdminGroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const { t } = useTranslation()
  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<GroupStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState('')

  async function refresh() {
    const [groupResult, memberResult] = await Promise.all([getGroup(groupId), listGroupStudents(groupId)])
    if (groupResult.error || !groupResult.data || memberResult.error) setMessage(t('admin.groups.loadError'))
    else { setGroup(groupResult.data); setMembers(memberResult.data ?? []); setMessage('') }
    setLoading(false)
  }

  useEffect(() => { void Promise.resolve().then(refresh) }, [groupId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function remove(memberId: string) {
    setWorking(true); setMessage('')
    const result = await removeStudentFromGroup(groupId, memberId)
    if (result.error) setMessage(t('admin.groups.memberChangeError'))
    else await refresh()
    setWorking(false)
  }

  if (loading) return <main className="mx-auto max-w-4xl px-4 py-10"><p role="status">{t('common.loading')}</p></main>
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><Link href="/admin/groups" className="text-sm text-primary-text hover:underline dark:text-primary-text">{t('common.backArrow')} {t('admin.groups.title')}</Link><h1 className="mt-3 text-3xl font-bold">{group?.name ?? t('admin.groups.notFound')}</h1><p className="mt-2 text-muted dark:text-muted">{t('admin.groups.members')} ({members.length})</p></div>
        <Link href="/admin/groups"><Button variant="secondary">{t('common.back')}</Button></Link>
      </header>
      {message && <p role="alert" className="text-sm text-danger-text dark:text-danger-text">{message}</p>}
      {group && <GroupInvitation groupId={groupId} />}
      {members.length === 0 ? <Card className="p-8 text-center text-muted dark:text-muted">{t('admin.groups.noMembers')}</Card> :
        <ul className="grid gap-3">{members.map((member) => <li key={member.id}><Card className="flex flex-wrap items-center justify-between gap-3 p-4"><p><span className="font-medium">{member.full_name || member.email}</span><span className="ms-2 text-sm text-muted dark:text-muted">{member.email}</span></p><Button type="button" variant="ghost" loading={working} onClick={() => void remove(member.id)}>{t('admin.groups.remove')}</Button></Card></li>)}</ul>}
    </main>
  )
}
