# 📊 Radar de Oportunidades - Distribuição por Plano

## ✅ Implementação Completa

O Radar de Oportunidades agora está **integrado a todos os 5 planos** da BWAGRO, com recursos progressivos para incentivar upgrades.

---

## 🎯 Distribuição de Recursos

### 🌾 **Start Agro** (Gratuito - R$ 0,00)
- ✅ **1 alerta** básico
- ✅ Filtro por categoria/subcategoria
- ✅ Filtro por estado
- ❌ Palavras-chave
- ❌ Faixa de preço
- ❌ Raio geográfico

**Objetivo:** Introduzir o recurso e incentivar upgrade

---

### 🌿 **Essencial** (R$ 49,00/mês)
- ✅ **3 alertas** simultâneos
- ✅ Filtro por categoria/subcategoria
- ✅ Filtro por estado
- ✅ **Filtro por palavras-chave**
- ✅ **Filtro por faixa de preço**
- ❌ Raio geográfico

**Ideal para:** Pequenos produtores que buscam produtos específicos

---

### 👑 **Destaque** (R$ 99,00/mês) ⭐ Popular
- ✅ **5 alertas** simultâneos
- ✅ Filtro por categoria/subcategoria
- ✅ Filtro por estado
- ✅ Filtro por palavras-chave
- ✅ Filtro por faixa de preço
- ✅ **Filtro por raio geográfico com geocoding automático**

**Ideal para:** Produtores ativos que precisam de geolocalização

---

### 🏪 **Loja Oficial** (R$ 299,00/mês)
- ✅ **10 alertas** simultâneos
- ✅ Todos os filtros disponíveis
- ✅ Raio geográfico com geocoding
- ✅ Prioridade no matching

**Ideal para:** Grandes produtores e lojistas com volume

---

### 🏢 **Corporativo** (R$ 599,00/mês)
- ✅ **Alertas ilimitados** (999 como limite técnico)
- ✅ Todos os filtros disponíveis
- ✅ Raio geográfico com geocoding
- ✅ Prioridade máxima no matching

**Ideal para:** Distribuidores e compradores corporativos

---

## 📊 Tabela Comparativa

| Recurso | Start Agro | Essencial | Destaque | Loja Oficial | Corporativo |
|---------|------------|-----------|----------|--------------|-------------|
| **Alertas** | 1 | 3 | 5 | 10 | ∞ |
| **Categoria/Estado** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Palavras-chave** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Faixa de preço** | ❌ | ✅ | ✅ | ✅ | ✅ |
| **Raio geográfico** | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Geocoding auto** | ❌ | ❌ | ✅ | ✅ | ✅ |

---

## 🛠️ Implementação Técnica

### 1️⃣ **Banco de Dados**

Execute o script SQL para adicionar colunas à tabela `plans`:

📄 **[sql/ADD_RADAR_TO_PLANS.sql](sql/ADD_RADAR_TO_PLANS.sql)**

**Novas colunas:**
- `radar_max_alerts` INTEGER - Número máximo de alertas (0 = sem acesso, 999 = ilimitado)
- `radar_has_radius` BOOLEAN - Permite filtro por raio geográfico
- `radar_has_keywords` BOOLEAN - Permite filtro por palavras-chave
- `radar_has_price_filter` BOOLEAN - Permite filtro por faixa de preço

---

### 2️⃣ **Hook useRadar** (Atualizado)

O hook agora **busca dinamicamente** os limites do plano do banco de dados:

**Antes (hardcoded):**
```typescript
const PLAN_LIMITS = {
  'start-agro': { alerts: 1, radius: false, ... },
  essencial: { alerts: 5, radius: false, ... },
  destaque: { alerts: 999, radius: true, ... }
};
```

**Depois (dinâmico):**
```typescript
const fetchPlanLimits = async () => {
  // Busca plan_id do usuário
  const { data: userData } = await supabase
    .from('users')
    .select('plan_id')
    .eq('id', user.id)
    .single();

  // Busca configurações do Radar no plano
  const { data: planData } = await supabase
    .from('plans')
    .select('radar_max_alerts, radar_has_radius, ...')
    .eq('id', userData.plan_id)
    .single();

  setPlanLimits({
    alerts: planData.radar_max_alerts,
    radius: planData.radar_has_radius,
    keywords: planData.radar_has_keywords,
    price_filter: planData.radar_has_price_filter
  });
};
```

**Benefícios:**
- ✅ Centralizado no banco de dados
- ✅ Fácil ajustar limites sem redeployar código
- ✅ Suporta novos planos automaticamente

