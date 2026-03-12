# 📊 Documentação do Painel Administrativo

## ✅ Status da Implementação

**COMPLETO (75%)** - Módulos principais implementados e integrados

### Módulos Implementados

✅ **Layout Base** - AdminLayout.tsx (100%)  
✅ **Dashboard Principal** - AdminDashboardOverview.tsx (100%)  
✅ **Fila de Moderação** - ModerationQueue.tsx (100%)  
✅ **Gestão de Usuários** - UserManagement.tsx (100%)  
✅ **Auditoria & Segurança** - AuditLogs.tsx (100%)  
⏳ **Configurações** - Usando AdminDashboard.tsx temporariamente

---

## 🏗️ Arquitetura do Painel

### Estrutura de Arquivos

```
pages/admin/
├── AdminLayout.tsx              # Layout base (sidebar + topbar)
├── AdminDashboardOverview.tsx   # Dashboard com KPIs
├── ModerationQueue.tsx          # Fila de aprovação de anúncios
├── UserManagement.tsx           # CRM de usuários
└── AuditLogs.tsx                # Logs de auditoria
```

### Rotas Configuradas (App.tsx)

```tsx
/admin                  → AdminDashboardOverview (Dashboard com KPIs)
/admin/moderation       → ModerationQueue (Fila de moderação)
/admin/users            → UserManagement (Gestão de usuários)
/admin/audit            → AuditLogs (Logs de auditoria)
/admin/settings         → AdminDashboard (Configurações)
```

Todas as rotas são protegidas por `ProtectedAdminRoute` (requer role='admin').

---

## 📄 Descrição dos Módulos

### 1️⃣ AdminLayout.tsx

**Objetivo**: Layout base do painel administrativo profissional

**Funcionalidades**:
- **Sidebar Fixa**: 264px de largura, colapsável para 80px
- **Menu de Navegação**: 5 items principais com ícones (Lucide React)
  - Dashboard
  - Fila de Moderação (com badge de notificações)
  - Gestão de Usuários
  - Auditoria & Segurança
  - Configurações
- **Topbar**:
  - Busca global (input com formulário)
  - Badge de notificações não lidas (`useNotificationsCount`)
  - Dropdown de usuário com perfil e logout
- **Outlet**: Para nested routes do React Router
- **Responsivo**: Sidebar com botão de collapse

**Tecnologias**:
- React Router (`useNavigate`, `NavLink`, `Outlet`)
- `useAuth` para autenticação
- `useNotificationsCount` para badges em tempo real
- Tailwind CSS para estilo

---

### 2️⃣ AdminDashboardOverview.tsx

**Objetivo**: Dashboard principal com KPIs e gráficos de métricas do marketplace

**Funcionalidades**:
- **4 KPI Cards**:
  - Anúncios Ativos (totais)
  - Anúncios Pendentes de Moderação
  - Usuários Ativos Mensais (MAU)
  - Radar Matches (total de matches AI)
- **Gráficos**:
  - **BarChart**: Anúncios por categoria (top 8)
  - **PieChart**: Distribuição de anúncios por tipo (VENDA/COMPRO/SERVICO/etc)
- **Filtro Temporal**: 7 dias / 30 dias / 90 dias
- **Quick Actions**: Links rápidos para Moderação, Usuários, Auditoria

**Queries Otimizadas**:
```tsx
// Contagem eficiente sem carregar dados
const { count } = await supabase
  .from('announcements')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'ACTIVE');
```

**Tecnologias**:
- Recharts (BarChart, PieChart, ResponsiveContainer)
- Supabase para queries
- Lucide React para ícones

---

### 3️⃣ ModerationQueue.tsx

**Objetivo**: Fila de moderação de anúncios (PRIORIDADE MÁXIMA)

**Funcionalidades**:
- **Tabela Densa**: 6 colunas (Anúncio, Categoria, Tipo, Anunciante, Data, Ações)
- **Paginação Server-Side**: 20 items/página com `range(page*20, page*20+19)`
- **Filtros**:
  - Busca por título/descrição (trigram)
  - Filtro por categoria (multi-select)
