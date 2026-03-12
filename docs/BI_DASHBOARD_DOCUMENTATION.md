# 📊 Dashboard de BI - Documentação Completa

## ✅ Implementação Concluída

Data: 12/03/2026

---

## 📋 Resumo Executivo

Implementado **Dashboard de BI completo** substituindo o painel administrativo anterior por um sistema profissional de business intelligence com **14 métricas estratégicas**, divididas em 4 blocos funcionais.

---

## 🎯 Métricas Implementadas (14 itens)

### 🟢 BLOCO 1: Financeiro (6 KPIs)

| # | Métrica | Fórmula | Fonte de Dados |
|---|---------|---------|---------------|
| 1 | **MRR** (Monthly Recurring Revenue) | Soma dos valores mensais dos planos ativos | `v_mrr_monthly` |
| 2 | **Ticket Médio** | MRR Total / Número de Assinantes Ativos | Calculado |
| 3 | **Receita por Plano (%)** | MRR do Plano / MRR Total × 100 | `v_revenue_by_plan` |
| 4 | **Faturamento Total** | Soma de toda receita histórica | `subscription_history` |
| 5 | **Notas Fiscais** | Count de registros na tabela `invoices` | `invoices` |
| 6 | **Taxa de Churn Financeiro (%)** | MRR Perdida / MRR Inicial × 100 | `v_churn_monthly` |

### 🔵 BLOCO 2: Marketing e Conversão (4 KPIs)

| # | Métrica | Fórmula | Implementação |
|---|---------|---------|--------------|
| 7 | **CAC** (Custo Aquisição Cliente) | Custo Marketing / Novos Pagantes | View `v_cac_monthly` + **Input Manual** |
| 8 | **Taxa Conversão Grátis→Pago (%)** | Upgrades / Total Plano Gratuito × 100 | `v_free_to_paid_conversion` |
| 9 | **Taxa Churn de Clientes (%)** | Clientes Perdidos / Clientes Início × 100 | Calculado no frontend |
| 10 | **Taxa Conversão de Leads (%)** | Leads Gerados / Visualizações × 100 | `v_lead_conversion_rate` |

### 🟣 BLOCO 3: Tráfego e Inventário (2 KPIs)

| # | Métrica | Fonte |
|---|---------|-------|
| 11 | **Total Anúncios Ativos** | `announcements` WHERE status = 'ACTIVE' |
| 12 | **Total Visitas Mensais** | `website_visits` (soma do mês) |

### 🟠 BLOCO 4: Moderação (2 funcionalidades)

| # | Funcionalidade | Descrição |
|---|---------------|-----------|
| 13 | **Análise de Anúncios** | Dashboard com filtros e busca |
| 14 | **Colocar em Análise** | Status `UNDER_REVIEW` + Auditoria obrigatória |

---

## 🗄️ Estrutura de Banco de Dados

### Tabelas Criadas (4 novas)

#### 1. `subscription_history`
**Propósito:** Rastrear TODAS as mudanças de planos para cálculos retroativos precisos

**Colunas principais:**
```sql
- id: UUID
- user_id: UUID (FK users)
- plan_id: UUID (FK plans)
- event_type: TEXT ('created', 'upgraded', 'downgraded', 'renewed', 'canceled', 'expired')
- status: TEXT ('active', 'trialing', 'past_due', 'canceled', 'expired')
- period_start: TIMESTAMPTZ
- period_end: TIMESTAMPTZ
- mrr_contribution: NUMERIC(10,2) -- Contribuição para MRR
- was_paid: BOOLEAN
- previous_plan_id: UUID (para upgrades/downgrades)
- cancellation_reason: TEXT
```

**Triggers automáticos:**
- `trigger_subscription_created`: Auto-registra quando nova subscription é criada
- `trigger_subscription_updated`: Auto-registra mudanças de plano

---

#### 2. `marketing_costs`
**Propósito:** Armazenar custos de marketing mensais para cálculo de CAC

