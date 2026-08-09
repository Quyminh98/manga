import { NavLink } from 'react-router-dom'
import { FolderKanban, Plus, Settings as SettingsIcon } from 'lucide-react'
import { useUiStore } from '@renderer/stores/useUiStore'

// Sidebar for the Home shell (project-less context) — 3 tabs: the project
// list, the New Project form, and (global) Settings. Mirrors the visual
// style of components/layout/Sidebar.tsx (project-scoped) for consistency,
// per the Stitch "StoryPrompt - Dashboard" screen's left nav structure —
// "Library"/"Archive"/user-avatar rows from that mockup are dropped since
// spec.md has no such features in V1 (no accounts, no library/archive).
const NAV_ITEMS = [
  { to: '/', label: 'Projects', icon: FolderKanban, end: true },
  { to: '/new', label: 'New Project', icon: Plus, end: false },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, end: false }
]

// See Sidebar.tsx (project-scoped) for the same drawer pattern this mirrors.
export function HomeSidebar(): JSX.Element {
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
          <span className="font-label-caps text-label-caps text-text-secondary px-4">WORKSPACE</span>
        </div>
        <div className="flex-1 overflow-y-auto px-4 space-y-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
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
