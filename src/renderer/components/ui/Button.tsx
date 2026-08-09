import type { ButtonHTMLAttributes } from 'react'

// DESIGN.md Components > Buttons: Primary = solid vilao-blue; Ghost = border-subtle
// stroke, transitions to white text on hover. No "lift" on hover, per Elevation & Depth.
// "danger" isn't in DESIGN.md's Buttons spec, but reuses the already-defined
// error/on-error tokens for destructive confirms (delete project, etc.) —
// kept as its own variant branch (not a className override on "primary") so
// there's never two conflicting bg-* utilities on one element.
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps): JSX.Element {
  const base =
    'inline-flex items-center justify-center gap-2 rounded px-4 py-2 font-body-md text-body-md transition-colors disabled:opacity-60 disabled:cursor-not-allowed'
  const variants = {
    primary: 'bg-vilao-blue text-white hover:bg-vilao-blue/90',
    ghost: 'bg-transparent border border-border-subtle text-text-secondary hover:text-text-primary hover:border-vilao-blue',
    danger: 'bg-error text-on-error hover:bg-error/90'
  }

  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />
}
