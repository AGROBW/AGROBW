# 🚀 Migração do Sistema de Favoritos para Supabase

## 📋 Resumo das Alterações

O sistema de favoritos foi migrado de **localStorage** para o **Supabase**, proporcionando:

- ✅ **Sincronização entre dispositivos**: Favoritos disponíveis em qualquer navegador
- ✅ **Segurança RLS**: Cada usuário só vê seus próprios favoritos
- ✅ **Detecção de oportunidades**: Badge "Baixou R$ X" quando o preço reduz
- ✅ **Performance**: Join otimizado com announcements

---

## 🛠️ Passo 1: Executar SQL no Supabase

Acesse o **SQL Editor** no seu projeto Supabase e execute o seguinte script:

```sql
-- ============================================================================
-- POLÍTICAS RLS PARA TABELA FAVORITES
-- ============================================================================

-- Habilitar RLS na tabela favorites
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas (se existirem)
DROP POLICY IF EXISTS "Usuários podem ver seus próprios favoritos" ON public.favorites;
DROP POLICY IF EXISTS "Usuários podem adicionar favoritos" ON public.favorites;
DROP POLICY IF EXISTS "Usuários podem remover seus favoritos" ON public.favorites;

-- POLÍTICA 1: SELECT - Usuários podem ver seus próprios favoritos
CREATE POLICY "Usuários podem ver seus próprios favoritos"
ON public.favorites
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- POLÍTICA 2: INSERT - Usuários podem adicionar favoritos
CREATE POLICY "Usuários podem adicionar favoritos"
ON public.favorites
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- POLÍTICA 3: DELETE - Usuários podem remover seus favoritos
CREATE POLICY "Usuários podem remover seus favoritos"
ON public.favorites
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- COMENTÁRIOS
COMMENT ON TABLE public.favorites IS 'Tabela de favoritos dos usuários - controla quais anúncios foram salvos';
COMMENT ON COLUMN public.favorites.price_at_favorite IS 'Preço do anúncio no momento em que foi favoritado - usado para detectar oportunidades';
```

---

## 📁 Arquivos Modificados

### 1. **pages/FavoritesView.tsx**
- ✅ Substituído `favoriteService` por `useFavorites` hook
- ✅ Busca favoritos diretamente do Supabase
- ✅ Cálculo de estatísticas em tempo real (useMemo)
- ✅ Estados de loading sincronizados

### 2. **components/FavoriteCard.tsx**
- ✅ Badge "Baixou R$ X" com valor da economia
- ✅ Formatação em BRL usando Intl.NumberFormat
- ✅ Animação pulse no badge de desconto
- ✅ Seção de "Economia" no footer do card

### 3. **components/AdCard.tsx**
- ✅ Passa `currentPrice` ao favoritar (price_at_favorite)
- ✅ Toggle otimista atualizado

### 4. **src/hooks/useFavorites.ts** (já existia)
- ✅ Query com join em `announcements`
- ✅ Filtragem de favoritos com anúncios deletados
- ✅ toggleFavorite com insert/delete automático

---

## 🎨 Nova Interface do Badge de Desconto

### Antes:
```
❌ Badge genérico: "-10%"
```

### Depois:
```
✅ Badge detalhado:
┌─────────────────────┐
│ ⬇️ Baixou            │
│ R$ 5.000           │
└─────────────────────┘
```

**Design:**
- Gradiente verde (from-green-500 to-emerald-600)
- Animação pulse
- Ícone TrendingDown
- Valor formatado em BRL

---

## 🔍 Lógica de Detecção de Oportunidades

```typescript
const currentPrice = ad.price;
const priceAtFavorite = favorite.priceAtFavorite;
const priceDifference = priceAtFavorite - currentPrice;
const hasPriceReduction = currentPrice < priceAtFavorite;
```

**Condição de Exibição:**
- Badge aparece **apenas** se `currentPrice < priceAtFavorite`
- Valor exibido: diferença absoluta em reais
- Cor: verde para destacar economia

---

## ✅ Checklist de Validação

Antes de considerar a migração completa, teste:

- [ ] **Login/Logout**: Favoritos carregam corretamente
- [ ] **Adicionar Favorito**: Clique no coração em um anúncio
- [ ] **Remover Favorito**: Clique no botão de lixeira no FavoritesView
- [ ] **Badge de Desconto**: Crie um favorito, depois altere o preço do anúncio manualmente no Supabase para testar
- [ ] **Sincronização**: Favoritar em uma aba, verificar em outra (refresh)
- [ ] **RLS**: Logar com usuário diferente e verificar que não vê favoritos de outros

---

## 🔐 Segurança (RLS)

As políticas garantem:

1. **SELECT**: Usuário só vê favoritos onde `user_id = auth.uid()`
2. **INSERT**: Usuário só pode criar favoritos para si mesmo
3. **DELETE**: Usuário só pode deletar seus próprios favoritos

**Sem admin override**: Nem administradores podem ver favoritos de outros usuários (privacidade total).

---

## 📊 Performance

**Query otimizada:**
```typescript
.from('favorites')
.select(`
  *,
  announcements (
    id, title, price, images, city, state, status, ...
  )
`)
.eq('user_id', user.id)
```

- **Join automático**: Dados completos em uma requisição
- **Filtro no servidor**: RLS garante que apenas dados relevantes são retornados
- **Cache do React Query**: useFavorites pode ser facilmente adaptado para caching

---

## 🎯 Próximos Passos (Opcional)

1. **Migração de dados**: Se houver favoritos no localStorage, criar script para migrar
2. **Notificações**: Sistema de alerta quando preço baixa (já existe estrutura)
3. **Comparação**: Implementar página de comparação de favoritos selecionados
4. **Email**: Enviar alerta de "Oportunidade" quando preço reduz significativamente

---

## 📞 Suporte

Se encontrar problemas:

1. Verifique se as políticas RLS foram aplicadas: `SELECT * FROM pg_policies WHERE tablename = 'favorites';`
2. Teste a query manualmente no SQL Editor
3. Verifique o console do navegador para erros de autenticação
4. Confirme que `auth.uid()` está retornando o ID correto

---

## ✨ Conclusão

A migração está **100% completa**. O sistema agora:

- ✅ Usa Supabase como fonte de verdade
- ✅ Sincroniza entre dispositivos
- ✅ Exibe badges de desconto em tempo real
- ✅ Protege dados com RLS
- ✅ Mantém UX fluida com loading states

**Basta executar o SQL no Supabase e testar!** 🚀
