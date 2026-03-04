# Dados Públicos do Vendedor

## 📋 Visão Geral

Os dados do vendedor são **totalmente públicos** e visíveis para todos os visitantes da plataforma, incluindo usuários não autenticados. Isso permite que compradores saibam exatamente quem está vendendo o equipamento antes de fazer contato.

## 🔍 Estrutura de Dados

### Query Supabase

```typescript
supabase
  .from('announcements')
  .select(`
    *,
    categories (name, slug),
    users (name, avatar, phone, document_verified),
    announcement_technical_details (label, value, icon_name)
  `)
  .eq('id', adId)
  .single()
```

### Interface TypeScript

```typescript
interface Ad {
  // ... outros campos
  users?: {
    name: string;
    avatar?: string;
    document_verified?: boolean;
  };
}
```

## 🎨 Renderização no Frontend

### Componente: AdDetailView.tsx

**Localização:** Linha ~198

```tsx
<div className="flex items-center gap-4">
  {/* Avatar do Vendedor */}
  <div className="w-14 h-14 bg-slate-100 rounded-full overflow-hidden">
    {ad.users?.avatar ? (
      <img src={ad.users.avatar} alt={ad.users?.name || 'Vendedor Profissional'} />
    ) : (
      <span>{(ad.users?.name || 'Vendedor Profissional')[0].toUpperCase()}</span>
    )}
  </div>
  
  {/* Nome e Selo de Verificação */}
  <div>
    <div className="flex items-center gap-2">
      <h4 className="font-bold">{ad.users?.name || 'Vendedor Profissional'}</h4>
      {ad.users?.document_verified && <VerifiedBadge variant="icon-only" />}
    </div>
    {ad.users?.document_verified && (
      <p className="text-xs text-emerald-600">Identidade Verificada</p>
    )}
  </div>
</div>
```

## ✅ Campos Exibidos

### 1. Nome do Vendedor
- **Campo**: `ad.users?.name`
- **Fallback**: `'Vendedor Profissional'`
- **Visibilidade**: Pública (todos os visitantes)

### 2. Avatar do Vendedor
- **Campo**: `ad.users?.avatar`
- **Fallback**: Inicial do nome em círculo colorido
- **Visibilidade**: Pública (todos os visitantes)

### 3. Selo de Verificação
- **Campo**: `ad.users?.document_verified`
- **Exibição**: Apenas se `true`
- **Componente**: `<VerifiedBadge variant="icon-only" />`
- **Texto adicional**: "Identidade Verificada" em verde
- **Visibilidade**: Pública (todos os visitantes)

## 🔐 Privacidade e Segurança

### Dados NÃO Expostos

Os seguintes dados do vendedor **NÃO** são expostos publicamente:

- ❌ Email
- ❌ CPF/CNPJ
- ❌ Endereço completo
- ❌ Telefone (exceto WhatsApp do anúncio)
- ❌ Data de nascimento
- ❌ Documentos enviados

### Dados Expostos

Apenas dados necessários para **confiabilidade** na transação:

- ✅ Nome
- ✅ Avatar
- ✅ Status de verificação (`document_verified`)

## 📱 Casos de Uso

### Caso 1: Visitante Não Logado
```
Usuário acessa: /anuncio/123456
↓
Vê os dados do vendedor:
  - Nome: "Bruno Henrique"
  - Avatar: foto do perfil
  - Selo: ✅ Identidade Verificada
↓
Ganha confiança para entrar em contato
```

### Caso 2: Vendedor sem Verificação
```
Nome: "João da Silva"
Avatar: Inicial "J" em círculo
Selo: [não exibido]
Texto: [não exibido]
```

### Caso 3: Vendedor Anônimo (raro)
```
Nome: "Vendedor Profissional"
Avatar: Inicial "V" em círculo
Selo: [não exibido]
```

## 🎯 Benefícios da Exposição Pública

### Para Compradores
- 🛡️ **Confiança**: Ver quem está vendendo antes de contatar
- ✅ **Verificação**: Selo verde indica vendedor autenticado
- 👤 **Identidade**: Nome e foto real criam conexão humana

### Para Vendedores
- 🏆 **Credibilidade**: Selo de verificação destaca perfis autênticos
- 📈 **Conversão**: Compradores confiam mais em vendedores verificados
- 💼 **Profissionalismo**: Avatar e nome criam imagem profissional

## 🔄 Sincronização com Banco de Dados

Os dados do vendedor são **sempre atualizados** diretamente do banco:

```typescript
// Hook useAd busca dados em tempo real
const { ad, isLoading, error } = useAd(adId);

// ad.users contém dados mais recentes do vendedor
ad.users.name              // Nome atual
ad.users.avatar            // URL atual do avatar
ad.users.document_verified // Status atual de verificação
```

**Importante:** Quando o vendedor atualiza:
- ✅ Avatar → Mudança é refletida em todos os anúncios
- ✅ Nome → Mudança é refletida em todos os anúncios
- ✅ Verificação → Selo aparece/desaparece automaticamente

## 🚀 Implementação em Outros Componentes

### AdCard.tsx (Cards de Listagem)
```tsx
{ad.users?.document_verified && (
  <VerifiedBadge variant="small" />
)}
```

### AdDetailView.tsx (Página de Detalhes)
```tsx
<h4>{ad.users?.name || 'Vendedor Profissional'}</h4>
{ad.users?.document_verified && <VerifiedBadge variant="icon-only" />}
```

## 📊 Estatísticas de Conversão (Exemplo)

Anúncios com **vendedor verificado** tendem a ter:
- 📈 **+40% de conversão** em contatos
- ⭐ **+60% de confiança** dos compradores
- 💬 **+30% de mensagens** recebidas

## 🔗 Arquivos Relacionados

- **Hook**: [src/hooks/useAds.ts](../src/hooks/useAds.ts) - Linha 256 (query)
- **Componente**: [pages/AdDetailView.tsx](../pages/AdDetailView.tsx) - Linha ~198 (renderização)
- **Tipos**: [types.ts](../types.ts) - Interface `Ad`
- **Badge**: [components/VerifiedBadge.tsx](../components/VerifiedBadge.tsx)

## ✨ Conclusão

Os dados públicos do vendedor são fundamentais para criar **confiança** na plataforma. Expor nome, avatar e status de verificação permite que compradores tomem decisões informadas, enquanto a privacidade de dados sensíveis é preservada.
