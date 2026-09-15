import * as React from 'react'

export function Card({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white/80 dark:bg-neutral-900/80 text-neutral-950 dark:text-neutral-50 shadow-sm backdrop-blur-md ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