**Colunas principais:**
```sql
- id: UUID
- month_year: DATE (formato: 2026-03-01)
- total_cost: NUMERIC(10,2)
- ad_spend: NUMERIC(10,2)
- influencer_cost: NUMERIC(10,2)
- content_cost: NUMERIC(10,2)
- other_costs: NUMERIC(10,2)
- notes: TEXT
- updated_by: UUID (admin que atualizou)
```

**Input manual:** Admin insere custo de marketing via dashboard

---

#### 3. `website_visits`
**Propósito:** Rastrear visitas diárias ao site

**Colunas principais:**
```sql
- id: UUID
- visit_date: DATE (uma linha por dia)
- total_visits: INTEGER
- unique_visitors: INTEGER
- page_views: INTEGER
- avg_session_duration: INTEGER (segundos)
- bounce_rate: NUMERIC(5,2)
- organic_visits: INTEGER
- direct_visits: INTEGER
- social_visits: INTEGER
- referral_visits: INTEGER
```

**Integração:** Deve ser alimentada por Google Analytics ou sistema próprio

---

#### 4. `lead_conversions`
**Propósito:** Rastrear conversões de leads (cliques em contato)

**Colunas principais:**
```sql
- id: UUID
- announcement_id: UUID (FK announcements)
- viewer_id: UUID (FK users, NULL se anônimo)
- conversion_type: TEXT ('whatsapp_click', 'phone_click', 'email_click', 'message_sent')
- ip_address: INET
- user_agent: TEXT
- created_at: TIMESTAMPTZ
```

**Função de logging:** `log_lead_conversion(announcement_id, viewer_id, type)`

---

### Views de Análise (6 views)

1. **`v_mrr_monthly`**: MRR mensal com detalhamento (new_mrr, expansion_mrr, churn_mrr)
2. **`v_revenue_by_plan`**: Distribuição de MRR por plano
3. **`v_churn_monthly`**: Taxa de churn financeiro mensal
4. **`v_free_to_paid_conversion`**: Taxa de conversão grátis→pago
5. **`v_cac_monthly`**: CAC (Custo Marketing / Novos Clientes)
6. **`v_lead_conversion_rate`**: Taxa de conversão de leads

---

## 🚀 Instalação (Passo a Passo)

### PASSO 1: Executar SQL no Supabase

1. Abrir **Supabase SQL Editor**
2. Copiar conteúdo completo de [sql/BI_DASHBOARD_TABLES.sql](sql/BI_DASHBOARD_TABLES.sql)
3. Colar e executar (**Execute SQL**)

**Resultado esperado:**
```
✅ Tabelas de BI criadas com sucesso
✅ subscription_history: Histórico de planos
✅ marketing_costs: Custos de marketing
✅ website_visits: Rastreamento de visitas
✅ lead_conversions: Conversões de leads
✅ 6 Views de análise criadas
✅ Funções e triggers configurados
✅ Políticas RLS aplicadas
```

---

### PASSO 2: Popular Histórico de Assinaturas (CRÍTICO)

Como a tabela `subscription_history` é nova, ela está vazia. Você tem 2 opções:

#### Opção A: Migração Manual (Recomendado)
```sql
-- Migrar assinaturas existentes para o histórico
INSERT INTO subscription_history (
  user_id,
  subscription_id,
  plan_id,
  plan_name,
  plan_monthly_price,
  event_type,
  status,
  period_start,
  period_end,
  mrr_contribution
)
SELECT 
  us.user_id,
  us.id,
  us.plan_id,
  p.name,
  p.monthly_price,
  CASE 
    WHEN us.status = 'trialing' THEN 'trial_started'
    ELSE 'created'
  END,
  us.status,
  us.current_period_start,
  us.current_period_end,
  CASE 
    WHEN us.status IN ('active', 'trialing') THEN p.monthly_price
    ELSE 0
  END
FROM user_subscriptions us
JOIN plans p ON us.plan_id = p.id;
```

#### Opção B: Aguardar Novos Dados
- A partir de agora, todas as mudanças de plano são registradas automaticamente pelos **triggers**
- Os dados vão acumular organicamente

