import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { StatusBar } from './StatusBar'

// Main 3-region shell per spec.md section 7: Sidebar (260px) + TopBar + StatusBar,
// with routed content filling the Main Content area in between.
export function AppShell(): JSX.Element {
  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <TopBar />
      <main className="lg:ml-sidebar-width mt-16 mb-8 w-full lg:w-[calc(100%-260px)] px-margin-mobile lg:px-gutter py-8 overflow-y-auto">
        <div className="max-w-container-max mx-auto">
          <Outlet />
        </div>
      </main>
      <StatusBar />
    </div>
  )
}