- **4 Ações**:
  - ✅ **Aprovar**: Status → 'ACTIVE' + `approved_at`
  - ❌ **Rejeitar**: Modal obrigatório com motivo + Status → 'REJECTED'
  - ⭐ **Destacar**: Aprovar + `featured=true` + `featured_until` (+30 dias)
  - 👁️ **Visualizar**: Abre anúncio em nova aba

**Auditoria OBRIGATÓRIA**:
Em **TODAS as ações** (approve/reject/feature), o sistema registra:
```tsx
await logAction({
  action: ADMIN_ACTIONS.APPROVE_AD, // ou REJECT_AD, FEATURE_AD
  resourceType: RESOURCE_TYPES.ANNOUNCEMENT,
  resourceId: announcement.id,
  oldValue: { status: 'PENDING' },
  newValue: { status: 'ACTIVE', approved_at: new Date().toISOString() },
  reason: `Anúncio "${announcement.title}" aprovado após revisão`
});
```

**Modal de Rejeição**:
- Textarea obrigatória para motivo
- Validação: não permite rejeição sem motivo
- Motivo é salvo em `rejection_reason` na tabela announcements

**Performance**:
- Real-time count: Exibe "X anúncios aguardando aprovação"
- Queries otimizadas com `.range()` para paginação
- Nested query: `owner:users!announcements_owner_id_fkey(name,email,phone)`

---

### 4️⃣ UserManagement.tsx

**Objetivo**: CRM completo para gestão de usuários do marketplace

**Funcionalidades**:
- **Tabela com 7 Colunas**:
  - Usuário (avatar, nome, email, telefone)
  - CPF/CNPJ
  - Plano (FREE, BASIC, PRO, PREMIUM)
  - Role (user, editor, admin)
  - Contagem de Anúncios (link clicável)
  - Status (Ativo / Suspenso)
  - Ações
- **Paginação Server-Side**: 20/página
- **Filtros**:
  - Busca por: Nome, Email, CPF/CNPJ (busca OR com `ilike`)
  - Filtro por Plano (dropdown)
  - Filtro por Status (Ativo/Suspenso)

**3 Ações Administrativas** (com auditoria):

**1. Editar Usuário (Modal)**:
- Alterar Plano: Select com FREE/BASIC/PRO/PREMIUM
  - Auditoria: `ADMIN_ACTIONS.UPDATE_PLAN`
- Alterar Role: Select com user/editor/admin
  - Auditoria: `ADMIN_ACTIONS.UPDATE_USER_ROLE`
  - Atualiza automaticamente `is_admin` (admin=true, outros=false)

**2. Suspender Usuário (Modal)**:
- Textarea obrigatória para motivo
- Campos atualizados:
  - `is_suspended` → true
  - `suspension_reason` → texto do motivo
  - `suspended_at` → timestamp
- Auditoria: `ADMIN_ACTIONS.SUSPEND_USER`

**3. Remover Suspensão**:
- Botão direto (sem modal)
- `is_suspended` → false
- `suspension_reason` → null
- Auditoria: `ADMIN_ACTIONS.SUSPEND_USER` (com newValue indicando remoção)

**Queries Otimizadas**:
```tsx
// Contagem de anúncios por usuário (paralelo)
const usersWithCounts = await Promise.all(
  (data || []).map(async (user) => {
    const { count } = await supabase
      .from('announcements')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', user.id);
    return { ...user, _count: { announcements: count } };
  })
);
```

**Integração**:
- Link "Ver Anúncios": Filtra anúncios daquele usuário (via URL hash)
- Ícone de Crown (👑) para admins
- Badge colorido para status de suspensão

---

### 5️⃣ AuditLogs.tsx

**Objetivo**: Auditoria completa de ações administrativas (compliance e rastreabilidade)

