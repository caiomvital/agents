export const student = {
  name: 'Lucas Ferreira',
  firstName: 'Lucas',
  initials: 'LF',
  course: 'Desenvolvimento Web',
  cohort: 'Turma 2024.2',
  streak: 3,
  riskLevel: 'warning',
}

export const moduleProgress = {
  name: 'Módulo 3',
  subtitle: 'Lógica de Programação',
  progress: 60,
  skills: [
    { name: 'Variáveis',  status: 'done' },
    { name: 'If / Else',  status: 'done' },
    { name: 'Laços',      status: 'active' },
    { name: 'Arrays',     status: 'pending' },
    { name: 'Métodos',    status: 'pending' },
    { name: 'POO',        status: 'pending' },
  ],
}

export const nextClass = {
  date: 'Qua, 18 Jun',
  time: '19h00',
  topic: 'Introdução a Arrays',
  location: 'Sala 3 — Presencial',
}

export const studentStatus = {
  type: 'warning',
  message: 'Você perdeu 2 aulas. Recomendamos uma recuperação rápida antes da próxima.',
}

export const exercise = {
  id: 1,
  title: 'Laços de Repetição',
  badge: 'Módulo 3',
  estimatedTime: '8 min',
  points: 10,
  description:
    'Escreva um algoritmo que imprima os números de 1 a 10 usando um laço de repetição. Pode usar pseudocódigo ou JavaScript.',
  tip: 'Dica: use for, while ou do...while.',
  example: `// Exemplo de estrutura
for (let i = 1; i <= 10; i++) {
  // o que fazer com cada número?
}`,
}

export const recoveryPlans = {
  topic: {
    icon: '📖',
    title: 'Revisar o assunto',
    intro: 'Sem problema — acontece com todo mundo. Aqui vai um plano rápido:',
    steps: [
      { time: '8 min',         action: 'Assistir ao vídeo resumo do assunto no portal' },
      { time: '10 min',        action: 'Refazer o exercício guiado da aula' },
      { time: 'Próxima aula',  action: 'Tirar a dúvida restante com o professor' },
    ],
    footer: 'Revisão em menos de 20 minutos. Você consegue.',
  },
  exercise: {
    icon: '💡',
    title: 'Dificuldade no exercício',
    intro: 'Exercícios difíceis são sinal de que você está evoluindo:',
    steps: [
      { time: '5 min',         action: 'Releia o enunciado em voz alta, com calma' },
      { time: '10 min',        action: 'Tente resolver a versão simplificada primeiro' },
      { time: 'Próxima aula',  action: 'Mostre sua tentativa ao professor — mesmo incompleta' },
    ],
    footer: 'Tentativa errada é melhor que folha em branco.',
  },
  eclipse: {
    icon: '🔧',
    title: 'Problema com o Eclipse',
    intro: 'Problema técnico tem solução técnica. Siga o passo a passo:',
    steps: [
      { time: '3 min',        action: 'Feche e reabra o Eclipse completamente' },
      { time: '5 min',        action: 'Verifique se a versão do Java está correta (JDK 17+)' },
      { time: 'Se persistir', action: 'Mande print do erro no grupo da turma' },
    ],
    footer: 'Suporte técnico responde no mesmo dia.',
  },
  missed: {
    icon: '🎬',
    title: 'Recuperar aula perdida',
    intro: 'A gravação está disponível. Você não fica para trás:',
    steps: [
      { time: '20 min',   action: 'Assista à gravação da aula no portal' },
      { time: '10 min',   action: 'Complete os exercícios da aula' },
      { time: 'Opcional', action: 'Revise com um colega para fixar o conteúdo' },
    ],
    footer: 'Alunos que assistem a gravação têm desempenho igual a quem foi à aula.',
  },
  other: {
    icon: '💬',
    title: 'Vamos resolver juntos',
    intro: 'Não precisa travar sozinho. Aqui vai o caminho:',
    steps: [
      { time: 'Agora',     action: 'Descreva o problema no grupo da turma' },
      { time: 'Em breve',  action: 'Um instrutor vai te responder no mesmo dia' },
      { time: 'Sempre',    action: 'Nenhuma dúvida é pequena demais para perguntar' },
    ],
    footer: 'O grupo existe para isso. Use.',
  },
}

export const stuckOptions = [
  { id: 'topic',    label: 'Não entendi o assunto',         icon: '📖' },
  { id: 'exercise', label: 'Não consegui fazer o exercício', icon: '💡' },
  { id: 'eclipse',  label: 'Meu Eclipse deu erro',          icon: '🔧' },
  { id: 'missed',   label: 'Perdi uma aula',                icon: '🎬' },
  { id: 'other',    label: 'Outro motivo',                  icon: '💬' },
]

export const alertData = {
  student: {
    name: 'Carlos Eduardo',
    initials: 'CE',
    course: 'Desenvolvimento Web',
    cohort: 'Turma 2024.2',
    riskScore: 82,
  },
  indicators: [
    { label: '8 dias sem atividade',    severity: 'high' },
    { label: '2 faltas consecutivas',   severity: 'high' },
    { label: '1 exercício pendente',    severity: 'medium' },
    { label: 'Sem interações no grupo', severity: 'low' },
  ],
  whatsappMessage: `Oi Carlos! 👋\n\nAqui é a Fuctura. Notamos que faz alguns dias que você não acessa a plataforma e sentimos sua falta na última aula.\n\nSabemos que a rotina pode apertar — e tudo bem. Queremos te ajudar a continuar.\n\nTem algo travando? É só falar aqui que a gente resolve junto. 💙\n\n— Equipe Fuctura`,
}
