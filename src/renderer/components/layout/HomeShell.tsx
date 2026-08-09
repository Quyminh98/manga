import { Outlet } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { useUiStore } from '@renderer/stores/useUiStore'
import { HomeSidebar } from './HomeSidebar'

// Project-less landing area: HomeSidebar (Projects / New Project / Settings
// tabs) + routed content. Mirrors AppShell's sidebar+content layout used
// once a project is open. Unlike AppShell there's no TopBar here (plan.md
// Phase 2 decision), so below `lg` this renders its own minimal strip
// carrying just the drawer toggle — otherwise there'd be no way to reach the
// off-canvas HomeSidebar (DESIGN.md Layout & Spacing > Responsive Behavior).
export function HomeShell(): JSX.Element {
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)

  return (
    <div className="min-h-screen flex">
      <HomeSidebar />
      <header className="lg:hidden fixed top-0 right-0 w-full h-14 bg-surface-charcoal/80 backdrop-blur-md border-b border-border-subtle z-40 flex items-center px-margin-mobile">
        <button
          type="button"
          onClick={toggleSidebar}
          className="text-text-secondary hover:text-text-primary transition-colors"
          title="Toggle sidebar"
        >
          <Menu size={20} />
        </button>
      </header>
      <main className="lg:ml-sidebar-width mt-14 lg:mt-0 mb-8 w-full lg:w-[calc(100%-260px)] px-margin-mobile lg:px-gutter py-8 overflow-y-auto">
        <div className="max-w-container-max mx-auto">
          <Outlet />
        </div>
      </main>
      <footer className="fixed bottom-0 right-0 w-full lg:w-[calc(100%-260px)] h-8 bg-surface-dim border-t border-border-subtle z-40 flex items-center px-margin-mobile lg:px-gutter">
        <div className="font-code-sm text-code-sm text-text-secondary">StoryPrompt Desktop v0.1.0</div>
      </footer>
    </div>
  )
}