**Funcionalidades**:
- **3 KPI Cards**:
  - Total de Ações (todos os tempos)
  - Ações Críticas nas últimas 24h (DELETE_USER, SUSPEND_USER, etc)
  - Admins Ativos (quantidade de admins únicos)
- **2 Tabelas de Estatísticas**:
  - **Top 5 Ações Mais Frequentes**: Dados de `v_admin_action_stats`
  - **Top 5 Admins Mais Ativos**: Agregação manual de logs
- **Tabela de Logs Paginada**: 20/página
  - 6 Colunas: Data/Hora, Admin, Ação, Recurso, Motivo, Detalhes
  - **Expandir Linha**: Mostra IP, User Agent, Old Value (JSON), New Value (JSON)
- **Filtros**:
  - Busca por motivo ou ID do recurso
  - Filtro por Ação (APPROVE_AD, REJECT_AD, DELETE_AD, etc)
  - Filtro por Tipo de Recurso (announcement, user, subscription)
  - Filtro por Admin (dropdown com emails)

**Queries**:
```tsx
// View otimizada com JOIN
SELECT * FROM v_recent_admin_actions
ORDER BY created_at DESC
LIMIT 100;

// Estatísticas agregadas
SELECT * FROM v_admin_action_stats;
```

**Coloração de Badges**:
- **Vermelho**: DELETE*, SUSPEND*
- **Verde**: APPROVE*, CREATE*
- **Azul**: UPDATE*, EDIT*
- **Cinza**: Outros

**Integração**:
- Lê de `v_recent_admin_actions` (view criada no script RBAC_AND_SECURITY_SETUP.sql)
- Mostra JSONB completo de `old_value` e `new_value` em formato JSON pretty

---

## 🔐 Auditoria Obrigatória

**TODOS os módulos** implementam auditoria via `useAdminAudit`:

### Hook: useAdminAudit

**Localização**: `src/hooks/useAdminAudit.ts`

**Função Principal**:
```tsx
const { logAction } = useAdminAudit();

await logAction({
  action: ADMIN_ACTIONS.APPROVE_AD,       // Enum de ações
  resourceType: RESOURCE_TYPES.ANNOUNCEMENT, // Enum de recursos
  resourceId: 'uuid-do-recurso',
  oldValue: { status: 'PENDING' },        // JSONB com valor anterior
  newValue: { status: 'ACTIVE' },         // JSONB com novo valor
  reason: 'Motivo detalhado da ação'      // String obrigatória
});
```

### Ações Registradas (ADMIN_ACTIONS)

**ModerationQueue**:
- `APPROVE_AD` - Aprovar anúncio
- `REJECT_AD` - Rejeitar anúncio
- `FEATURE_AD` - Destacar anúncio

**UserManagement**:
- `UPDATE_PLAN` - Alterar plano do usuário
- `UPDATE_USER_ROLE` - Alterar role/permissões
- `SUSPEND_USER` - Suspender ou reativar usuário

### Tabela de Logs

**Nome**: `admin_audit_logs`

**Campos**:
- `id` (uuid, PK)
- `admin_id` (uuid, FK → users)
- `action` (text) - Nome da ação
- `resource_type` (text) - Tipo do recurso
- `resource_id` (uuid) - ID do recurso
- `old_value` (jsonb) - Valor anterior
- `new_value` (jsonb) - Novo valor
- `reason` (text) - Motivo da ação
- `ip_address` (text) - IP do admin
- `user_agent` (text) - Browser do admin
- `created_at` (timestamptz)

**Views Auxiliares**:
- `v_recent_admin_actions` - JOIN com users para mostrar nome do admin
- `v_admin_action_stats` - Agregação de ações por tipo

---

## 🎨 Design System

### Cores do Painel

