# 🎯 Radar de Oportunidades - Documentação Completa

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura do Sistema](#arquitetura-do-sistema)
3. [Instalação e Configuração](#instalação-e-configuração)
4. [Funcionalidades por Plano](#funcionalidades-por-plano)
5. [Como Funciona](#como-funciona)
6. [Guia de Uso](#guia-de-uso)
7. [API e Hooks](#api-e-hooks)
8. [Troubleshooting](#troubleshooting)

---

## 🎯 Visão Geral

O **Radar de Oportunidades** é um sistema inteligente de alertas que notifica usuários automaticamente quando novos anúncios correspondem aos critérios configurados. Utiliza geolocalização, filtros avançados e matching em tempo real.

### Principais Recursos

- ✅ **Alertas Personalizados**: Configure múltiplos alertas com critérios específicos
- 🌍 **Geolocalização**: Busca por raio de distância em quilômetros
- 💰 **Filtro de Preço**: Defina faixa de preço mínima e máxima
- 🔍 **Palavras-chave**: Busca por termos específicos no título/descrição
- 📊 **Match Score**: Sistema de pontuação de relevância (0-100%)
- 🔔 **Notificações em Tempo Real**: Via Realtime Subscriptions do Supabase
- 🎨 **Interface Moderna**: Com abas de Configurações e Oportunidades

---

## 🏗️ Arquitetura do Sistema

### Componentes Principais

```
┌─────────────────┐
│  RadarView.tsx  │ ← Interface do usuário
└────────┬────────┘
         │
┌────────▼────────┐
│  useRadar.ts    │ ← Hook de gerenciamento
└────────┬────────┘
         │
┌────────▼────────┐
│  Supabase DB    │ ← Tabelas e triggers
└────────┬────────┘
         │
┌────────▼────────┐
│ Edge Function   │ ← Matching assíncrono
└─────────────────┘
```

### Tabelas do Banco de Dados

1. **`opportunity_alerts`**: Armazena alertas configurados pelos usuários
2. **`opportunity_matches`**: Registra matches encontrados
3. **`users`**: Estendida com `latitude`, `longitude`, `geo_updated_at`
4. **`announcements`**: Estendida com `latitude`, `longitude`, `geo_updated_at`
5. **`v_radar_stats`**: View com estatísticas agregadas

---

## 🔧 Instalação e Configuração

### Passo 1: Executar Scripts SQL

1. Acesse o [Supabase Dashboard](https://app.supabase.com)
2. Vá em **SQL Editor**
3. Execute os scripts na ordem:

```bash
# 1. Criar estrutura de tabelas
sql/CREATE_RADAR_TABLES.sql

# 2. Configurar Edge Function e Triggers
sql/CREATE_RADAR_EDGE_FUNCTION.sql
```

### Passo 2: Configurar Edge Function (Opcional)

Se optar por usar Edge Functions para matching assíncrono:

```bash
# Instalar Supabase CLI
npm install -g supabase

# Fazer login
supabase login

# Criar função
supabase functions new radar-matcher

# Copiar código da Edge Function do arquivo CREATE_RADAR_EDGE_FUNCTION.sql

# Deploy
supabase functions deploy radar-matcher
```

### Passo 3: Configurar Variáveis de Ambiente

No Supabase Dashboard → **Settings** → **Database** → **Configuration**:

```
app.settings.edge_function_url = https://seu-projeto.supabase.co/functions/v1
app.settings.service_role_key = sua-service-role-key
```

### Passo 4: Habilitar RLS (Row Level Security)

As policies já estão configuradas nos scripts. Verifique se estão ativas:

```sql
SELECT tablename, policyname 
FROM pg_policies 
WHERE tablename IN ('opportunity_alerts', 'opportunity_matches');
```

---

## 🎨 Funcionalidades por Plano

### 🌱 Seed (Gratuito)
- ❌ Sem acesso ao Radar
- Incentivo para upgrade

### 🌾 Start Agro
- ✅ **1 alerta**
- ✅ Filtro por **Estado**
- ❌ Sem filtro de raio
- ❌ Sem palavras-chave
- ❌ Sem filtro de preço

### ⚡ Essencial
- ✅ **5 alertas**
- ✅ Filtro por **Estado**
- ✅ **Palavras-chave** no título/descrição
- ✅ **Faixa de preço** (mín/máx)
- ❌ Sem filtro de raio

### 👑 Destaque (Premium)
- ✅ **Alertas ilimitados**
- ✅ Filtro por **Estado**
- ✅ **Raio de distância** (km)
- ✅ **Palavras-chave**
- ✅ **Faixa de preço**
- ✅ **Notificações prioritárias**

Limites configurados em: `src/hooks/useRadar.ts` (constante `PLAN_LIMITS`)

---

## ⚙️ Como Funciona

### 1. Criação de Alerta

```
Usuário cria alerta → useRadar → Supabase
                                   ↓
                          opportunity_alerts
```

### 2. Publicação de Anúncio

```
Novo anúncio publicado → Trigger PostgreSQL → Edge Function
                                                ↓
                                      Processa matching
                                                ↓
                                      opportunity_matches
```

### 3. Sistema de Pontuação (Match Score)

```typescript
Score Base: 0
+ 30 pontos: Categoria correta
+ 20 pontos: Estado correto
+ 25 pontos: Dentro do raio de distância
+ 15 pontos: Preço dentro da faixa
+ 10 pontos/palavra: Palavras-chave encontradas

Mínimo para match: 50 pontos
Máximo: 100 pontos
```

### 4. Critérios de Matching

Um anúncio dá **match** se:
- ✅ Categoria corresponde (se especificada)
- ✅ Estado corresponde (se especificado)
- ✅ Está dentro do raio (se configurado)
- ✅ Preço está na faixa (se configurada)
- ✅ Contém palavras-chave (se configuradas)

**Importante**: Se um critério obrigatório não for atendido, o anúncio é descartado.

---

## 📖 Guia de Uso

### Para o Usuário Final

#### 1. Criar um Alerta

1. Acesse **Minha Conta** → **Radar de Oportunidades**
2. Clique na aba **Configurações**
3. Clique em **Novo Alerta**
4. Preencha os campos:
   - **Nome**: Ex: "Tratores John Deere em SP"
   - **Categoria**: Selecione (opcional)
   - **Estado**: Selecione (opcional)
   - **Raio**: km (apenas plano Destaque)
   - **Preço Mínimo/Máximo**: R$ (planos Essencial e Destaque)
   - **Palavras-chave**: Separadas por vírgula (planos Essencial e Destaque)
5. Clique em **Criar Alerta**

#### 2. Gerenciar Alertas

- **Pausar/Ativar**: Clique no ícone de play/pause
- **Editar**: Clique no ícone de lápis
- **Excluir**: Clique no ícone de lixeira

#### 3. Ver Oportunidades

1. Acesse a aba **Oportunidades**
2. Veja cards de anúncios que deram match
3. Badge **NOVO** indica não visualizado
4. **Score** mostra relevância (0-100%)
5. Clique em **Ver Detalhes** para abrir o anúncio

---

## 💻 API e Hooks

### Hook Principal: `useRadar`

```typescript
import { useRadar } from '../src/hooks/useRadar';

function MyComponent() {
  const {
    alerts,              // Array de alertas
    matches,             // Array de matches
    stats,               // Estatísticas
    isLoading,           // Estado de carregamento
    createAlert,         // Função para criar
    updateAlert,         // Função para atualizar
    deleteAlert,         // Função para deletar
    toggleAlertStatus,   // Ativar/Pausar
    markMatchAsViewed,   // Marcar como visto
    dismissMatch,        // Descartar match
    getPlanLimits        // Obter limites do plano
  } = useRadar();

  // Usar os dados...
}
```

### Serviço de Geolocalização: `geoService`

```typescript
import { 
  cepToCoordinates,
  calculateDistance,
  updateUserCoordinates 
} from '../services/geoService';

// Exemplo: Converter CEP em coordenadas
const coords = await cepToCoordinates('12345-678');
// { latitude: -23.5505, longitude: -46.6333 }

// Exemplo: Calcular distância
const distanceKm = calculateDistance(lat1, lon1, lat2, lon2);
// 45.7 (km)

// Exemplo: Atualizar coordenadas do usuário
await updateUserCoordinates(userId, userCep, supabase);
```

### Tipos TypeScript

```typescript
interface OpportunityAlert {
  id: string;
  user_id: string;
  name: string;
  category_id: string | null;
  subcategory_id: string | null;
  state: string | null;
  radius_km: number;
  min_price: number | null;
  max_price: number | null;
  keywords: string[];
  status: 'ativo' | 'pausado';
  created_at: string;
  updated_at: string;
  last_match_at: string | null;
}

interface OpportunityMatch {
  id: string;
  alert_id: string;
  announcement_id: string;
  user_id: string;
  is_viewed: boolean;
  is_dismissed: boolean;
  match_score: number;
  match_reason: any;
  created_at: string;
  announcement?: {
    title: string;
    price: number;
    images: string[];
    city: string;
    state: string;
  };
}
```

---

## 🐛 Troubleshooting

### Problema: Alertas não estão gerando matches

**Possíveis causas:**

1. **Trigger não configurado**: Verifique se os triggers estão ativos
   ```sql
   SELECT * FROM pg_trigger WHERE tgname LIKE '%radar%';
   ```

2. **Edge Function não deployada**: Deploy a função ou use alternativa SQL
   ```bash
   supabase functions deploy radar-matcher
   ```

3. **Coordenadas não configuradas**: Certifique-se que CEPs foram convertidos
   ```sql
   SELECT id, cep, latitude, longitude FROM users WHERE latitude IS NULL;
   ```

### Problema: Geolocalização não funciona

**Soluções:**

1. **API ViaCEP está fora**: Verifique em [viacep.com.br](https://viacep.com.br)
2. **Nominatim rate limit**: Aguarde 1 segundo entre requests
3. **CEP inválido**: Valide formato (12345-678)

```typescript
if (!isValidCep(cep)) {
  throw new Error('CEP inválido');
}
```

### Problema: Usuário ultrapassou limite de alertas

**Verificação:**

```typescript
const limits = getPlanLimits();
console.log('Alertas permitidos:', limits.alerts);
console.log('Alertas criados:', alerts.length);
```

**Solução**: Fazer upgrade do plano

### Problema: Matches duplicados

**Causa**: Constraint UNIQUE não está ativa

**Solução**:
```sql
ALTER TABLE opportunity_matches 
ADD CONSTRAINT unique_alert_announcement 
UNIQUE(alert_id, announcement_id);
```

---

## 📊 Monitoramento e Métricas

### Queries Úteis

```sql
-- Alertas mais ativos (que mais geram matches)
SELECT 
  oa.name,
  oa.user_id,
  COUNT(om.id) as total_matches
FROM opportunity_alerts oa
LEFT JOIN opportunity_matches om ON om.alert_id = oa.id
WHERE oa.created_at > NOW() - INTERVAL '30 days'
GROUP BY oa.id
ORDER BY total_matches DESC
LIMIT 10;

-- Taxa de visualização de matches
SELECT 
  COUNT(*) as total_matches,
  COUNT(*) FILTER (WHERE is_viewed = true) as viewed,
  ROUND(COUNT(*) FILTER (WHERE is_viewed = true)::DECIMAL / COUNT(*) * 100, 2) as view_rate
FROM opportunity_matches
WHERE created_at > NOW() - INTERVAL '7 days';

-- Distribuição de match scores
SELECT 
  CASE 
    WHEN match_score >= 90 THEN '90-100%'
    WHEN match_score >= 80 THEN '80-89%'
    WHEN match_score >= 70 THEN '70-79%'
    WHEN match_score >= 60 THEN '60-69%'
    ELSE '50-59%'
  END as score_range,
  COUNT(*) as count
FROM opportunity_matches
GROUP BY score_range
ORDER BY score_range DESC;
```

---

## 🚀 Roadmap Futuro

### Versão 2.0
- [ ] Notificações via WhatsApp (plano Destaque)
- [ ] Push notifications no navegador
- [ ] Email digest diário
- [ ] Machine Learning para melhorar match score
- [ ] Sugestões inteligentes de alertas

### Versão 3.0
- [ ] API pública para integrações
- [ ] Webhooks customizados
- [ ] Alertas colaborativos (grupos)
- [ ] Histórico de preços

---

## 📝 Changelog

### v1.0.0 (09/03/2026)
- ✅ Implementação inicial
- ✅ Sistema de alertas com múltiplos filtros
- ✅ Geolocalização via ViaCEP + Nominatim
- ✅ Match score inteligente
- ✅ Interface com abas
- ✅ Regras por plano (tiers)
- ✅ Real-time subscriptions
- ✅ RLS policies

---

## 👥 Suporte

Para dúvidas ou problemas:
- 📧 Email: suporte@bwagro.com.br
- 💬 Chat: Disponível na plataforma
- 📖 Docs: [docs.bwagro.com.br](https://docs.bwagro.com.br)

---

**Desenvolvido por BWAGRO** 🌾
