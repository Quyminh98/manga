import { createHashRouter, Navigate, type LoaderFunctionArgs } from 'react-router-dom'
import { appApi } from '@renderer/lib/appApi'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import { AppShell } from '@renderer/components/layout/AppShell'
import { HomeShell } from '@renderer/components/layout/HomeShell'
import { ProjectNotFound } from '@renderer/components/layout/ProjectNotFound'
import { ProjectsListPage } from '@renderer/features/home/ProjectsListPage'
import { NewProjectPage } from '@renderer/features/home/NewProjectPage'
import { QueuePage } from '@renderer/features/queue/QueuePage'
import { ChannelsPage } from '@renderer/features/channels/ChannelsPage'
import { NewChannelPage } from '@renderer/features/channels/NewChannelPage'
import { EditChannelPage } from '@renderer/features/channels/EditChannelPage'
import { OverviewPage } from '@renderer/features/overview/OverviewPage'
import { TranscriptPage } from '@renderer/features/transcript/TranscriptPage'
import { SrtPage } from '@renderer/features/srt/SrtPage'
import { CharactersPage } from '@renderer/features/characters/CharactersPage'
import { ImagePromptsPage } from '@renderer/features/imagePrompts/ImagePromptsPage'
import { ProcessingPage } from '@renderer/features/processing/ProcessingPage'
import { ApiCallsPage } from '@renderer/features/apiCalls/ApiCallsPage'
import { ExportPage } from '@renderer/features/export/ExportPage'
import { SettingsShell } from '@renderer/features/settings/SettingsShell'
import { GeneralSettingsPage } from '@renderer/features/settings/general/GeneralSettingsPage'
import { ApiKeysSettingsPage } from '@renderer/features/settings/apiKeys/ApiKeysSettingsPage'
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
      { path: 'queue', element: <QueuePage /> },
      { path: 'channels', element: <ChannelsPage /> },
      { path: 'channels/new', element: <NewChannelPage /> },
      { path: 'channels/:channelId/edit', element: <EditChannelPage /> },
      {
        path: 'settings',
        element: <SettingsShell />,
        children: [
          { index: true, element: <Navigate to="general" replace /> },
          { path: 'general', element: <GeneralSettingsPage /> },
          { path: 'api-keys', element: <ApiKeysSettingsPage /> },
          { path: 'vilao-api', element: <Navigate to="../api-keys" replace /> },
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
      { path: 'api-calls', element: <ApiCallsPage /> },
      { path: 'export', element: <ExportPage /> }
    ]
  }
])