```css
/* Backgrounds */
bg-slate-50        /* Cards background */
bg-slate-900       /* Sidebar background */
bg-white           /* Content area, modals */

/* Status Colors */
bg-green-500       /* Ativo, Aprovado, Sucesso */
bg-red-500         /* Rejeitado, Suspenso, Erro */
bg-blue-500        /* Edição, Atualização */
bg-yellow-500      /* Destaque, Editor role */
bg-purple-500      /* Premium plan */

/* Text */
text-slate-900     /* Headings, títulos */
text-slate-600     /* Body text */
text-slate-500     /* Subtexts, labels */
```

### Componentes Reutilizáveis

**KPICard** (AdminDashboardOverview):
```tsx
<div className="bg-white rounded-xl p-6 border border-slate-200">
  <p className="text-sm font-semibold text-slate-500 uppercase">{title}</p>
  <p className="text-3xl font-black text-slate-900 mt-2">{value}</p>
  <Icon className="w-6 h-6 text-green-600" />
</div>
```

**Badge de Status**:
```tsx
<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
  Ativo
</span>
```

---

## 📦 Dependências

### NPM Packages Instalados

```json
{
  "dependencies": {
    "recharts": "^2.x" // Gráficos (BarChart, PieChart)
  },
  "devDependencies": {
    "@types/recharts": "^1.x" // Tipagens TypeScript
  }
}
```

### Hooks Criados

- **useAdminAudit** (`src/hooks/useAdminAudit.ts`) - Auditoria de ações
- **useRateLimit** (`src/hooks/useRateLimit.ts`) - Rate limiting de requisições
- **useNotificationsCount** (`src/hooks/useNotificationsCount.ts`) - Contadores em tempo real

### Componentes de Segurança

- **ProtectedAdminRoute** (`components/ProtectedAdminRoute.tsx`) - Guarda de rotas admin
- **CaptchaWidget** (`components/CaptchaWidget.tsx`) - Captcha no login admin

---

## 🚀 Como Testar

### 1. Acesso ao Painel

```
http://localhost:5173/#/admin
```

**Pré-requisitos**:
- Ter executado o script SQL: `sql/ENABLE_MAXIMUM_SECURITY.sql`
- Ter um usuário com `role='admin'` e `is_admin=true`
- Estar autenticado via Supabase Auth

### 2. Fluxo de Teste - Moderação

1. Navegue para `/admin/moderation`
2. Veja lista de anúncios pendentes (status='PENDING')
3. Teste ações:
   - **Aprovar**: Clique em ✅ → Anúncio muda para ACTIVE
   - **Rejeitar**: Clique em ❌ → Modal abre → Digite motivo → Rejeitar
   - **Destacar**: Clique em ⭐ → Anúncio aprovado + featured por 30 dias
4. Verifique auditoria em `/admin/audit`

### 3. Fluxo de Teste - Gestão de Usuários

1. Navegue para `/admin/users`
2. Busque um usuário por nome ou email
3. Teste ações:
   - **Editar**: Modal com alteração de Plano e Role
   - **Suspender**: Modal com motivo obrigatório
   - **Ver Anúncios**: Link para anúncios do usuário
4. Verifique auditoria em `/admin/audit`

### 4. Fluxo de Teste - Auditoria

1. Navegue para `/admin/audit`
2. Veja logs de todas as ações anteriores
3. Teste filtros:
   - Busca por motivo
   - Filtro por ação (APPROVE_AD, etc)
   - Filtro por recurso (announcement, user)
4. Expanda uma linha para ver JSONB completo

---

## 🔧 Troubleshooting

### Erro: "infinite recursion detected in policy"

**Causa**: Políticas RLS com subqueries recursivas em `users`

**Solução**: Execute o script `sql/ENABLE_MAXIMUM_SECURITY.sql` que usa funções `SECURITY DEFINER`:
```sql
CREATE FUNCTION is_current_user_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER;
```

### Erro: "Não é possível localizar o módulo 'recharts'"

**Solução**:
```bash
npm install recharts @types/recharts --save-dev
```

### Badge de Notificações Não Aparece

