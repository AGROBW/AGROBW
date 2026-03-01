# Sistema de Travas de Plano e Créditos - BWAGRO

## ✅ Implementação Completa

Todas as funcionalidades solicitadas foram implementadas com sucesso:

### 1. Hook `useSubscription` 📊

**Arquivo:** `src/hooks/useSubscription.ts`

**Funcionalidades:**
- Busca assinatura ativa do usuário na tabela `user_subscriptions`
- Conta anúncios criados no período atual (desde `current_period_start`)
- Conta destaques de categoria e home usados no ciclo
- Verifica se está dentro do período de validade
- Fornece flags `canCreateAd`, `canApplyCategoryHighlight`, `canApplyHomeHighlight`
- Mensagens de erro personalizadas

**Uso:**
```typescript
const { 
  subscription, 
  usage, 
  canCreateAd, 
  canApplyCategoryHighlight, 
  canApplyHomeHighlight,
  adLimitMessage,
  refreshUsage 
} = useSubscription();
```

**Retorno:**
```typescript
{
  subscription: UserSubscription | null,
  usage: {
    adsUsed: number,
    adsLimit: number | null,
    categoryHighlightsUsed: number,
    categoryHighlightsLimit: number,
    homeHighlightsUsed: number,
    homeHighlightsLimit: number,
    isWithinPeriod: boolean,
    periodEndDate: Date | null,
    periodStartDate: Date | null
  },
  canCreateAd: boolean,
  canApplyCategoryHighlight: boolean,
  canApplyHomeHighlight: boolean,
  adLimitMessage: string,
  refreshUsage: () => Promise<void>
}
```

---

### 2. Tabela e RPC no Banco de Dados 🗄️

**Arquivo:** `sql/announcement_highlights.sql`

**Componentes:**

#### Tabela `announcement_highlights_history`
Registra todos os históricos de aplicação de destaques:
- `id`: UUID primary key
- `announcement_id`: Referência ao anúncio
- `user_id`: Referência ao usuário
- `highlight_type`: 'category' ou 'home'
- `applied_at`: Data/hora da aplicação
- `expires_at`: Data/hora de expiração
- `subscription_period_start`: Início do ciclo
- `subscription_period_end`: Fim do ciclo

#### Colunas adicionadas em `announcements`
- `highlight_category`: BOOLEAN (se tem destaque de categoria ativo)
- `highlight_category_until`: TIMESTAMPTZ (validade do destaque)
- `highlight_home`: BOOLEAN (se tem destaque na home ativo)
- `highlight_home_until`: TIMESTAMPTZ (validade do destaque)

#### RPC `apply_announcement_highlight`
**Parâmetros:**
- `p_announcement_id`: UUID do anúncio
- `p_highlight_type`: 'category' ou 'home'

**Validações:**
1. ✅ Verifica se usuário está autenticado
2. ✅ Verifica se anúncio existe e pertence ao usuário
3. ✅ Verifica se tem assinatura ativa
4. ✅ Verifica se ainda tem créditos disponíveis no ciclo
5. ✅ **REGRA DOS 15 DIAS:** Verifica se o anúncio já foi destacado nos últimos 15 dias
6. ✅ Atualiza campos de destaque no anúncio
7. ✅ Registra uso do crédito no histórico

**Retorno:**
```json
{
  "success": true,
  "message": "Destaque de categoria aplicado com sucesso!",
  "expires_at": "2026-03-15T10:30:00Z",
  "used": 2,
  "limit": 5,
  "remaining": 3
}
```

**Erros comuns:**
```json
{
  "success": false,
  "error": "Este anúncio já foi destacado nos últimos 15 dias. Aguarde o período mínimo.",
  "last_highlight_date": "2026-02-20T10:30:00Z",
  "available_after": "2026-03-07T10:30:00Z"
}
```

```json
{
  "success": false,
  "error": "Você já usou todos os 3 créditos de destaque de categoria deste ciclo. Créditos não são acumulativos.",
  "used": 3,
  "limit": 3
}
```

#### Função `cleanup_expired_highlights()`
Limpa automaticamente destaques expirados. Configure um cron job no Supabase para executar diariamente.

---

### 3. Modal de Confirmação de Destaque 🎨

**Arquivo:** `components/HighlightConfirmationModal.tsx`

