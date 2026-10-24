import * as React from 'react'

export function Card({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-xl border border-border dark:border-border bg-white/80 dark:bg-surface/80 text-text dark:text-on-primary shadow-sm backdrop-blur-md ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
