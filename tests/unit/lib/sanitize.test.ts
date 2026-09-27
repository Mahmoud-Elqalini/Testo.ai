import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { render } from '@testing-library/react'
import { sanitizeText } from '../../../src/lib/sanitize'
import { SafeText } from '../../../src/components/shared/SafeText'

describe('sanitizeText', () => {
  it('normalizes unicode and strips non-printing control characters', () => {
    expect(sanitizeText('Cafe\u0301\u0000\u0007\r\nQuestion')).toBe('Café\nQuestion')
  })

  it('preserves HTML-looking text as plain text for React text rendering', () => {
    const userText = '<img src=x onerror=alert(1)>'
    expect(sanitizeText(userText)).toBe(userText)

    const { container } = render(createElement(SafeText, { value: userText }))
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toBe(userText)
  })
})