**Funcionalidades:**
- Interface bonita com cores diferentes para categoria (azul) e home (verde)
- Exibe título e descrição do tipo de destaque
- **Alerta obrigatório:** Mostra regras sobre consumo de crédito, não-acumulação e regra dos 15 dias
- Contador em tempo real: "X de Y" créditos usados
- Barra de progresso visual do uso
- Botão desabilitado se não houver créditos restantes
- Loading state durante aplicação
- Toast de sucesso/erro com mensagens detalhadas
- Atualiza contadores automaticamente após sucesso

**Props:**
```typescript
{
  isOpen: boolean;
  onClose: () => void;
  announcementId: string;
  announcementTitle: string;
  highlightType: 'category' | 'home';
  onSuccess?: () => void;
}
```

**Uso:**
```typescript
import HighlightConfirmationModal from '../components/HighlightConfirmationModal';

const [showModal, setShowModal] = useState(false);
const [selectedAd, setSelectedAd] = useState<{id: string, title: string} | null>(null);
const [highlightType, setHighlightType] = useState<'category' | 'home'>('category');

<HighlightConfirmationModal
  isOpen={showModal}
  onClose={() => setShowModal(false)}
  announcementId={selectedAd?.id || ''}
  announcementTitle={selectedAd?.title || ''}
  highlightType={highlightType}
  onSuccess={() => {
    // Recarregar lista de anúncios
  }}
/>
```

---

### 4. Validação no AdCreationView 🚫

**Arquivo:** `pages/AdCreationView.tsx`

**Modificações:**

1. **Import adicionado:**
```typescript
import { useSubscription } from '../src/hooks/useSubscription';
import { AlertCircle } from 'lucide-react';
```

2. **Hook usado:**
```typescript
const { 
  subscription, 
  usage, 
  canCreateAd, 
  adLimitMessage, 
  refreshUsage 
} = useSubscription();
```

3. **Alerta visual na etapa REVIEW:**
Quando `!canCreateAd`, exibe um card vermelho com:
- Ícone de alerta
- Título: "Limite de anúncios atingido"
- Mensagem personalizada do plano
- Contador: "Anúncios usados neste ciclo: X de Y"
- Botão "Ver Planos" que redireciona para `/planos`

4. **Botão de publicar desabilitado:**
```typescript
<button
  onClick={async () => {
    if (!canCreateAd) {
      toast.error('Limite de anúncios atingido', {
        description: adLimitMessage
      });
      return;
    }
    await handleSubmitAd();
    await refreshUsage(); // Atualiza contadores
  }}
  disabled={isSubmitting || isUploadingImages || !canCreateAd}
>
  Publicar Anúncio Agora
</button>
```

---

### 5. Contadores no UserDashboard 📈

**Arquivo:** `pages/UserDashboardView.tsx`

**Modificações:**

1. **Imports adicionados:**
```typescript
import { TrendingUp, Package, Sparkles } from 'lucide-react';
import { useSubscription } from '../src/hooks/useSubscription';
```

2. **Hook usado:**
```typescript
const { subscription, usage, isLoading: subscriptionLoading } = useSubscription();
```

3. **Card "Plano Atual" redesenhado:**

Substituído o antigo card simples por um card completo com:

**Header:**
- Nome do plano atual
- Badge com nome do plano

**Três cards de uso:**

a) **Anúncios** (ícone Package, azul):
- Mostra "X de Y" ou "X de ∞" se ilimitado
- Barra de progresso:
  - Verde: uso normal (< 80%)
  - Amarela: alerta (80-99%)
  - Vermelha: limite atingido (100%)

b) **Destaques em Categoria** (ícone TrendingUp, azul):
- Mostra "X de Y"
- Barra de progresso azul/vermelha

c) **Destaques na Home** (ícone Sparkles, amarelo):
- Mostra "X de Y"
- Barra de progresso amarela/vermelha

**Footer:**
- Data de término do ciclo atual
- Aviso: "Créditos não utilizados serão resetados"
- Botão "Fazer Upgrade" → `/minha-conta/financeiro`

**Estados:**
- Loading: Skeletons animados
- Erro: Fallback gracioso
- Sem assinatura: Mostra plano "Start Agro" padrão

---

## 🎯 Regras de Negócio Implementadas

### ✅ Limite de Anúncios (max_ads)
- Conta anúncios criados desde `current_period_start`
- Compara com `plans.max_ads`
- Desabilita botão de publicação quando limite atingido
- Mensagem clara: "Você atingiu o limite de anúncios do seu plano [Nome]. Faça um upgrade..."

