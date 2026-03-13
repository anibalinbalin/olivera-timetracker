import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import MattersPage from './pages/MattersPage'
import ExportPage from './pages/ExportPage'
import SettingsPage from './pages/SettingsPage'
import ReviewPage from './pages/ReviewPage'

const queryClient = new QueryClient()

// Placeholder pages - will be built in subsequent tasks
function TodayPage() { return <div className="p-6"><h1 className="text-2xl font-bold">Today</h1></div> }
function LoginPage() { return <div className="p-6"><h1 className="text-2xl font-bold">Login</h1></div> }

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<Layout />}>
            <Route path="/" element={<TodayPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/matters" element={<MattersPage />} />
            <Route path="/export" element={<ExportPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
