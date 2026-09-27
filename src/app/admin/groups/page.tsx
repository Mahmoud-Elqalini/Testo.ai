'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/i18n/use-translation'
import { createGroup, listAdminGroups } from '@/lib/services/group-service'
import type { Group } from '@/lib/types'

export default function AdminGroupsPage() {
  const { t } = useTranslation()
  const [groups, setGroups] = useState<Group[]>([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function refresh() {
    const result = await listAdminGroups()
    if (result.error) setError(t('admin.groups.loadError'))
    else { setGroups(result.data ?? []); setError('') }
    setLoading(false)
  }

  useEffect(() => { void Promise.resolve().then(refresh) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const result = await createGroup({ name })
    if (result.error) setError(t('admin.groups.createError'))
    else { setName(''); await refresh() }
    setSaving(false)
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-3xl font-bold">{t('admin.groups.title')}</h1><p className="mt-2 text-neutral-600 dark:text-neutral-300">{t('admin.groups.description')}</p></div>
        <Link href="/admin"><Button variant="secondary">{t('common.back')}</Button></Link>
      </header>
      <Card className="p-5">
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => void submit(event)}>
          <label className="sr-only" htmlFor="group-name">{t('admin.groups.name')}</label>
          <Input id="group-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={t('admin.groups.name')} required maxLength={100} />
          <Button type="submit" loading={saving}>{t('admin.groups.create')}</Button>
        </form>
      </Card>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {loading && <p role="status">{t('common.loading')}</p>}
      {!loading && groups.length === 0 && <Card className="p-8 text-center text-neutral-600 dark:text-neutral-300">{t('admin.groups.empty')}</Card>}
      <ul className="grid gap-3">
        {groups.map((group) => <li key={group.id}>
          <Link href={`/admin/groups/${group.id}`} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
            <Card className="flex items-center justify-between gap-4 p-5 hover:border-primary-500">
              <span className="break-words font-semibold">{group.name}</span><span className="text-sm text-primary-700 dark:text-primary-300">{t('admin.groups.manage')}</span>
            </Card>
          </Link>
        </li>)}
      </ul>
    </main>
  )
}
