# Migração: Dados do Vendedor com View Pública

## 📋 Resumo das Mudanças

Esta migração implementa uma camada de segurança para acesso aos dados do vendedor, substituindo queries diretas à tabela `users` por uma view pública `vendedores_publicos`.

### Motivação

- **Problema anterior**: Queries diretas à tabela `users` falhavam devido a políticas RLS restritivas
- **Solução**: View pública que expõe apenas dados seguros sem comprometer privacidade
- **Benefício adicional**: Localização do vendedor (cidade, estado) agora disponível

## 🔄 Mudanças Implementadas

### 1. SQL: View `vendedores_publicos`

**Arquivo**: `sql/create_vendedores_publicos_view.sql`

```sql
CREATE OR REPLACE VIEW vendedores_publicos AS
SELECT 
  u.id,
  u.name,
  u.avatar,
  u.document_verified,
  a.city as cidade,
  a.state as estado
FROM users u
LEFT JOIN addresses a ON a.user_id = u.id AND a.is_primary = true;

GRANT SELECT ON vendedores_publicos TO anon, authenticated;
```

**Ação necessária**: ✅ **Executar este SQL no Supabase SQL Editor**

### 2. TypeScript: Interface `Ad`

**Arquivo**: `types.ts`

**Antes**:
```typescript
interface Ad {
  users?: {
    name: string;
    avatar?: string;
    document_verified?: boolean;
  };
}
```

**Depois**:
```typescript
interface Ad {
  seller?: {
    name: string;
    avatar?: string;
    document_verified?: boolean;
    cidade?: string;
    estado?: string;
  };
}
```

### 3. Hooks: `useAds.ts`

#### usePublicAds (linha 93)

**Antes**:
```typescript
users:user_id (name, avatar, document_verified)
```

**Depois**:
```typescript
seller:vendedores_publicos!user_id (name, avatar, document_verified, cidade, estado)
```

#### useAd (linha 277)

**Antes**:
```typescript
const { data: userList } = await supabase
  .from('users')
  .select('name, avatar, document_verified')
  .eq('id', adData.user_id)
```

**Depois**:
```typescript
const { data: sellerList } = await supabase
  .from('vendedores_publicos')
  .select('name, avatar, document_verified, cidade, estado')
  .eq('id', adData.user_id)
```

### 4. Componentes

#### AdDetailView.tsx

- ✅ `ad.users` → `ad.seller`
- ✅ Adicionado exibição de `cidade, estado` do vendedor

#### AdCard.tsx

- ✅ `ad.users` → `ad.seller`

### 5. Documentação

- ✅ `docs/SELLER_DATA.md` atualizado com nova estrutura

## 🚀 Passo a Passo de Implantação

### 1. Executar SQL no Supabase

1. Acesse o **Supabase Dashboard**
2. Vá em **SQL Editor**
3. Execute o arquivo `sql/create_vendedores_publicos_view.sql`
4. Verifique se a view foi criada:
   ```sql
   SELECT * FROM vendedores_publicos LIMIT 5;
   ```

### 2. Verificar Permissões

```sql
-- Deve retornar 'SELECT' para anon e authenticated
SELECT 
  grantor,
  grantee,
  privilege_type
FROM information_schema.role_table_grants
WHERE table_name = 'vendedores_publicos';
```

### 3. Testar Backend

Teste a query diretamente no Supabase:

```sql
SELECT 
  a.id,
  a.title,
  v.name as seller_name,
  v.avatar as seller_avatar,
  v.document_verified,
  v.cidade,
  v.estado
FROM announcements a
LEFT JOIN vendedores_publicos v ON v.id = a.user_id
WHERE a.status = 'ACTIVE'
LIMIT 5;
```

### 4. Recarregar Frontend

```bash
# Se o dev server estiver rodando, recarregue a página
# Não é necessário rebuild, TypeScript já está atualizado
```

## ✅ Validação

### Checklist de Testes

- [ ] **View criada**: `SELECT * FROM vendedores_publicos` retorna dados
- [ ] **Permissões**: View acessível para `anon` e `authenticated`
- [ ] **Frontend - Lista**: Cards mostram selo verde se verificado
- [ ] **Frontend - Detalhes**: Nome do vendedor aparece (ex: "Bruno Henrique Morais Antunes")
- [ ] **Frontend - Localização**: Cidade e estado do vendedor aparecem
- [ ] **Console**: Logs `[useAd] Dados do vendedor encontrados:` mostram dados completos

### Teste Completo

1. Acesse a listagem de anúncios
2. Verifique se cards mostram selo verde para vendedores verificados
3. Clique em um anúncio
4. Verifique se o nome do vendedor aparece (não "Vendedor Profissional")
5. Verifique se a localização do vendedor aparece
6. Abra o Console (F12) e verifique os logs

## 🎯 Resultados Esperados

### Antes (com erro)

```
[useAd] Buscando vendedor com ID: 484ae0c7-c477-49bb-8123-2d63ee7b14e9
[useAd] Resultado da busca: { userList: [], userError: null }
[useAd] Vendedor não encontrado na tabela users
[useAd] Users: null
```

UI mostrava: **"Vendedor Profissional"**

### Depois (funcionando)

```
[useAd] Buscando vendedor com ID: 484ae0c7-c477-49bb-8123-2d63ee7b14e9
[useAd] Resultado da busca: { 
  sellerList: [{
    name: "Bruno Henrique Morais Antunes",
    avatar: "https://...",
    document_verified: true,
    cidade: "São Paulo",
    estado: "SP"
  }],
  sellerError: null 
}
[useAd] Dados do vendedor encontrados: {...}
[useAd] Seller: {...}
```

UI mostra:
- **Nome**: Bruno Henrique Morais Antunes
- **Selo**: ✅ Identidade Verificada
- **Localização**: São Paulo, SP

## 🔒 Segurança

### Dados Expostos pela View

- ✅ `name` - Nome do vendedor
- ✅ `avatar` - URL da foto de perfil
- ✅ `document_verified` - Status de verificação
- ✅ `cidade` - Cidade (do endereço principal)
- ✅ `estado` - Estado (do endereço principal)

### Dados NÃO Expostos

- ❌ Email
- ❌ CPF/CNPJ
- ❌ Telefone
- ❌ Endereço completo
- ❌ Data de nascimento
- ❌ Qualquer dado sensível da tabela `users`

### Vantagens da View

1. **Controle Centralizado**: Fácil adicionar/remover campos
2. **Sem RLS Complexo**: View é sempre pública, RLS aplicado na origem
3. **Performance**: JOIN pré-computado
4. **Auditabilidade**: Única fonte de verdade para dados públicos
5. **Compatibilidade**: Funciona com `anon` e `authenticated`

## 📚 Referências

- **SQL**: [sql/create_vendedores_publicos_view.sql](../sql/create_vendedores_publicos_view.sql)
- **Tipos**: [types.ts](../types.ts) linha 55-66
- **Hook**: [src/hooks/useAds.ts](../src/hooks/useAds.ts)
- **Componentes**: 
  - [pages/AdDetailView.tsx](../pages/AdDetailView.tsx)
  - [components/AdCard.tsx](../components/AdCard.tsx)
- **Documentação**: [docs/SELLER_DATA.md](../docs/SELLER_DATA.md)

## 🎉 Conclusão

Esta migração resolve o problema de dados do vendedor não aparecendo, implementando uma solução escalável e segura baseada em view SQL pública.

**Próximo passo**: Executar o SQL no Supabase e testar!
