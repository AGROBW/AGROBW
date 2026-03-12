# 🚀 Dashboard de BI - Guia Rápido

## ✅ O que foi implementado?

Substituímos o dashboard administrativo anterior por um **Dashboard de BI profissional** com **14 métricas estratégicas**:

### 📊 14 Métricas Implementadas

#### 💰 Financeiro (6 KPIs)
1. **MRR** (Receita Recorrente Mensal)
2. **Ticket Médio** 
3. **Receita por Plano (%)** com gráfico de pizza
4. **Faturamento Total**
5. **Notas Fiscais**
6. **Taxa de Churn Financeiro (%)**

#### 🎯 Marketing (4 KPIs)
7. **CAC** (Custo Aquisição) com **input manual**
8. **Conversão Grátis→Pago (%)**
9. **Churn de Clientes (%)**
10. **Conversão de Leads (%)**

#### 📈 Tráfego (2 KPIs)
11. **Anúncios Ativos**
12. **Visitas Mensais**

#### ⚠️ Moderação (2 funcionalidades)
13. **Dashboard de Análise** (filtros + busca)
14. **Colocar em Análise** (status UNDER_REVIEW + auditoria)

---

## ⚡ Instalação Rápida (5 minutos)

### PASSO 1: Executar SQL ⚠️ CRÍTICO

1. Abrir **Supabase SQL Editor**
2. Copiar conteúdo de [sql/BI_DASHBOARD_TABLES.sql](../sql/BI_DASHBOARD_TABLES.sql)
3. Colar e executar
4. Aguardar mensagem de sucesso

---

### PASSO 2: Popular Histórico de Assinaturas

```sql
-- Migrar assinaturas existentes para o histórico
INSERT INTO subscription_history (
  user_id, subscription_id, plan_id, plan_name, plan_monthly_price,
  event_type, status, period_start, period_end, mrr_contribution
)
SELECT 
  us.user_id,
  us.id,
  us.plan_id,
  p.name,
  p.monthly_price,
  CASE WHEN us.status = 'trialing' THEN 'trial_started' ELSE 'created' END,
  us.status,
  us.current_period_start,
  us.current_period_end,
  CASE WHEN us.status IN ('active', 'trialing') THEN p.monthly_price ELSE 0 END
FROM user_subscriptions us
JOIN plans p ON us.plan_id = p.id;
```

---

### PASSO 3: Inserir Custo de Marketing Inicial

```sql
-- Inserir custo de marketing do mês atual
INSERT INTO marketing_costs (month_year, total_cost)
VALUES ('2026-03-01', 5000.00); -- Ajustar valor conforme necessário
```

---

### PASSO 4: Testar Dashboard

1. Fazer login com usuário **admin**
2. Acessar `/admin`
3. Verificar que **4 blocos** carregam:
   - ✅ Bloco Financeiro (6 KPIs)
   - ✅ Bloco Marketing (4 KPIs)
   - ✅ Bloco Tráfego (2 KPIs)
   - ✅ Bloco Moderação (tabela)

---

## 🎯 Funcionalidades Principais

### 1. Input Manual de CAC
- **Localização:** Card "CAC" no bloco Marketing
- **Como usar:**
  1. Digitar custo de marketing mensal (ex: 5000.00)
  2. Clicar em **Salvar**
  3. CAC é recalculado automaticamente

---

### 2. Colocar Anúncio em Análise
- **Localização:** Fila de Moderação
- **Como usar:**
  1. Selecionar anúncio PENDING
  2. Clicar em 🔍 (Colocar em Análise)
  3. Inserir motivo (OBRIGATÓRIO)
  4. Confirmar
  5. Status muda para UNDER_REVIEW + auditoria registrada

---

### 3. Filtros de Moderação
- **Todos**: PENDING + UNDER_REVIEW
- **Pendentes**: Apenas PENDING
- **Em Análise**: Apenas UNDER_REVIEW

---

### 4. Busca de Anúncios
- Busca em tempo real por título ou nome do usuário

---

## 🗄️ Backend (4 novas tabelas)

1. **`subscription_history`**: Histórico de mudanças de planos (MRR retroativo)
2. **`marketing_costs`**: Custos de marketing mensais (CAC)
3. **`website_visits`**: Rastreamento de visitas diárias
4. **`lead_conversions`**: Conversões de leads (cliques em contato)

**Triggers automáticos:** Registram automaticamente mudanças de planos 🎉

