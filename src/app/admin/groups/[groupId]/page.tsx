'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/i18n/use-translation'
import { addStudentToGroup, getGroup, listGroupStudents, removeStudentFromGroup, searchStudentsByEmail, type GroupStudent } from '@/lib/services/group-service'
import type { Group } from '@/lib/types'

export default function AdminGroupDetailPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const { t } = useTranslation()
  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<GroupStudent[]>([])
  const [email, setEmail] = useState('')
  const [match, setMatch] = useState<GroupStudent | null>(null)
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

  async function lookup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setWorking(true); setMessage(''); setMatch(null)
    const result = await searchStudentsByEmail(email)
    if (result.error) setMessage(t('admin.groups.searchError'))
    else if (!result.data?.length) setMessage(t('admin.groups.noStudent'))
    else if (members.some(({ id }) => id === result.data![0].id)) setMessage(t('admin.groups.alreadyMember'))
    else setMatch(result.data[0])
    setWorking(false)
  }

  async function add(student: GroupStudent) {
    setWorking(true); setMessage('')
    const result = await addStudentToGroup(groupId, student.id)
    if (result.error) setMessage(t('admin.groups.memberChangeError'))
    else { setEmail(''); setMatch(null); await refresh() }
    setWorking(false)
  }

  async function remove(studentId: string) {
    setWorking(true); setMessage('')
    const result = await removeStudentFromGroup(groupId, studentId)
    if (result.error) setMessage(t('admin.groups.memberChangeError'))
    else await refresh()
    setWorking(false)
  }

  if (loading) return <main className="mx-auto max-w-4xl px-4 py-10"><p role="status">{t('common.loading')}</p></main>
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><Link href="/admin/groups" className="text-sm text-primary-700 hover:underline dark:text-primary-300">← {t('admin.groups.title')}</Link><h1 className="mt-3 text-3xl font-bold">{group?.name ?? t('admin.groups.notFound')}</h1><p className="mt-2 text-neutral-600 dark:text-neutral-300">{t('admin.groups.members')} ({members.length})</p></div>
        <Link href="/admin/groups"><Button variant="secondary">{t('common.back')}</Button></Link>
      </header>
      <Card className="space-y-4 p-5">
        <h2 className="text-lg font-semibold">{t('admin.groups.addStudent')}</h2>
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => void lookup(event)}>
          <label htmlFor="student-email" className="sr-only">{t('admin.groups.email')}</label>
          <Input id="student-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t('admin.groups.email')} required />
          <Button type="submit" loading={working}>{t('admin.groups.search')}</Button>
        </form>
        {match && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-neutral-50 p-4 dark:bg-neutral-800"><p><span className="font-semibold">{match.full_name || match.email}</span><span className="ms-2 text-sm text-neutral-600 dark:text-neutral-300">{match.email}</span></p><Button type="button" loading={working} onClick={() => void add(match)}>{t('admin.groups.add')}</Button></div>}
        {message && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{message}</p>}
      </Card>
      {members.length === 0 ? <Card className="p-8 text-center text-neutral-600 dark:text-neutral-300">{t('admin.groups.noMembers')}</Card> :
        <ul className="grid gap-3">{members.map((member) => <li key={member.id}><Card className="flex flex-wrap items-center justify-between gap-3 p-4"><p><span className="font-medium">{member.full_name || member.email}</span><span className="ms-2 text-sm text-neutral-600 dark:text-neutral-300">{member.email}</span></p><Button type="button" variant="ghost" loading={working} onClick={() => void remove(member.id)}>{t('admin.groups.remove')}</Button></Card></li>)}</ul>}
    </main>
  )
}
