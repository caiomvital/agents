import { Bell, ChevronRight, Calendar, Clock, MapPin, BookOpen, TrendingUp } from 'lucide-react'
import { student, moduleProgress, nextClass, studentStatus } from '../data/mockData'

const skillConfig = {
  done:    { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', icon: '✅', label: 'Concluído' },
  active:  { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   icon: '🟡', label: 'Em andamento' },
  pending: { bg: 'bg-slate-50',   border: 'border-slate-200',   text: 'text-slate-400',   icon: '⬜', label: 'Pendente' },
}

function SkillItem({ skill }) {
  const cfg = skillConfig[skill.status]
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${cfg.bg} ${cfg.border}`}>
      <span className="text-sm">{cfg.icon}</span>
      <span className={`text-sm font-medium ${cfg.text}`}>{skill.name}</span>
    </div>
  )
}

export default function Dashboard({ onNavigate }) {
  return (
    <div className="animate-fade-in">
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 px-5 pt-12 pb-8">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-indigo-200 text-sm font-medium mb-0.5">Fuctura</p>
            <h1 className="text-white text-2xl font-bold">Olá, {student.firstName} 👋</h1>
            <p className="text-indigo-200 text-sm mt-0.5">{student.course} · {student.cohort}</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
              <Bell size={20} className="text-white" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-400 rounded-full" />
            </button>
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <span className="text-white font-bold text-sm">{student.initials}</span>
            </div>
          </div>
        </div>

        <div className="bg-white/10 rounded-2xl p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-indigo-200 text-xs font-medium uppercase tracking-wide">{moduleProgress.name}</p>
              <p className="text-white font-semibold">{moduleProgress.subtitle}</p>
            </div>
            <div className="text-right">
              <span className="text-white text-2xl font-bold">{moduleProgress.progress}%</span>
              <p className="text-indigo-200 text-xs">concluído</p>
            </div>
          </div>
          <div className="w-full bg-white/20 rounded-full h-2">
            <div
              className="bg-white rounded-full h-2 transition-all duration-700"
              style={{ width: `${moduleProgress.progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="px-4 py-5 space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <TrendingUp size={16} className="text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-amber-800 text-sm font-semibold mb-1">Atenção</p>
              <p className="text-amber-700 text-sm leading-relaxed">{studentStatus.message}</p>
              <button
                onClick={() => onNavigate('stuck')}
                className="mt-3 inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-full transition-colors"
              >
                Recuperar conteúdo
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-slate-800 font-semibold text-sm">Competências do módulo</h2>
            <span className="text-xs text-slate-400">
              {moduleProgress.skills.filter(s => s.status === 'done').length}/{moduleProgress.skills.length}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {moduleProgress.skills.map(skill => (
              <SkillItem key={skill.name} skill={skill} />
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">
              <BookOpen size={14} className="text-indigo-600" />
            </div>
            <h2 className="text-slate-800 font-semibold text-sm">Próxima aula</h2>
          </div>
          <p className="text-slate-800 font-semibold mb-2">{nextClass.topic}</p>
          <div className="flex flex-wrap gap-2">
            <span className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded-lg">
              <Calendar size={12} className="text-indigo-500" />
              {nextClass.date}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded-lg">
              <Clock size={12} className="text-indigo-500" />
              {nextClass.time}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded-lg">
              <MapPin size={12} className="text-indigo-500" />
              {nextClass.location}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onNavigate('exercise')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl p-4 text-left transition-colors active:scale-95"
          >
            <span className="text-2xl">⚡</span>
            <p className="text-sm font-semibold mt-2">Praticar agora</p>
            <p className="text-indigo-200 text-xs mt-0.5">Exercício rápido</p>
          </button>
          <button
            onClick={() => onNavigate('stuck')}
            className="bg-white hover:bg-slate-50 border border-slate-100 text-slate-800 rounded-2xl p-4 text-left transition-colors shadow-sm active:scale-95"
          >
            <span className="text-2xl">❓</span>
            <p className="text-sm font-semibold mt-2">Estou travado</p>
            <p className="text-slate-400 text-xs mt-0.5">Peça ajuda</p>
          </button>
        </div>
      </div>
    </div>
  )
}
