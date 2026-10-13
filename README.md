# Schedia

Plataforma moderna de agendamentos para microempreendedores · React + TypeScript + Vite + Supabase.

## Rodar em 5 passos
1. Crie um projeto gratuito em [supabase.com](https://supabase.com).
2. **SQL Editor** → cole todo o `supabase/schema_completo.sql` e execute.
3. **Authentication → Providers → Email** → desative *Confirm email* (para testar sem caixa de entrada).
   Em **Authentication → URL Configuration**, adicione `http://localhost:5173/**` em *Redirect URLs* (usado na redefinição de senha).
4. `cp .env.example .env` e preencha `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (Project Settings → API).
5. `npm install && npm run dev` → http://localhost:5173

**Dados de demonstração (opcional):** crie uma conta no app e depois execute `supabase/seed_demo.sql` no SQL Editor.
Ele cria o "Studio Demo" (serviços, produtos, horários, publicado) vinculado a essa primeira conta. Para testar como cliente, abra uma janela anônima e crie uma segunda conta.

## Arquitetura e Áreas da Aplicação
- **Hub de Descoberta (`/hub`):** Busca em tempo real, filtros por categoria via pills, cards com avatar, status e acesso à página pública.
- **Área do Cliente (`/agendamentos` e `/perfil`):** Visualização de agendamentos futuros e histórico, cancelamento, reagendamento com seletor de horários e edição de dados cadastrais.
- **Página Pública do Negócio (`/n/:slug`):** Cabeçalho comercial com bio e localização, catálogo de serviços/produtos e fluxo de reserva em 4 etapas intuitivas.
- **Painel Administrativo do Profissional (`/painel/:id`):** Layout dedicado com Sidebar no desktop e abas horizontais no mobile, incluindo:
  - **Agenda:** Indicadores de previsto × realizado, timeline de atendimentos com status e ações rápidas (Concluir, Faltou, Cancelar).
  - **Serviços & Produtos:** CRUD com badges de status (Ativo/Inativo), duração e preços formatados em BRL.
  - **Bloqueios:** Interdição de horários para folga/almoço com alerta de conflitos.
  - **Configurações:** Horários semanais de funcionamento (abertura/fechamento), intervalo de slots e publicação no Hub.

## Roteiro de Teste
- **Cliente:** Hub → Studio Demo → Agendar → escolher horário → confirmar → *Meus agendamentos* (reagendar/cancelar).
- **Profissional:** *Meus negócios* → Agenda (concluir, faltou, cancelar), Bloqueios, Serviços, Produtos, Configurações.

## Fases do Projeto
- [x] 1 Base: schema, RLS, anti-sobreposição, auth, landing, hub
- [x] 2 Painel: negócio, serviços, produtos, configurações/horários
- [x] 3 Página pública, disponibilidade, reserva em 4 etapas
- [x] 4 Agenda do profissional, bloqueios, histórico, cancelar/reagendar, perfil, redefinição de senha
- [x] 5 UX/UI Redesign: Design System v2, Responsividade Mobile (Drawer), Dashboard previsto × realizado, acessibilidade
- [ ] 6 Google Agenda e notificações automáticas