---

### PASSO 3: Inserir Custo de Marketing Inicial

```sql
-- Inserir custo de marketing do mês atual
INSERT INTO marketing_costs (month_year, total_cost)
VALUES ('2026-03-01', 5000.00); -- Ajustar valor conforme necessário
```

Depois, você pode **atualizar via dashboard** usando o input manual.

---

### PASSO 4: Verificar Instalação

```sql
-- Verificar se views funcionam
SELECT * FROM v_mrr_monthly LIMIT 1;
SELECT * FROM v_revenue_by_plan;
SELECT * FROM v_churn_monthly LIMIT 1;
SELECT * FROM v_cac_monthly LIMIT 1;
SELECT * FROM v_free_to_paid_conversion;
SELECT * FROM v_lead_conversion_rate;
```

Se todas as queries retornarem sem erro, **instalação OK!** 🎉

---

## 🎨 Interface do Dashboard

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  Dashboard de BI                       [Atualizar]      │
│  Visão completa das métricas financeiras e operacionais │
├─────────────────────────────────────────────────────────┤
│  💰 MÉTRICAS FINANCEIRAS                                │
│  ┌──────┬──────┬──────┐                                 │
│  │ MRR  │Ticket│ Rev. │ (6 KPIs em grid 3 colunas)    │
│  └──────┴──────┴──────┘                                 │
│  Tabela: Receita por Plano (com gráfico de pizza)      │
├─────────────────────────────────────────────────────────┤
│  🎯 MARKETING E CONVERSÃO                               │
│  ┌──────┬──────┬──────┬──────┐                          │
│  │ CAC* │Conv. │Churn │Leads │ (4 KPIs em 4 colunas)  │
│  └──────┴──────┴──────┴──────┘                          │
│  * CAC tem input manual para custo de marketing        │
├─────────────────────────────────────────────────────────┤
│  📊 TRÁFEGO E INVENTÁRIO                                │
│  ┌──────┬──────┬──────┬──────┐                          │
│  │ Ads  │Visit.│Duração│Taxa │ (4 KPIs)               │
│  └──────┴──────┴──────┴──────┘                          │
├─────────────────────────────────────────────────────────┤
│  ⚠️ FILA DE MODERAÇÃO (50) [Filtro▼] [Busca... 🔍]   │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Anúncio │ User │ Cat │ Status │ Views │ Ações  │    │
│  ├─────────────────────────────────────────────────┤    │
│  │ Trator  │ João │ Máq │ 🔵 Análise │ 12 │ ✓ X 🔍│    │
│  │ Semente │ Maria│ Ins │ ⏰ Pendente│  5 │ ✓ X 🔍│    │
│  └─────────────────────────────────────────────────┘    │
│  Ações: ✓ Aprovar | X Rejeitar | 🔍 Em Análise        │
└─────────────────────────────────────────────────────────┘
```

---

### 🔧 Funcionalidades Interativas

#### 1. Input Manual de CAC
- **Localização:** Card "CAC" no bloco Marketing
- **Ação:** Admin digita custo de marketing mensal e clica em **Salvar**
- **Backend:** Faz `UPSERT` na tabela `marketing_costs`
- **Atualização:** CAC é recalculado automaticamente

#### 2. Filtros de Moderação
- **Todos**: Mostra PENDING + UNDER_REVIEW
- **Pendentes**: Apenas PENDING
- **Em Análise**: Apenas UNDER_REVIEW

#### 3. Busca de Anúncios
- Busca em tempo real por título ou nome do usuário

#### 4. Ações de Moderação

**Aprovar (✓)**:
- Muda status para `ACTIVE`
- Registra auditoria via `useAdminAudit`

**Rejeitar (X)**:
- Prompt solicita motivo
- Muda status para `REJECTED`
- Registra auditoria com motivo

**Colocar em Análise (🔍)**:
- Prompt solicita motivo (OBRIGATÓRIO)
- Muda status para `UNDER_REVIEW`
- **Auditoria obrigatória** via `useAdminAudit`

---

## 📐 Fórmulas Detalhadas

### 1. MRR (Monthly Recurring Revenue)
```
MRR = Σ(planos ativos no mês × preço mensal)
```
**Exemplo:**
- 10 users no Essencial (R$ 59) = R$ 590
- 5 users no Destaque (R$ 119) = R$ 595
- 2 users no Premium (R$ 199) = R$ 398
- **MRR Total = R$ 1.583**

---

### 2. Ticket Médio
```
Ticket Médio = MRR Total / Número de Assinantes Ativos
```
**Exemplo:**
- MRR Total = R$ 1.583
- Assinantes Ativos = 17
- **Ticket Médio = R$ 93,12**

---

### 3. Receita por Plano (%)
```
% do Plano = (MRR do Plano / MRR Total) × 100
```
**Exemplo:**
- MRR Essencial = R$ 590
- MRR Total = R$ 1.583
- **% Essencial = 37,27%**

---

### 4. Taxa de Churn Financeiro (%)
```
Churn Financeiro = (MRR Perdida no Mês / MRR no Início do Mês) × 100
```
**Exemplo:**
- MRR início fevereiro = R$ 2.000
- Cancelamentos em fevereiro = R$ 300
- **Churn = 15%**

---

### 5. CAC (Custo de Aquisição de Cliente)
```
CAC = Custo de Marketing Mensal / Número de Novos Clientes Pagantes
```
**Exemplo:**
- Custo de marketing em março = R$ 5.000
- Novos clientes pagantes = 50
- **CAC = R$ 100**

---

### 6. Taxa de Conversão Grátis→Pago (%)
```
Taxa Conversão = (Número de Upgrades / Total de Usuários Gratuitos) × 100
```
**Exemplo:**
- Usuários no plano "Start Agro" (gratuito) = 200
- Upgrades no mês = 15
- **Taxa = 7,5%**

---

### 7. Taxa de Churn de Clientes (%)
```
Churn de Clientes = (Clientes Perdidos no Mês / Clientes no Início do Mês) × 100
```
**Exemplo:**
- Clientes início março = 100
- Cancelamentos em março = 8
- **Churn = 8%**

---

### 8. Taxa de Conversão de Leads (%)
```
Conversão de Leads = (Total de Leads Gerados / Total de Views) × 100
```
**Exemplo:**
- Views de anúncios = 10.000
- Cliques em contato (leads) = 350
- **Taxa = 3,5%**

---

## 🔐 Segurança e Auditoria

### Políticas RLS (Row Level Security)

Todas as tabelas novas têm RLS habilitado:

```sql
-- subscription_history: Apenas admins podem ver
ALTER TABLE subscription_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_view_subscription_history" ON subscription_history
FOR SELECT USING ((SELECT is_admin FROM users WHERE id = auth.uid()) = true);

