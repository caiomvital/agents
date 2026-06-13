import { useState } from 'react'
import Dashboard from './pages/Dashboard'
import Exercise from './pages/Exercise'
import Stuck from './pages/Stuck'
import Alert from './pages/Alert'
import BottomNav from './components/BottomNav'

const pages = {
  dashboard: Dashboard,
  exercise: Exercise,
  stuck: Stuck,
  alert: Alert,
}

export default function App() {
  const [page, setPage] = useState('dashboard')

  const Page = pages[page]

  return (
    <div className="min-h-screen bg-[#E8EAF6] flex justify-center items-start">
      <div className="w-full max-w-[390px] bg-white relative min-h-screen flex flex-col shadow-2xl">
        <main className="flex-1 overflow-y-auto pb-20 no-scrollbar">
          <Page onNavigate={setPage} />
        </main>
        <BottomNav current={page} onNavigate={setPage} />
      </div>
    </div>
  )
}