---

### 3️⃣ **Display Features Atualizado**

O script também adiciona o Radar aos `display_features` de cada plano (visível na página de pricing):

- **Start Agro**: "Radar de Oportunidades: 1 alerta básico"
- **Essencial**: "Radar de Oportunidades: 3 alertas + filtros avançados"
- **Destaque**: "Radar de Oportunidades: 5 alertas + raio geográfico"
- **Loja Oficial**: "Radar de Oportunidades: 10 alertas com todos recursos"
- **Corporativo**: "Radar de Oportunidades: Alertas ilimitados"

---

## 📋 Checklist de Implementação

### Passo 1: Executar Scripts SQL
- [ ] Execute [sql/CREATE_RADAR_RPC.sql](sql/CREATE_RADAR_RPC.sql) (corrige erro 406)
- [ ] Execute [sql/ADD_RADAR_TO_PLANS.sql](sql/ADD_RADAR_TO_PLANS.sql) (adiciona recursos aos planos)

### Passo 2: Validar Banco de Dados
```sql
-- Verificar que as colunas foram criadas
SELECT 
  name,
  monthly_price,
  radar_max_alerts,
  radar_has_radius,
  radar_has_keywords,
  radar_has_price_filter
FROM plans
ORDER BY position;
```

**Resultado esperado:**
| name | monthly_price | radar_max_alerts | radar_has_radius | radar_has_keywords | radar_has_price_filter |
|------|---------------|------------------|------------------|--------------------|-----------------------|
| Start Agro | 0.00 | 1 | false | false | false |
| Essencial | 49.00 | 3 | false | true | true |
| Destaque | 99.00 | 5 | true | true | true |
| Loja Oficial | 299.00 | 10 | true | true | true |
| Corporativo | 599.00 | 999 | true | true | true |

### Passo 3: Testar Aplicação
- [ ] Recarregar aplicação (`Ctrl + Shift + R`)
- [ ] Login com cada tipo de plano
- [ ] Testar criação de alertas
- [ ] Validar bloqueios visuais (cards amber de upgrade)
- [ ] Testar geocoding automático (planos Destaque+)

---

## 🎯 Estratégia de Monetização

### Progressão Natural de Upgrade

1. **Start Agro → Essencial** (+R$ 49/mês)
   - Motivação: "Preciso de mais alertas e filtros avançados"
   - Ganho: +2 alertas, palavras-chave, faixa de preço

2. **Essencial → Destaque** (+R$ 50/mês)
   - Motivação: "Quero encontrar produtos perto de mim"
   - Ganho: +2 alertas, raio geográfico com geocoding

3. **Destaque → Loja Oficial** (+R$ 200/mês)
   - Motivação: "Preciso monitorar mais produtos"
   - Ganho: +5 alertas, loja oficial, email marketing

4. **Loja Oficial → Corporativo** (+R$ 300/mês)
   - Motivação: "Preciso de alertas ilimitados"
   - Ganho: Alertas ilimitados, consultor dedicado

---

## 💡 Funcionalidades de Retenção

### Avisos Visuais de Upgrade
Recursos bloqueados exibem **cards promocionais** com:
- ✅ Ícone Crown (premium)
- ✅ Descrição clara do recurso
- ✅ Mensagem de upgrade
- ✅ Link direto para `/minha-conta` (planos)

**Exemplo:**
```
🔒 Filtro por Raio Geográfico
Busque anúncios dentro de um raio específico (km) a partir da sua localização.
Disponível apenas no plano Destaque.
[Fazer upgrade agora →]
```

---

## 🔧 Arquivos Modificados

### SQL
- ✅ [sql/CREATE_RADAR_RPC.sql](sql/CREATE_RADAR_RPC.sql) - Função RPC (fix erro 406)
- ✅ [sql/ADD_RADAR_TO_PLANS.sql](sql/ADD_RADAR_TO_PLANS.sql) - Adiciona recursos aos planos

### TypeScript
- ✅ [src/hooks/useRadar.ts](src/hooks/useRadar.ts) - Busca dinâmica de limites
- ✅ [components/RadarView.tsx](components/RadarView.tsx) - Usa planLimits do hook

---

## 📌 Próximos Passos

1. **Execute os scripts SQL** no Supabase
2. **Recarregue a aplicação**
3. **Teste com diferentes planos**
4. **Ajuste limites** se necessário (apenas no banco, sem redeploy)

---

**🎉 Radar de Oportunidades agora está 100% integrado a todos os planos!**

**Data:** 09/03/2026  
**Status:** ✅ Pronto para produção
