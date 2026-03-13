import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'

const queryClient = new QueryClient()

// Placeholder pages - will be built in subsequent tasks
function TodayPage() { return <div className="p-6"><h1 className="text-2xl font-bold">Today</h1></div> }
function ReviewPage() { return <div className="p-6"><h1 className="text-2xl font-bold">Review</h1></div> }
function MattersPage() { return <div className="p-6"><h1 className="text-2xl font-bold">Matters</h1></div> }
function ExportPage() { return <div className="p-6"><h1 className="text-2xl font-bold">Export</h1></div> }
function SettingsPage() { return <div className="p-6"><h1 className="text-2xl font-bold">Settings</h1></div> }
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