### ✅ Destaques (Intervalo de 15 dias)
- RPC verifica na tabela `announcement_highlights_history`
- Busca último destaque do mesmo tipo nos últimos 15 dias
- Retorna erro com data do último destaque e data disponível
- Modal exibe alerta: "Após aplicado, este anúncio só poderá ser destacado novamente em 15 dias"

### ✅ Créditos Não-Acumulativos
- Contador reseta quando `current_period_end` é atingido
- Busca histórico apenas entre `current_period_start` e `current_period_end`
- Modal exibe: "Créditos não são acumulativos"
- Dashboard mostra data de fim do ciclo com aviso de reset

### ✅ Ciclo de Créditos
- `current_period_start`: Início do ciclo (normalmente data de cobrança)
- `current_period_end`: Fim do ciclo (normalmente +30 dias)
- Dashboard mostra dias restantes
- Contadores são filtrados por período ativo

---

## 🔧 Como Usar

### 1. Executar SQL no Supabase

```bash
# No SQL Editor do Supabase Dashboard:
# Execute o arquivo: sql/announcement_highlights.sql
```

Isso criará:
- Tabela `announcement_highlights_history`
- Colunas de destaque em `announcements`
- RPC `apply_announcement_highlight`
- Função `cleanup_expired_highlights`

### 2. Configurar Cron Job (Opcional)

No Supabase Dashboard:
1. Vá em "Database" → "Cron Jobs"
2. Crie um novo job:
   - **Nome:** Cleanup Expired Highlights
   - **Schedule:** `0 2 * * *` (todo dia às 2h da manhã)
   - **SQL:** `SELECT cleanup_expired_highlights();`

### 3. Adicionar Botões de Destaque nos Anúncios

No componente `AdsDashboard` ou onde gerencia anúncios:

```typescript
import HighlightConfirmationModal from '../components/HighlightConfirmationModal';
import { useSubscription } from '../src/hooks/useSubscription';

const MyAdsComponent = () => {
  const { canApplyCategoryHighlight, canApplyHomeHighlight } = useSubscription();
  const [showModal, setShowModal] = useState(false);
  const [selectedAd, setSelectedAd] = useState<any>(null);
  const [highlightType, setHighlightType] = useState<'category' | 'home'>('category');

  const handleHighlightClick = (ad: any, type: 'category' | 'home') => {
    setSelectedAd(ad);
    setHighlightType(type);
    setShowModal(true);
  };

  return (
    <>
      <div>
        {ads.map(ad => (
          <div key={ad.id}>
            <h3>{ad.title}</h3>
            <button
              onClick={() => handleHighlightClick(ad, 'category')}
              disabled={!canApplyCategoryHighlight}
            >
              Destacar na Categoria
            </button>
            <button
              onClick={() => handleHighlightClick(ad, 'home')}
              disabled={!canApplyHomeHighlight}
            >
              Destacar na Home
            </button>
          </div>
        ))}
      </div>

      <HighlightConfirmationModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        announcementId={selectedAd?.id || ''}
        announcementTitle={selectedAd?.title || ''}
        highlightType={highlightType}
        onSuccess={() => {
          // Recarregar lista de anúncios
        }}
      />
    </>
  );
};
```

---

## 📊 Estrutura de Dados

### Tabela `plans`
```sql
- max_ads: INT (ex: 2, 5, 20, NULL para ilimitado)
- category_highlights_count: INT (ex: 0, 3, 10)
- category_highlight_days: INT (dias de validade, ex: 7, 15, 30)
- home_highlight_count: INT (ex: 0, 1, 5)
- home_highlight_days: INT (dias de validade, ex: 7, 15, 30)
```

### Tabela `user_subscriptions`
```sql
- user_id: UUID
- plan_id: UUID (FK para plans)
- status: TEXT ('active', 'trialing', 'past_due', 'canceled', 'expired')
- current_period_start: TIMESTAMPTZ
- current_period_end: TIMESTAMPTZ
```

### Tabela `announcement_highlights_history` (NOVA)
```sql
- id: UUID
- announcement_id: UUID (FK para announcements)
- user_id: UUID (FK para users)
- highlight_type: TEXT ('category' | 'home')
- applied_at: TIMESTAMPTZ
- expires_at: TIMESTAMPTZ
- subscription_period_start: TIMESTAMPTZ
- subscription_period_end: TIMESTAMPTZ
```