-- marketing_costs: Apenas admins podem gerenciar
ALTER TABLE marketing_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_manage_marketing_costs" ON marketing_costs
FOR ALL USING ((SELECT is_admin FROM users WHERE id = auth.uid()) = true);

-- website_visits: Apenas admins podem ver
ALTER TABLE website_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins_view_website_visits" ON website_visits
FOR SELECT USING ((SELECT is_admin FROM users WHERE id = auth.uid()) = true);

-- lead_conversions: Sistema pode inserir, admins podem ver
ALTER TABLE lead_conversions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "system_insert_lead_conversions" ON lead_conversions
FOR INSERT WITH CHECK (true);
CREATE POLICY "admins_view_lead_conversions" ON lead_conversions
FOR SELECT USING ((SELECT is_admin FROM users WHERE id = auth.uid()) = true);
```

---

### Auditoria de Moderação

**Todas as ações de moderação** são registradas via `useAdminAudit`:

```typescript
await logAction({
  action: 'PLACE_UNDER_REVIEW', // ou 'APPROVE_AD', 'REJECT_AD'
  resourceType: 'announcement',
  resourceId: adId,
  oldValue: { status: 'PENDING' },
  newValue: { status: 'UNDER_REVIEW' },
  reason: 'Motivo fornecido pelo admin'
});
```

**Consulta de auditoria:**
```sql
SELECT * FROM admin_audit_logs 
WHERE resource_type = 'announcement'
ORDER BY created_at DESC
LIMIT 50;
```

---

## 📈 Integrações Necessárias

### 1. Google Analytics → `website_visits`

**Opção A: API do Google Analytics**
```typescript
// Exemplo: Função Edge no Supabase
import { createClient } from '@supabase/supabase-js';
import { BetaAnalyticsDataClient } from '@google-analytics/data';

