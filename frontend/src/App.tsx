import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import DashboardPage from './pages/DashboardPage'
import MattersPage from './pages/MattersPage'
import SettingsPage from './pages/SettingsPage'

const queryClient = new QueryClient()

// Placeholder page - will be built in a subsequent task
function LoginPage() { return <div className="p-6"><h1 className="text-2xl font-bold">Login</h1></div> }

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/matters" element={<MattersPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
