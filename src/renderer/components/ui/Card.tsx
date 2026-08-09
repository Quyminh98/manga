import type { HTMLAttributes } from 'react'

// DESIGN.md Components > Minimalist Cards: no shadows, 1px border-subtle,
// background one shade lighter than the page (surface-slate on surface-charcoal).
export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div
      className={`bg-surface-slate border border-border-subtle rounded-lg p-6 ${className}`}
      {...props}
    />
  )
}