const analyticsDataClient = new BetaAnalyticsDataClient();

Deno.serve(async (req) => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  const [response] = await analyticsDataClient.runReport({
    property: `properties/YOUR_GA4_PROPERTY_ID`,
    dateRanges: [{ startDate: 'yesterday', endDate: 'yesterday' }],
    metrics: [
      { name: 'sessions' },
      { name: 'activeUsers' },
      { name: 'screenPageViews' },
      { name: 'averageSessionDuration' }
    ]
  });

  const { data, error } = await supabase
    .from('website_visits')
    .insert({
      visit_date: yesterday.toISOString().split('T')[0],
      total_visits: response.rows[0].metricValues[0].value,
      unique_visitors: response.rows[0].metricValues[1].value,
      page_views: response.rows[0].metricValues[2].value,
      avg_session_duration: Math.floor(response.rows[0].metricValues[3].value)
    });

  return new Response(JSON.stringify({ success: !error }));
});
```

**Opção B: Manual (Temporário)**
```sql
-- Inserir manualmente (via SQL ou dashboard)
INSERT INTO website_visits (visit_date, total_visits, unique_visitors, page_views)
VALUES ('2026-03-12', 1500, 1200, 4500);
```

---

### 2. Cliques em Contato → `lead_conversions`

**Integração no frontend (AdDetailView.tsx):**

```typescript
import { supabase } from '../src/lib/supabaseClient';

const handleWhatsAppClick = async () => {
  // Registrar conversão
  await supabase.rpc('log_lead_conversion', {
    p_announcement_id: announcementId,
    p_viewer_id: user?.id || null,
    p_conversion_type: 'whatsapp_click'
  });

  // Abrir WhatsApp
  window.open(`https://wa.me/55${announcement.whatsapp}`, '_blank');
};
```

**Tipos de conversão:**
- `whatsapp_click`: Clique no botão WhatsApp
- `phone_click`: Clique no telefone
- `email_click`: Clique no email
- `message_sent`: Mensagem enviada via chat interno

---

### 3. Novas Assinaturas → `subscription_history`

**Automático via Triggers** (já configurado):
- Quando `user_subscriptions` é criada → Trigger registra no histórico
- Quando `user_subscriptions` é atualizada → Trigger registra mudança

**Sem necessidade de código adicional!**

---

## 🧪 Testes Recomendados

### Teste 1: Verificar MRR
```sql
SELECT * FROM v_mrr_monthly ORDER BY month_year DESC LIMIT 3;
```
**Resultado esperado:** MRR dos últimos 3 meses

---

### Teste 2: Verificar CAC
```sql
SELECT * FROM v_cac_monthly ORDER BY month_year DESC LIMIT 1;
```
**Resultado esperado:** CAC do mês atual

---

### Teste 3: Inserir Custo de Marketing via Dashboard
1. Abrir Dashboard Admin
2. Ir até card "CAC"
3. Digitar `5000.00` no input
4. Clicar em **Salvar**
5. Verificar que CAC foi atualizado

---

### Teste 4: Colocar Anúncio em Análise
1. Abrir Dashboard Admin → Fila de Moderação
2. Selecionar anúncio PENDING
3. Clicar em 🔍 (Colocar em Análise)
4. Inserir motivo: "Verificar autenticidade das imagens"
5. Confirmar
6. Verificar:
   - Status mudou para UNDER_REVIEW
   - Auditoria foi registrada:
     ```sql
     SELECT * FROM admin_audit_logs 
     WHERE action = 'PLACE_UNDER_REVIEW' 
     ORDER BY created_at DESC LIMIT 1;
     ```

---

## 📊 Queries Úteis para Análise

### 1. MRR por Mês (últimos 6 meses)
```sql
SELECT 
  month_year,
  total_mrr,
  active_subscribers,
  new_mrr,
  expansion_mrr,
  churn_mrr