---

## 📐 Fórmulas Principais

### MRR
```
MRR = Σ(planos ativos × preço mensal)
```

### CAC
```
CAC = Custo de Marketing / Novos Clientes Pagantes
```

### Churn Financeiro
```
Churn = (MRR Perdida / MRR Inicial) × 100
```

### Ticket Médio
```
Ticket Médio = MRR / Assinantes Ativos
```

---

## 🔍 Queries Úteis

### Verificar MRR Atual
```sql
SELECT * FROM v_mrr_monthly ORDER BY month_year DESC LIMIT 1;
```

### Verificar CAC
```sql
SELECT * FROM v_cac_monthly ORDER BY month_year DESC LIMIT 1;
```

### Top 5 Planos por Receita
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

## ⚠️ Avisos Importantes

### ❌ NUNCA deletar dados de `subscription_history`
**Motivo:** Afetaria cálculos de MRR, Churn e receita retroativos

---

### 🔐 Auditoria é OBRIGATÓRIA
Todas as ações de moderação **DEVEM** registrar auditoria via `useAdminAudit`

---

### 📊 Integrações Recomendadas

1. **Google Analytics → `website_visits`**
   - Para alimentar KPI "Visitas Mensais"
   - Sem dados = KPI mostra 0

2. **Tracking de Leads → `lead_conversions`**
   - Implementar em botões de WhatsApp, Telefone, Email
   - Sem tracking = "Taxa de Conversão de Leads" mostra 0%

---

## 🧪 Testes Rápidos

### Teste 1: Verificar MRR
```sql
SELECT * FROM v_mrr_monthly LIMIT 1;
```
**Resultado esperado:** MRR calculado ✅

---

### Teste 2: Atualizar CAC
1. Dashboard Admin → Card "CAC"
2. Digitar `5000.00`
3. Clicar em **Salvar**
4. Verificar CAC atualizado

---

### Teste 3: Colocar em Análise
1. Fila de Moderação
2. Selecionar anúncio PENDING
3. Clicar em 🔍
4. Inserir motivo
5. Verificar status UNDER_REVIEW

---

## 🆘 Troubleshooting

### Problema: "MRR mostra R$ 0,00"
**Solução:** Executar PASSO 2 (popular histórico de assinaturas)

---

### Problema: "CAC mostra R$ 0,00"
**Solução:** Executar PASSO 3 (inserir custo de marketing)

---

### Problema: "Visitas Mensais mostra 0"
**Solução:** Integrar Google Analytics ou inserir dados manualmente:
```sql
INSERT INTO website_visits (visit_date, total_visits, unique_visitors, page_views)
VALUES ('2026-03-12', 1500, 1200, 4500);
```

---

## 📚 Arquivos Criados

1. **`sql/BI_DASHBOARD_TABLES.sql`** (950 linhas) - Backend completo
2. **`pages/admin/AdminDashboardOverview.tsx`** (1.100 linhas) - Dashboard BI
3. **`pages/admin/AdminDashboardOverview_OLD_BACKUP.tsx`** - Backup do antigo
4. **`docs/BI_DASHBOARD_DOCUMENTATION.md`** - Documentação completa
5. **`docs/BI_DASHBOARD_QUICKSTART.md`** - Este guia rápido

---

## ✅ Checklist de Implementação

- [x] Criar tabelas e views SQL
- [x] Criar dashboard BI completo
- [x] Implementar 14 métricas
- [x] Adicionar input manual de CAC
- [x] Adicionar status UNDER_REVIEW
- [x] Integrar auditoria obrigatória
- [ ] **Executar SQL no Supabase** (VOCÊ)
- [ ] **Popular histórico de assinaturas** (VOCÊ)
- [ ] **Inserir custo inicial** (VOCÊ)
- [ ] **Integrar Google Analytics** (RECOMENDADO)
- [ ] **Adicionar tracking de leads** (RECOMENDADO)

---

## 🎉 Próximo Passo

**Executar PASSO 1 agora:** Abrir Supabase SQL Editor e executar [BI_DASHBOARD_TABLES.sql](../sql/BI_DASHBOARD_TABLES.sql)

---

**Documentação Completa:** [BI_DASHBOARD_DOCUMENTATION.md](BI_DASHBOARD_DOCUMENTATION.md)
**Status:** ✅ Código 100% completo
**Última Atualização:** 12/03/2026
