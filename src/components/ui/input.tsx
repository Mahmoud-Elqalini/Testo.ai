import * as React from 'react'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', error, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={`flex h-10 w-full rounded-md border bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted dark:text-muted dark:placeholder:text-subtle focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${
          error 
            ? 'border-danger-border focus-visible:ring-danger-text'
            : 'border-border dark:border-border focus-visible:ring-[var(--color-primary)]'
        } ${className}`}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'
