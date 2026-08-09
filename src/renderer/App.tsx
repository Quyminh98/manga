import { RouterProvider } from 'react-router-dom'
import { router } from '@renderer/router'

export function App(): JSX.Element {
  return <RouterProvider router={router} />
}
