/**
 * Normalize user-authored plain text and strip non-printing control characters.
 * Render the result as a React text child; never pass user content to
 * dangerouslySetInnerHTML or use it as an executable HTML fragment.
 */
export function sanitizeText(value: string): string {
  return value
    .normalize('NFC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
}
