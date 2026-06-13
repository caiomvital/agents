import { useState } from 'react'
import { Flame, Clock, Star, CheckCircle, ChevronRight } from 'lucide-react'
import { student, exercise } from '../data/mockData'

export default function Exercise() {
  const [answer, setAnswer] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e) {
    e.preventDefault()
    if (answer.trim().length < 3) return
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="animate-fade-in flex flex-col items-center justify-center min-h-screen px-6 text-center pb-24">
        <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mb-6">
          <CheckCircle size={40} className="text-emerald-500" />
        </div>
        <h2 className="text-slate-800 text-2xl font-bold mb-2">Boa, {student.firstName}!</h2>
        <p className="text-slate-500 text-base mb-6 leading-relaxed">
          Você praticou hoje. Isso faz diferença.
        </p>

        <div className="bg-orange-50 border border-orange-100 rounded-2xl px-6 py-4 flex items-center gap-3 mb-6">
          <Flame size={28} className="text-orange-500 flex-shrink-0" />
          <div className="text-left">
            <p className="text-orange-800 font-bold text-lg">{student.streak + 1} dias seguidos</p>
            <p className="text-orange-600 text-sm">Sequência de prática 🔥</p>
          </div>
        </div>

        <div className="w-full bg-white rounded-2xl border border-slate-100 p-4 shadow-sm mb-6">
          <p className="text-slate-500 text-sm mb-1">Sua resposta</p>
          <p className="text-slate-700 text-sm font-mono leading-relaxed whitespace-pre-wrap">{answer}</p>
        </div>

        <div className="w-full bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
          <p className="text-emerald-700 text-sm font-semibold mb-1">+ {exercise.points} pontos no módulo</p>
          <p className="text-emerald-600 text-xs">
            Continue praticando para manter sua sequência e acelerar seu aprendizado.
          </p>
        </div>

        <button
          onClick={() => { setAnswer(''); setSubmitted(false) }}
          className="mt-6 text-indigo-600 text-sm font-medium flex items-center gap-1 hover:text-indigo-700"
        >
          Fazer outro exercício <ChevronRight size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 px-5 pt-12 pb-6">
        <p className="text-indigo-200 text-sm font-medium mb-1">Exercício rápido</p>
        <h1 className="text-white text-xl font-bold mb-4">{exercise.title}</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1.5">
            <Flame size={14} className="text-orange-400" />
            <span className="text-white text-sm font-semibold">{student.streak} dias</span>
          </div>
          <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1.5">
            <Clock size={14} className="text-indigo-200" />
            <span className="text-white text-sm">{exercise.estimatedTime}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1.5">
            <Star size={14} className="text-yellow-400" />
            <span className="text-white text-sm">+{exercise.points} pts</span>
          </div>
        </div>
      </div>

      <div className="px-4 py-5 space-y-4 pb-24">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
              {exercise.badge}
            </span>
          </div>
          <p className="text-slate-700 text-sm leading-relaxed mb-4">{exercise.description}</p>
          <div className="bg-slate-900 rounded-xl p-4 mb-3">
            <p className="text-slate-400 text-xs mb-2 font-mono">// referência</p>
            <pre className="text-emerald-400 text-xs font-mono leading-relaxed whitespace-pre-wrap">{exercise.example}</pre>
          </div>
          <p className="text-slate-400 text-xs flex items-center gap-1.5">
            <span>💡</span>
            {exercise.tip}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
            <label className="block text-slate-700 text-sm font-semibold mb-2">Sua resposta</label>
            <textarea
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              placeholder="Escreva aqui seu algoritmo ou pseudocódigo..."
              rows={6}
              className="w-full text-sm font-mono text-slate-700 placeholder:text-slate-300 bg-slate-50 border border-slate-200 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={answer.trim().length < 3}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold py-4 rounded-2xl transition-all active:scale-[0.98] text-sm"
          >
            Enviar resposta
          </button>
        </form>
        <p className="text-center text-slate-400 text-xs">Não existe resposta errada — o objetivo é praticar.</p>
      </div>
    </div>
  )
}
