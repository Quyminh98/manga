import type { ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

// DESIGN.md Elevation & Depth > Level 2 (Popovers/Modals): surface-slate,
// increased backdrop blur (20px ~= Tailwind's blur-xl), brighter border
// than the Level 1 border-subtle (outline-variant).
export function Modal({ open, onClose, title, children }: ModalProps): JSX.Element | null {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xl px-gutter"
      onClick={onClose}
    >
      <div
        className="bg-surface-slate border border-outline-variant rounded-xl w-full max-w-lg p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="font-headline-sm text-headline-sm text-text-primary mb-4">{title}</h3>
        {children}
      </div>
    </div>
  )
}
