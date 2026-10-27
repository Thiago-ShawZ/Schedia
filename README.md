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

## Perfil de Aprovadores e Moderação de Negócios (Fase 8)

O Schedia conta com um fluxo de homologação para garantir a qualidade e segurança dos estabelecimentos disponíveis no Hub:

1. **Permissão de Aprovador (`platform_approvers`):**
   - É uma permissão concedida no banco de dados para administradores da plataforma.
   - Não altera a tabela `profiles` e utiliza RLS estrita sem escrita pública.
   - Usuários aprovadores visualizam a aba e rota exclusiva **/aprovadores**.

2. **Como se cadastrar como Aprovador:**
   Execute no **SQL Editor** do Supabase:
   ```sql
   insert into public.platform_approvers (user_id)
   select id from auth.users
   where email in ('seu-email@dominio.com');
   ```

3. **Fluxo de Cadastro e Análise em 2 Etapas:**
   - **Etapa 1 (`/painel/novo`):** Cadastro dos dados cadastrais básicos. O negócio nasce com status `pending` e despublicado.
   - **Etapa 2 (`/painel/:id/analise`):** Envio dos dados confidenciais de moderação:
     - Nome fantasia e CNPJ (opcional com validação matemática de dígitos verificadores).
     - Endereço físico completo e CEP com auto-preenchimento.
     - Faixa de faturamento mensal estimada, descrição das instalações e Instagram.
     - **1 a 6 fotos:** enviadas diretamente ao bucket privado `business-applications` com redimensionamento no cliente (~1280 px).
   - **Moderação (`/aprovadores`):**
     - Aprovadores avaliam a solicitação com visualização de fotos via URLs assinadas de curta duração (5 min).
     - **Aprovação:** negócio marcado como `approved` (e publicado automaticamente no Hub se já possuir categoria, serviço ativo e horários).
     - **Reprovação:** exige comentário fundamentado (mínimo 10 caracteres). O dono visualiza o motivo no painel e pode corrigir e reenviar.

4. **Validação e Testes Automatizados no Banco:**
   Execute o script [supabase/tests/aprovadores_verificacao.sql](file:///c:/Users/thago/Downloads/schedia-fase4/schedia/supabase/tests/aprovadores_verificacao.sql) no SQL Editor do Supabase. Ele simula chamadas como usuário comum, dono de negócio e aprovador (com rollback automático ao final).

5. **Rollback da Fase 8 (se necessário):**
   Execute [supabase/migrations/0008_rollback.sql](file:///c:/Users/thago/Downloads/schedia-fase4/schedia/supabase/migrations/0008_rollback.sql) no SQL Editor. O script remove triggers, RPCs, bucket e tabelas de análise, restaurando a política original `biz_insert`.

---

## Fases do Projeto
- [x] 1 Base: schema, RLS, anti-sobreposição, auth, landing, hub
- [x] 2 Painel: negócio, serviços, produtos, configurações/horários
- [x] 3 Página pública, disponibilidade, reserva em 4 etapas
- [x] 4 Agenda do profissional, bloqueios, histórico, cancelar/reagendar, perfil, redefinição de senha
- [x] 5 UX/UI Redesign: Design System v2, Responsividade Mobile (Drawer), Dashboard previsto × realizado, acessibilidade
- [x] 8 Perfil de Aprovadores e fluxo de aprovação de novos negócios
- [ ] 6 Google Agenda e notificações automáticas