**Causa**: `useNotificationsCount` retorna objeto diferente

**Solução**:
```tsx
// ❌ Errado
const { unreadCount } = useNotificationsCount();

// ✅ Correto
const { notificationsCount: unreadCount } = useNotificationsCount();
```

### Anúncios Não Aparecem na Fila

**Verificar**:
1. Tabela `announcements` tem registros com `status='PENDING'`?
2. RLS está ativado? Script ENABLE_MAXIMUM_SECURITY.sql foi executado?
3. Usuário atual tem `is_admin=true`?

**Debug**:
```sql
-- Verificar anúncios pendentes
SELECT COUNT(*) FROM announcements WHERE status = 'PENDING';

-- Verificar admin
SELECT id, email, is_admin, role FROM users WHERE id = '<seu-user-id>';

-- Testar função de segurança
SELECT is_current_user_admin();
```

---

## 📈 Próximos Passos (Roadmap)

### ⏳ Pendente: Módulo de Configurações

**Arquivo**: `pages/admin/Settings.tsx`

**Funcionalidades planejadas**:
- **SMTP Config**: Configurar servidor de email
  - Host, Port, Username, Password
  - Auditoria: `ADMIN_ACTIONS.UPDATE_SMTP_CONFIG`
- **Banner Management**: Upload e gerenciamento de banners
  - Carregar imagem
  - Definir ordem e visibilidade
- **Page Content Editor**: Editar conteúdo de páginas estáticas
  - Sobre, Termos, Privacidade
  - Editor WYSIWYG (Quill ou TipTap)
- **Maintenance Mode**: Ativar/desativar modo manutenção
  - Toggle com mensagem customizável

### ⏳ Pendente: Notificações Real-time

**Objetivo**: Notificar admins instantaneamente de novos anúncios pendentes ou denúncias

**Implementação**:
```tsx
// No AdminLayout.tsx
useEffect(() => {
  const channel = supabase
    .channel('admin-notifications')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'announcements',
      filter: 'status=eq.PENDING'
    }, (payload) => {
      toast.info('Novo anúncio aguardando moderação', {
        action: {
          label: 'Ver',
          onClick: () => navigate('/admin/moderation')
        }
      });
    })
    .subscribe();
    
  return () => { supabase.removeChannel(channel); };
}, []);
```

### ⏳ Pendente: Exportação de Dados

**Funcionalidades**:
- Exportar logs de auditoria para CSV
- Exportar lista de usuários para Excel
- Relatório gerencial mensal (PDF)

---

## 📚 Referências

**Scripts SQL**:
- `sql/RBAC_AND_SECURITY_SETUP.sql` - Setup completo de RBAC
- `sql/ENABLE_MAXIMUM_SECURITY.sql` - Funções seguras sem recursão

**Documentação**:
- `docs/ADMIN_AUDIT_EXAMPLES.md` - 9 exemplos de uso do useAdminAudit
- `docs/README_RBAC_SECURITY.md` - Documentação completa do RBAC

**Arquivos de Configuração**:
- `.env.example` - Template de variáveis de ambiente

---

## ✅ Checklist de Implementação

- [x] AdminLayout.tsx (Sidebar + Topbar)
- [x] AdminDashboardOverview.tsx (Dashboard com KPIs)
- [x] ModerationQueue.tsx (Fila de moderação)
- [x] UserManagement.tsx (CRM de usuários)
- [x] AuditLogs.tsx (Logs de auditoria)
- [x] Integração de rotas no App.tsx
- [x] Instalação de dependências (Recharts)
- [x] Correção de imports (supabaseClient.ts)
- [x] Auditoria obrigatória em todas ações
- [ ] Módulo de Configurações completo
- [ ] Notificações real-time para admins
- [ ] Exportação de dados (CSV/Excel/PDF)

---

**Última Atualização**: Janeiro 2025  
**Versão**: 1.0  
**Autor**: Assistente AI (GitHub Copilot)
