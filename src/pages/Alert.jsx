import { useState } from 'react'
import { AlertTriangle, MessageCircle, X } from 'lucide-react'
import { alertData } from '../data/mockData'

const severityConfig = {
  high:   { dot: 'bg-red-500',   badge: 'bg-red-50 text-red-700 border-red-100' },
  medium: { dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 border-amber-100' },
  low:    { dot: 'bg-slate-400', badge: 'bg-slate-50 text-slate-600 border-slate-100' },
}

function RiskGauge({ score }) {
  const clamp = Math.max(0, Math.min(100, score))
  const color = clamp >= 70 ? '#EF4444' : clamp >= 40 ? '#F59E0B' : '#10B981'
  const circumference = 2 * Math.PI * 36
  const offset = circumference - (clamp / 100) * circumference
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="36" fill="none" stroke="#F1F5F9" strokeWidth="8" />
          <circle cx="40" cy="40" r="36" fill="none" stroke={color} strokeWidth="8" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-slate-800">{score}</span>
          <span className="text-xs text-slate-400">risco</span>
        </div>
      </div>
      <p className="text-xs font-semibold mt-1" style={{ color }}>{score >= 70 ? 'ALTO' : score >= 40 ? 'MÉDIO' : 'BAIXO'}</p>
    </div>
  )
}

function WhatsAppPreview({ message, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end justify-center">
      <div className="w-full max-w-md bg-white rounded-t-3xl animate-slide-up">
        <div className="bg-emerald-600 px-4 pt-5 pb-4 flex items-center gap-3 rounded-t-3xl">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">CE</span>
          </div>
          <div className="flex-1">
            <p className="text-white font-semibold text-sm">Carlos Eduardo</p>
            <p className="text-emerald-200 text-xs">via WhatsApp</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 transition-colors">
            <X size={18} className="text-white" />
          </button>
        </div>
        <div className="bg-[#E5DDD5] px-4 py-5">
          <div className="bg-white rounded-2xl rounded-tl-sm p-4 shadow-sm max-w-[85%]">
            <p className="text-slate-800 text-sm leading-relaxed whitespace-pre-wrap">{message}</p>
            <p className="text-slate-400 text-xs mt-2 text-right">Enviado · ✓✓</p>
          </div>
        </div>
        <div className="p-4 bg-white">
          <button onClick={onClose} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-4 rounded-2xl text-sm flex items-center justify-center gap-2 transition-colors">
            <MessageCircle size={16} />
            Enviar mensagem
          </button>
          <p className="text-slate-400 text-xs text-center mt-2">Protótipo — nenhuma mensagem será enviada de verdade.</p>
        </div>
      </div>
    </div>
  )
}

export default function Alert() {
  const [showWhatsApp, setShowWhatsApp] = useState(false)
  const { student, indicators, whatsappMessage } = alertData
  return (
    <div className="animate-fade-in">
      <div className="bg-slate-800 px-4 py-2 flex items-center justify-center gap-2">
        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse-slow" />
        <p className="text-slate-300 text-xs font-medium">Visão do Gestor — dados administrativos</p>
      </div>
      <div className="bg-gradient-to-br from-red-500 to-rose-600 px-5 pt-8 pb-6">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={18} className="text-red-100" />
          <p className="text-red-100 text-sm font-medium">Alerta de evasão</p>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-white text-xl font-bold">{student.name}</h1>
            <p className="text-red-200 text-sm mt-0.5">{student.course}</p>
            <p className="text-red-200 text-sm">{student.cohort}</p>
          </div>
          <RiskGauge score={student.riskScore} />
        </div>
      </div>
      <div className="px-4 py-5 pb-24 space-y-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
          <h2 className="text-slate-700 font-semibold text-sm mb-3">Indicadores de risco</h2>
          <div className="space-y-2">
            {indicators.map((ind, i) => {
              const cfg = severityConfig[ind.severity]
              return (
                <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${cfg.badge}`}>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                  <span className="text-sm font-medium flex-1">{ind.label}</span>
                  <span className="text-xs uppercase font-semibold opacity-60">{ind.severity === 'high' ? 'Alto' : ind.severity === 'medium' ? 'Médio' : 'Baixo'}</span>
                </div>
              )
            })}
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
          <h2 className="text-slate-700 font-semibold text-sm mb-1">Ação sugerida</h2>
          <p className="text-slate-500 text-xs mb-4">Alunos que recebem contato humano em até 48h têm 3× mais chance de continuar.</p>
          <button onClick={() => setShowWhatsApp(true)} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 transition-colors text-sm active:scale-[0.98]">
            <MessageCircle size={18} />
            Enviar mensagem de recuperação via WhatsApp
          </button>
        </div>
        <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4">
          <p className="text-slate-500 text-xs leading-relaxed">
            <strong className="text-slate-600">Como funciona:</strong> o sistema monitora automaticamente presença, atividade na plataforma e entrega de exercícios. Quando o score ultrapassa 70, o gestor é notificado para intervir antes que o aluno abandone o curso.
          </p>
        </div>
      </div>
      {showWhatsApp && <WhatsAppPreview message={whatsappMessage} onClose={() => setShowWhatsApp(false)} />}
    </div>
  )
}
