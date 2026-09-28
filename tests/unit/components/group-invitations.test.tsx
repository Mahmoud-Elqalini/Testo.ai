import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../../../src/lib/i18n/provider'

const invitations = vi.hoisted(() => ({
  create: vi.fn(),
  status: vi.fn(),
  rotate: vi.fn(),
  revoke: vi.fn(),
  redeem: vi.fn(),
}))

vi.mock('../../../src/lib/services/group-invitation-service', () => ({
  createGroupInvitation: invitations.create,
  getGroupInvitationStatus: invitations.status,
  rotateGroupInvitation: invitations.rotate,
  revokeGroupInvitation: invitations.revoke,
  redeemGroupInvitation: invitations.redeem,
}))

import GroupInvitation from '../../../src/components/admin/GroupInvitation'
import JoinGroupForm from '../../../src/components/student/JoinGroupForm'

const groupId = '6f2f0b7c-1994-4f9a-9f14-9f23acb2802d'
const expiresAt = '2026-10-28T12:00:00.000Z'

function renderWithI18n(element: ReactNode) {
  return render(<I18nProvider initialLanguage="en">{element}</I18nProvider>)
}

describe('group invitation components', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('lets an admin create and display a code only for the current operation', async () => {
    invitations.status.mockResolvedValue({ data: { exists: false, created_at: null, expires_at: null, revoked_at: null }, error: null })
    invitations.create.mockResolvedValue({ data: { code: 'ab'.repeat(16), expires_at: expiresAt }, error: null })
    const firstRender = renderWithI18n(<GroupInvitation groupId={groupId} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Create invitation code' }))
    expect(await screen.findByText('ab'.repeat(16))).toBeInTheDocument()
    expect(invitations.create).toHaveBeenCalledWith(groupId)
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    fireEvent.click(screen.getByRole('button', { name: 'Copy code' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('ab'.repeat(16)))
    expect(await screen.findByText('Code copied.')).toBeInTheDocument()

    firstRender.unmount()
    renderWithI18n(<GroupInvitation groupId={groupId} />)
    await waitFor(() => expect(invitations.status).toHaveBeenCalled())
    expect(screen.queryByText('ab'.repeat(16))).not.toBeInTheDocument()
  }, 15_000)

  it('rotates and revokes the active code only after confirmation', async () => {
    invitations.status.mockResolvedValue({
      data: { exists: true, created_at: expiresAt, expires_at: '2026-11-28T12:00:00.000Z', revoked_at: null }, error: null,
    })
    invitations.rotate.mockResolvedValue({ data: { code: 'cd'.repeat(16), expires_at: expiresAt }, error: null })
    invitations.revoke.mockResolvedValue({ data: true, error: null })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderWithI18n(<GroupInvitation groupId={groupId} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Rotate code' }))
    expect(await screen.findByText('cd'.repeat(16))).toBeInTheDocument()
    expect(invitations.rotate).toHaveBeenCalledWith(groupId)
    fireEvent.click(screen.getByRole('button', { name: 'Revoke code' }))
    await waitFor(() => expect(invitations.revoke).toHaveBeenCalledWith(groupId))
  }, 15_000)

  it('shows a generic failure and success for student redemption', async () => {
    invitations.redeem.mockResolvedValueOnce({ data: false, error: null }).mockResolvedValueOnce({ data: true, error: null })
    renderWithI18n(<JoinGroupForm />)
    const codeInput = await screen.findByLabelText('Invitation code')
    fireEvent.change(codeInput, { target: { value: 'not-a-real-code' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join group' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This code is invalid or no longer available.')
    expect(invitations.redeem).toHaveBeenCalledWith('not-a-real-code')

    fireEvent.change(codeInput, { target: { value: 'ab'.repeat(16) } })
    fireEvent.click(screen.getByRole('button', { name: 'Join group' }))
    expect(await screen.findByRole('status')).toHaveTextContent('You joined the group successfully.')
    expect(codeInput).toHaveValue('')
  }, 15_000)
})
