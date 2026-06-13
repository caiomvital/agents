# Fuctura — Protótipo: Área do Aluno

Proof of concept de uma plataforma de acompanhamento de alunos para a escola de tecnologia **Fuctura**.

Objetivo: demonstrar como uma plataforma digital pode reduzir evasão e aumentar engajamento de alunos de cursos de programação.

---

## Como rodar

```bash
npm install
npm run dev
```

Acesse `http://localhost:5173` no navegador. O design é mobile-first — para melhor experiência, use o DevTools em modo celular (375px × 812px).

---

## Telas do protótipo

| Tela | Aba | Objetivo |
|------|-----|----------|
| **Dashboard** | Início | Clareza sobre progresso, próxima aula e status |
| **Exercício Rápido** | Praticar | Estimular prática entre aulas + gamificação leve |
| **Estou Travado** | Travei | Plano de recuperação personalizado, reduz abandono silencioso |
| **Alerta de Evasão** | Gestor | Visão administrativa de aluno em risco |

---

## Stack

- **React 18** + **Vite 5**
- **TailwindCSS 3**
- **lucide-react** (ícones)
- **vite-plugin-pwa** (instalável como app)
- Dados mockados em `src/data/mockData.js`

---

## Estrutura

```
src/
├── data/
│   └── mockData.js        # Todos os dados fictícios
├── components/
│   └── BottomNav.jsx      # Navegação inferior
├── pages/
│   ├── Dashboard.jsx      # Tela 1
├── Exercise.jsx       # Tela 2
│   ├── Stuck.jsx          # Tela 3
│   └── Alert.jsx          # Tela 4
├── App.jsx
├── main.jsx
└── index.css
```

---

## O que este protótipo NÃO é

- Não tem backend real
- Não tem autenticação
- Não tem banco de dados
- Não envia mensagens de WhatsApp de verdade

É exclusivamente um protótipo navegável para validação de conceito com gestores.