FROM v_mrr_monthly
ORDER BY month_year DESC
LIMIT 6;
```

---

### 2. Top 5 Planos por Receita
```sql
SELECT 
  plan_name,
  active_users,
  total_mrr,
  mrr_percentage
FROM v_revenue_by_plan
ORDER BY total_mrr DESC
LIMIT 5;
```

---

### 3. Taxa de Churn Mensal (últimos 6 meses)
```sql
SELECT 
  month_year,
  starting_mrr,
  churned_mrr,
  churn_rate_percentage
FROM v_churn_monthly
ORDER BY month_year DESC
LIMIT 6;
```

---

### 4. Histórico de Mudanças de Plano de um Usuário
```sql
SELECT 
  plan_name,
  event_type,
  status,
  mrr_contribution,
  period_start,
  period_end,
  reason
FROM subscription_history
WHERE user_id = 'USER_UUID_AQUI'
ORDER BY created_at DESC;
```

---

### 5. Leads Gerados por Anúncio (Top 10)
```sql
SELECT 
  a.title,
  a.views,
  COUNT(lc.id) AS total_leads,
  ROUND(COUNT(lc.id) * 100.0 / NULLIF(a.views, 0), 2) AS conversion_rate
FROM announcements a
LEFT JOIN lead_conversions lc ON a.id = lc.announcement_id
WHERE a.status = 'ACTIVE'
GROUP BY a.id, a.title, a.views
ORDER BY total_leads DESC
LIMIT 10;
```

---

## 🔄 Manutenção e Cron Jobs

### Recomendações:

#### 1. Limpeza de Dados Antigos (Trimestral)
```sql
-- Deletar conversões de leads com mais de 1 ano
DELETE FROM lead_conversions 
WHERE created_at < NOW() - INTERVAL '1 year';

