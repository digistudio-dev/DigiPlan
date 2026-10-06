import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[0.8125rem] font-medium transition-[background-color,color,border-color,box-shadow,opacity] duration-150 select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-[15px] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover',
        secondary: 'bg-surface text-foreground border border-border shadow-sm hover:bg-surface-2 hover:border-border-strong',
        ghost: 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
        soft: 'bg-primary-soft text-primary-soft-foreground hover:brightness-95',
        danger: 'bg-danger text-white shadow-sm hover:brightness-110',
        'danger-ghost': 'text-danger hover:bg-danger-soft',
        link: 'text-primary hover:underline underline-offset-2 h-auto px-0'
      },
      size: {
        sm: 'h-7 px-2.5 text-xs',
        md: 'h-8 px-3',
        lg: 'h-9 px-4 text-sm',
        icon: 'size-8',
        'icon-sm': 'size-7'
      }
    },
    defaultVariants: { variant: 'secondary', size: 'md' }
  }
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : 'button'
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? <Loader2 className="animate-spin" /> : null}
        {children}
      </Comp>
    )
  }
)
Button.displayName = 'Button'

export { buttonVariants }
