import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const fieldBase =
  'w-full rounded-md border border-border bg-surface px-2.5 text-[0.8125rem] text-foreground shadow-sm transition-[border-color,box-shadow] duration-150 placeholder:text-subtle-foreground hover:border-border-strong focus:border-primary focus:outline-none focus:ring-3 focus:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/25'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leading?: ReactNode
  trailing?: ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, leading, trailing, ...props }, ref) => {
  if (!leading && !trailing) return <input ref={ref} className={cn(fieldBase, 'h-8', className)} {...props} />
  return (
    <div className="relative flex items-center">
      {leading ? (
        <span className="pointer-events-none absolute left-2.5 flex text-subtle-foreground [&_svg]:size-[15px]">{leading}</span>
      ) : null}
      <input ref={ref} className={cn(fieldBase, 'h-8', leading && 'pl-8', trailing && 'pr-12', className)} {...props} />
      {trailing ? <span className="absolute right-2.5 flex text-xs text-subtle-foreground">{trailing}</span> : null}
    </div>
  )
})
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(fieldBase, 'min-h-[72px] resize-y py-2 leading-relaxed', className)} {...props} />
)
Textarea.displayName = 'Textarea'

export const NativeSelect = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(fieldBase, 'h-8 cursor-pointer pr-7', className)} {...props}>
      {children}
    </select>
  )
)
NativeSelect.displayName = 'NativeSelect'

export function Label({ className, children, htmlFor, optional }: { className?: string; children: ReactNode; htmlFor?: string; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className={cn('mb-1.5 flex items-center gap-1 text-xs font-medium text-muted-foreground', className)}>
      {children}
      {optional ? <span className="font-normal text-subtle-foreground">(facultatif)</span> : null}
    </label>
  )
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  optional,
  className,
  children
}: {
  label?: ReactNode
  htmlFor?: string
  error?: string
  hint?: ReactNode
  optional?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('min-w-0', className)}>
      {label ? (
        <Label htmlFor={htmlFor} optional={optional}>
          {label}
        </Label>
      ) : null}
      {children}
      {error ? (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-subtle-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