-- Arquivar histórico de assinaturas antigo (se necessário)
-- (Não recomendado deletar, pois afetaria cálculos retroativos)
```

#### 2. Atualizar Visitas Diariamente (Cron Job)
```sql
-- Via Edge Function ou script automatizado
-- Executar todo dia às 2h da manhã
-- Buscar dados do GA4 e inserir em website_visits
```

#### 3. Recalcular MRR Mensalmente
```sql
-- Não é necessário! As views são calculadas dinamicamente
-- Mas você pode criar snapshots:
CREATE TABLE mrr_snapshots AS
SELECT * FROM v_mrr_monthly WHERE month_year = DATE_TRUNC('month', NOW());
```

---

## ⚠️ Avisos Importantes

### 1. Tabelas de Histórico são CRÍTICAS
- **NUNCA deletar** dados de `subscription_history`
- **Motivo:** Afetar cálculos de MRR, Churn e receita retroativos
- **Retenção:** Manter histórico de pelo menos 2 anos

---

### 2. Auditoria é OBRIGATÓRIA
- Toda ação de moderação (aprovar, rejeitar, análise) **DEVE** registrar auditoria
- Motivo **OBRIGATÓRIO** ao colocar em análise

---

### 3. Visitas Precisam de Integração
- Tabela `website_visits` precisa ser alimentada por:
  - Google Analytics 4 (recomendado)
  - Sistema próprio de tracking
  - **Sem dados nesta tabela, o KPI "Visitas Mensais" ficará zerado**

---

### 4. Leads Precisam de Tracking
- Implementar `log_lead_conversion()` em:
  - Botões de WhatsApp
  - Botões de Telefone
  - Botões de Email
  - Chat interno
- **Sem tracking, o KPI "Taxa de Conversão de Leads" ficará zerado**

---

## 📚 Arquivos Criados/Modificados

### Arquivos Criados:
1. **`sql/BI_DASHBOARD_TABLES.sql`** (950+ linhas)
   - 4 tabelas novas
   - 6 views de análise
   - 2 funções utilitárias
   - 4 triggers automáticos
   - Políticas RLS

2. **`pages/admin/AdminDashboardOverview.tsx`** (1.100+ linhas)
   - Dashboard BI completo
   - 14 métricas implementadas
   - Interface interativa
   - Fila de moderação

3. **`docs/BI_DASHBOARD_DOCUMENTATION.md`** (Este arquivo - 800+ linhas)
   - Documentação completa
   - Guia de instalação
   - Fórmulas detalhadas
   - Queries úteis

### Arquivos em Backup:
- **`pages/admin/AdminDashboardOverview_OLD_BACKUP.tsx`**: Dashboard antigo (backup)

---

## ✅ Checklist de Implementação

- [x] Criar tabela `subscription_history`
- [x] Criar tabela `marketing_costs`
- [x] Criar tabela `website_visits`
- [x] Criar tabela `lead_conversions`
- [x] Criar 6 views de análise
- [x] Configurar triggers automáticos
- [x] Aplicar políticas RLS
- [x] Implementar dashboard BI completo
- [x] Implementar 6 KPIs financeiros
- [x] Implementar 4 KPIs de marketing
- [x] Implementar 2 KPIs de tráfego
- [x] Implementar fila de moderação
- [x] Adicionar input manual de CAC
- [x] Adicionar status UNDER_REVIEW
- [x] Integrar auditoria obrigatória
- [ ] **Executar SQL no Supabase** (VOCÊ PRECISA FAZER)
- [ ] **Popular histórico de assinaturas** (VOCÊ PRECISA FAZER)
- [ ] **Inserir custo de marketing inicial** (VOCÊ PRECISA FAZER)
- [ ] **Integrar Google Analytics** (RECOMENDADO)
- [ ] **Adicionar tracking de leads** (RECOMENDADO)

---

## 🆘 Troubleshooting

### Problema 1: "View v_mrr_monthly não retorna dados"
**Causa:** Tabela `subscription_history` está vazia

**Solução:** Executar migração de dados históricos:
```sql
-- Copiar script da seção "PASSO 2: Popular Histórico"
```

---

### Problema 2: "CAC mostra R$ 0,00"
**Causa:** Nenhum custo de marketing cadastrado

**Solução:** Inserir custo via dashboard ou SQL:
```sql
INSERT INTO marketing_costs (month_year, total_cost)
VALUES ('2026-03-01', 5000.00);
```

---

### Problema 3: "Taxa de Conversão de Leads mostra 0%"
**Causa:** `lead_conversions` está vazia (sem tracking)

**Solução:** Implementar `log_lead_conversion()` nos botões de contato:
```typescript
await supabase.rpc('log_lead_conversion', {
  p_announcement_id: announcementId,
  p_viewer_id: user?.id || null,
  p_conversion_type: 'whatsapp_click'
});
```

---

### Problema 4: "Visitas Mensais mostra 0"
**Causa:** `website_visits` está vazia (sem integração)

**Solução:** Integrar Google Analytics ou inserir dados manualmente:
```sql
INSERT INTO website_visits (visit_date, total_visits, unique_visitors, page_views)
VALUES ('2026-03-12', 1500, 1200, 4500);
```

---

## 📞 Suporte

Para dúvidas ou problemas:
1. Verificar esta documentação primeiro
2. Consultar queries de teste
3. Verificar logs do Supabase (SQL Editor → Logs)
4. Consultar auditoria: `SELECT * FROM admin_audit_logs ORDER BY created_at DESC LIMIT 50;`

---

**Status:** ✅ Implementação 100% completa (código)
**Próximo Passo:** Executar SQL no Supabase e popular dados iniciais

---

**Última Atualização:** 12/03/2026
**Versão:** 1.0.0
