import * as React from 'react'
import { Input, type InputProps } from './input'

interface FormFieldProps extends Omit<InputProps, 'id' | 'error'> {
  id: string
  label: string
  error?: string | false
}

export const FormField = React.forwardRef<HTMLInputElement, FormFieldProps>(
  ({ id, label, error, className = '', ...props }, ref) => {
    return (
      <div className={`space-y-2 ${className}`}>
        <label
          htmlFor={id}
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
        >
          {label}
        </label>
        <Input
          id={id}
          ref={ref}
          error={!!error}
          {...props}
        />
        {error && (
          <p className="text-sm font-medium text-red-500 dark:text-red-400">{error}</p>
        )}
      </div>
    )
  }
)
FormField.displayName = 'FormField'
