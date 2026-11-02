import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@renderer/components/ui/Button'

// Settings is reached via the HomeSidebar "Settings" tab (or the project
// TopBar's gear icon) — nested under `/` in router.tsx so HomeSidebar stays
// visible instead of Settings taking over the full window. 4 tabs: General /
// API Keys / Prompts / Advanced.
const TABS = [
  { to: 'general', label: 'General' },
  { to: 'api-keys', label: 'API Keys' },
  { to: 'prompts', label: 'Prompts' },
  { to: 'advanced', label: 'Advanced' }
]

export function SettingsShell(): JSX.Element {
  const navigate = useNavigate()

  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="text-text-secondary hover:text-text-primary transition-colors"
              title="Back"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="font-headline-lg text-headline-lg text-text-primary">Settings</h1>
          </div>
          <p className="font-body-md text-body-md text-text-secondary ml-9">
            Configure your workspace, API keys (Vilao, DeepSeek, Gemini) and default prompts.
          </p>
        </div>
        <Button variant="primary" disabled>
          Save Changes
        </Button>
      </div>

      <div className="border-b border-border-subtle mb-6">
        <nav aria-label="Settings Tabs" className="flex gap-8">
          {TABS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                [
                  'pb-3 font-headline-sm text-headline-sm transition-colors border-b-2',
                  isActive
                    ? 'text-vilao-blue border-vilao-blue'
                    : 'text-text-secondary border-transparent hover:text-text-primary'
                ].join(' ')
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      <Outlet />
    </div>
  )
}
