import { createHashRouter, Navigate, type LoaderFunctionArgs } from 'react-router-dom'
import { appApi } from '@renderer/lib/appApi'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import { AppShell } from '@renderer/components/layout/AppShell'
import { HomeShell } from '@renderer/components/layout/HomeShell'
import { ProjectNotFound } from '@renderer/components/layout/ProjectNotFound'
import { ProjectsListPage } from '@renderer/features/home/ProjectsListPage'
import { NewProjectPage } from '@renderer/features/home/NewProjectPage'
import { OverviewPage } from '@renderer/features/overview/OverviewPage'
import { TranscriptPage } from '@renderer/features/transcript/TranscriptPage'
import { SrtPage } from '@renderer/features/srt/SrtPage'
import { CharactersPage } from '@renderer/features/characters/CharactersPage'
import { ImagePromptsPage } from '@renderer/features/imagePrompts/ImagePromptsPage'
import { ProcessingPage } from '@renderer/features/processing/ProcessingPage'
import { ExportPage } from '@renderer/features/export/ExportPage'
import { SettingsShell } from '@renderer/features/settings/SettingsShell'
import { GeneralSettingsPage } from '@renderer/features/settings/general/GeneralSettingsPage'
import { VilaoApiSettingsPage } from '@renderer/features/settings/vilaoApi/VilaoApiSettingsPage'
import { PromptsSettingsPage } from '@renderer/features/settings/prompts/PromptsSettingsPage'
import { AdvancedSettingsPage } from '@renderer/features/settings/advanced/AdvancedSettingsPage'

// Loads the project before AppShell/TopBar render and seeds useProjectStore
// synchronously (no null-currentProject flash on first paint).
async function projectLoader({ params }: LoaderFunctionArgs) {
  const projectId = params.projectId
  if (!projectId) throw new Response('Missing project id', { status: 400 })

  const project = await appApi.projects.open(projectId)
  if (!project) throw new Response('Project not found', { status: 404 })

  useProjectStore.setState({ currentProject: project })
  return project
}

// HashRouter: Electron loads the renderer from a local file:// URL in
// production, where History API routing has no server to fall back to.
export const router = createHashRouter([
  {
    path: '/',
    element: <HomeShell />,
    children: [
      { index: true, element: <ProjectsListPage /> },
      { path: 'new', element: <NewProjectPage /> },
      {
        path: 'settings',
        element: <SettingsShell />,
        children: [
          { index: true, element: <Navigate to="general" replace /> },
          { path: 'general', element: <GeneralSettingsPage /> },
          { path: 'vilao-api', element: <VilaoApiSettingsPage /> },
          { path: 'prompts', element: <PromptsSettingsPage /> },
          { path: 'advanced', element: <AdvancedSettingsPage /> }
        ]
      }
    ]
  },
  {
    path: '/projects/:projectId',
    element: <AppShell />,
    loader: projectLoader,
    errorElement: <ProjectNotFound />,
    children: [
      { index: true, element: <Navigate to="overview" replace /> },
      { path: 'overview', element: <OverviewPage /> },
      { path: 'transcript', element: <TranscriptPage /> },
      { path: 'srt', element: <SrtPage /> },
      { path: 'characters', element: <CharactersPage /> },
      { path: 'image-prompts', element: <ImagePromptsPage /> },
      { path: 'processing', element: <ProcessingPage /> },
      { path: 'export', element: <ExportPage /> }
    ]
  }
])