---

## 🧪 Testes Recomendados

### 1. Teste de Limite de Anúncios
1. Crie usuário de teste com plano "Start Agro" (max_ads = 2)
2. Publique 2 anúncios
3. Tente publicar o 3º → deve mostrar alerta vermelho
4. Botão "Publicar" deve estar desabilitado
5. Dashboard deve mostrar "2 de 2"

### 2. Teste de Destaque (Regra dos 15 dias)
1. Aplique destaque de categoria em um anúncio
2. Tente aplicar novamente → RPC deve retornar erro
3. Aguarde 15 dias (ou altere manualmente `applied_at`)
4. Tente novamente → deve funcionar

### 3. Teste de Créditos Não-Acumulativos
1. Use 2 de 5 créditos de categoria no ciclo atual
2. Altere `current_period_end` para ontem (simular fim de ciclo)
3. Dashboard deve resetar contadores
4. Deve mostrar "0 de 5" novamente

### 4. Teste de Limite de Créditos
1. Usuário com 3 créditos de categoria
2. Use os 3 créditos em diferentes anúncios
3. Tente usar o 4º → modal deve mostrar erro
4. Dashboard deve mostrar "3 de 3" (barra vermelha)

---

## 🎨 UI/UX Destacada

### AdCreationView
- ❌ **Alerta vermelho** quando limite atingido
- 🔒 **Botão desabilitado** `disabled={!canCreateAd}`
- 📊 **Contador em tempo real**
- 🔗 **Link direto** para página de planos

### Modal de Destaque
- 🎨 **Cores distintas:** Azul (categoria), Verde (home)
- ⚠️ **Alerta amarelo:** Regras obrigatórias
- 📊 **Contador visual:** Barra de progresso
- ✅ **Feedback imediato:** Toasts de sucesso/erro

### Dashboard
- 🎯 **Três cards de uso:** Anúncios, Categoria, Home
- 📈 **Barras coloridas:** Verde/Amarela/Vermelha baseado em uso
- 📅 **Info de ciclo:** Data de término visível
- ⚠️ **Aviso de reset:** Créditos não-acumulativos

---

## 🚀 Próximos Passos

1. ✅ **Executar SQL:** `sql/announcement_highlights.sql` no Supabase
2. ✅ **Testar criação de anúncio** com limite
3. ✅ **Configurar cron job** para limpeza de destaques
4. 🔜 **Adicionar botões de destaque** na listagem de anúncios do usuário
5. 🔜 **Integrar destaques** na exibição pública (Home e Categorias)
6. 🔜 **Dashboard analytics** de uso de destaques

---

## 📝 Notas Importantes

- **Créditos resetam automaticamente** quando o ciclo termina (baseado nas queries que filtram por período)
- **Regra dos 15 dias é rígida:** Não há override, mesmo que mude de plano
- **Planos com `max_ads = NULL`:** Interpretados como ilimitados
- **Planos com `*_highlights_count = 0`:** Não permitem destaques daquele tipo
- **Timestamps UTC:** Todas as datas são armazenadas em UTC (TIMESTAMPTZ)

---

## 🐛 Troubleshooting

### Erro: "Você não possui uma assinatura ativa"
**Solução:** Verificar se usuário tem registro em `user_subscriptions` com status 'active' e `current_period_end` futuro.

### Erro: "Plano não encontrado"
**Solução:** Verificar se `plan_id` na assinatura corresponde a um registro válido em `plans`.

### Contadores não atualizam
**Solução:** Chamar `refreshUsage()` após ações que alteram uso (criar anúncio, aplicar destaque).

### Destaques não expiraram automaticamente
**Solução:** Configurar cron job para executar `cleanup_expired_highlights()` diariamente.

---

## 📚 Referências

- **Hook useSubscription:** `src/hooks/useSubscription.ts`
- **SQL Scripts:** `sql/announcement_highlights.sql`
- **Modal:** `components/HighlightConfirmationModal.tsx`
- **AdCreationView:** `pages/AdCreationView.tsx` (linhas ~1-20, ~95-105, ~1110-1160)
- **UserDashboard:** `pages/UserDashboardView.tsx` (linhas ~1-15, ~65-75, ~240-350)

---

**Desenvolvido com ❤️ para BWAGRO**
*Implementação completa do sistema de travas de plano e créditos não-acumulativos*
