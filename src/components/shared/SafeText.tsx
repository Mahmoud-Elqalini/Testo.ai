import { sanitizeText } from '../../lib/sanitize'

/** Render untrusted text as a React text node; never interpret it as HTML. */
export function SafeText({ value, className }: { value: string; className?: string }) {
  return <span className={className}>{sanitizeText(value)}</span>
}
