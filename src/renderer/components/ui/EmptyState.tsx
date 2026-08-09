import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center text-center border border-dashed border-border-subtle rounded-lg py-24 px-8">
      <div className="w-12 h-12 rounded-full bg-surface-slate border border-border-subtle flex items-center justify-center text-text-secondary mb-4">
        <Icon size={22} />
      </div>
      <h3 className="font-headline-sm text-headline-sm text-text-primary mb-2">{title}</h3>
      <p className="font-body-md text-body-md text-text-secondary max-w-md mb-6">{description}</p>
      {action}
    </div>
  )
}
