import { useState } from 'react'
import { ChevronRight, ArrowLeft, Clock } from 'lucide-react'
import { stuckOptions, recoveryPlans } from '../data/mockData'

export default function Stuck() {
  const [selected, setSelected] = useState(null)
  const [showPlan, setShowPlan] = useState(false)

  if (showPlan && selected) {
    const plan = recoveryPlans[selected]
    return (
      <div className="animate-slide-up">
        <div className="bg-gradient-to-br from-indigo-600 to-violet-700 px-5 pt-12 pb-6">
          <button onClick={() => setShowPlan(false)} className="flex items-center gap-2 text-indigo-200 hover:text-white mb-4 transition-colors">
            <ArrowLeft size={16} />
            <span className="text-sm">Voltar</span>
          </button>
          <div className="text-3xl mb-2">{plan.icon}</div>
          <h1 className="text-white text-xl font-bold">{plan.title}</h1>
          <p className="text-indigo-200 text-sm mt-1 leading-relaxed">{plan.intro}</p>
        </div>
        <div className="px-4 py-5 pb-24 space-y-3">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 space-y-4">
            <h2 className="text-slate-700 font-semibold text-sm">Seu plano rápido</h2>
            {plan.steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-white text-xs font-bold">{i + 1}</span>
                </div>
                <div className="flex-1">
                  <p className="text-slate-800 text-sm font-medium">{step.action}</p>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-400 mt-0.5"><Clock size={10} />{step.time}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-indigo-50 rounded-2xl border border-indigo-100 p-4">
            <p className="text-indigo-700 text-sm font-medium leading-relaxed">{plan.footer}</p>
          </div>
          <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 rounded-2xl transition-colors text-sm active:scale-[0.98]">Começar agora</button>
          <button onClick={() => { setSelected(null); setShowPlan(false) }} className="w-full text-slate-500 text-sm py-2">Tenho outro problema</button>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 px-5 pt-12 pb-6">
        <p className="text-indigo-200 text-sm font-medium mb-1">Suporte rápido</p>
        <h1 className="text-white text-xl font-bold mb-1">Estou travado</h1>
        <p className="text-indigo-200 text-sm">Selecione o que está acontecendo e vamos resolver juntos.</p>
      </div>
      <div className="px-4 py-5 pb-24 space-y-3">
        <p className="text-slate-500 text-sm font-medium">Em que você travou?</p>
        <div className="space-y-2">
          {stuckOptions.map(opt => (
            <button
              key={opt.id}
              onClick={() => setSelected(opt.id)}
              className={`w-full flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left active:scale-[0.98] ${
                selected === opt.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-100 bg-white hover:border-slate-200'
              }`}
            >
              <span className="text-xl flex-shrink-0">{opt.icon}</span>
              <span className={`flex-1 text-sm font-medium ${selected === opt.id ? 'text-indigo-700' : 'text-slate-700'}`}>{opt.label}</span>
              {selected === opt.id && (
                <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
        {selected && (
          <button
            onClick={() => setShowPlan(true)}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all animate-slide-up active:scale-[0.98]"
          >
            Ver meu plano de recuperação <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
