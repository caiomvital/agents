import { Home, Zap, HelpCircle, AlertTriangle } from 'lucide-react'

const tabs = [
  { id: 'dashboard', label: 'Início',   Icon: Home },
  { id: 'exercise',  label: 'Praticar', Icon: Zap },
  { id: 'stuck',     label: 'Travei',   Icon: HelpCircle },
  { id: 'alert',     label: 'Gestor',   Icon: AlertTriangle },
]

export default function BottomNav({ current, onNavigate }) {
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-slate-100 z-50">
      <div className="flex">
        {tabs.map(({ id, label, Icon }) => {
          const active = current === id
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${
                active ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <Icon
                size={22}
                strokeWidth={active ? 2.5 : 1.8}
                className={active ? 'text-indigo-600' : ''}
              />
              <span className={`text-[10px] font-medium ${active ? 'text-indigo-600' : 'text-slate-400'}`}>
                {label}
              </span>
              {active && (
                <span className="absolute bottom-0 w-8 h-0.5 bg-indigo-600 rounded-t-full" />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
