import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
  Captions,
  Users,
  Image,
  Activity,
  FolderOutput
} from 'lucide-react'
import { useUiStore } from '@renderer/stores/useUiStore'

// Sidebar nav items per spec.md section 7/8 — Overview, Transcript, SRT,
// Characters, Image Prompts, Processing, Export. Settings is intentionally
// not part of this list (spec.md 9: "Settings là màn riêng"). Paths are
// relative to the parent `/projects/:projectId` route (router.tsx).
const NAV_ITEMS = [
  { to: 'overview', label: 'Overview', icon: LayoutDashboard },
  { to: 'transcript', label: 'Transcript', icon: FileText },
  { to: 'srt', label: 'SRT', icon: Captions },
  { to: 'characters', label: 'Characters', icon: Users },
  { to: 'image-prompts', label: 'Image Prompts', icon: Image },
  { to: 'processing', label: 'Processing', icon: Activity },
  { to: 'export', label: 'Export', icon: FolderOutput }
]

// DESIGN.md Layout & Spacing > Responsive Behavior: below `lg` this becomes a
// hidden drawer (slid off-canvas via -translate-x-full, `lg:translate-x-0`
// always forces it back on-screen at desktop widths) with a click-to-dismiss
// backdrop, opened via the hamburger button AppShell renders in TopBar.
export function Sidebar(): JSX.Element {
  const isSidebarOpen = useUiStore((state) => state.isSidebarOpen)
  const closeSidebar = useUiStore((state) => state.closeSidebar)

  return (
    <>
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={closeSidebar} aria-hidden="true" />
      )}
      <nav
        className={[
          'fixed left-0 top-0 h-full w-sidebar-width bg-surface-slate border-r border-border-subtle z-50 flex flex-col py-6 transition-transform duration-200 lg:translate-x-0',
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        ].join(' ')}
      >
        <div className="px-gutter mb-8">
          <h1 className="font-headline-md text-headline-md text-text-primary">StoryPrompt</h1>
          <p className="font-label-caps text-label-caps text-text-secondary mt-1">AI STRATEGIST</p>
        </div>

        <div className="px-4 mb-2">
          <span className="font-label-caps text-label-caps text-text-secondary px-4">PROJECT</span>
        </div>
        <div className="flex-1 overflow-y-auto px-4 space-y-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={closeSidebar}
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 px-4 py-2 rounded transition-colors duration-200 font-body-md text-body-md',
                  isActive
                    ? 'text-vilao-blue border-l-2 border-vilao-blue bg-surface-charcoal/50'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-charcoal/30 border-l-2 border-transparent'
                ].join(' ')
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  )
}
