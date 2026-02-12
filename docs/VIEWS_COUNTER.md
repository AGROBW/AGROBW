# Sistema de Visualizações de Anúncios

## Implementação Completa do Contador de Views

### 1. Função RPC no PostgreSQL

**Arquivo:** `sql/create_increment_views_function.sql`

A função `increment_ad_views(ad_id uuid)` foi criada para:
- Incrementar o contador `views` na tabela `announcements`
- Usar `SECURITY DEFINER` para permitir acesso sem autenticação
- Lidar com valores NULL (inicializa com 0)

**Como executar:**
```bash
# No Supabase SQL Editor, execute o conteúdo do arquivo:
psql -U postgres -d sua_database -f sql/create_increment_views_function.sql
```

### 2. Integração no Frontend

**Arquivo:** `src/hooks/useAds.ts`

#### Validações implementadas:
- ✅ Verifica se `adId` é UUID válido
- ✅ Só incrementa se anúncio for carregado com sucesso
- ✅ Previne duplicidade usando `sessionStorage`

#### Prevenção de Duplicidade:
```typescript
const viewKey = `viewed_ad_${adId}`
const hasViewed = sessionStorage.getItem(viewKey)

if (!hasViewed) {
  // Incrementa view e marca como visualizado
  sessionStorage.setItem(viewKey, 'true')
}
```

**Comportamento:**
- Mesmo anúncio não é contado múltiplas vezes na mesma sessão
- Refresh da página não incrementa o contador
- Nova sessão (fechar/abrir navegador) permite nova contagem

### 3. Parâmetros da Função RPC

**Correto:**
```typescript
supabase.rpc('increment_ad_views', { ad_id: adId })
```

**Incorreto (antigo):**
```typescript
supabase.rpc('increment_ad_views', { ad_uuid: adId }) // ❌
```

### 4. Logs de Debug

Console logs implementados:
- `[Views] Incrementando visualização para: {uuid}`
- `[Views] Visualização incrementada com sucesso`
- `[Views] Anúncio já visualizado nesta sessão`
- `[Views] Erro ao incrementar views: {error}`

### 5. Troubleshooting

#### Erro 404 no RPC
**Causa:** Função não existe ou tem nome diferente no banco

**Solução:**
1. Execute o script `create_increment_views_function.sql`
2. Verifique permissões: `GRANT EXECUTE ON FUNCTION increment_ad_views(uuid) TO anon;`
3. Recarregue schema: `NOTIFY pgrst, 'reload schema';`

#### Views não incrementando
**Verificar:**
1. Nome do parâmetro: deve ser `ad_id` (não `ad_uuid`)
2. SessionStorage: limpe com `sessionStorage.clear()` para testar
3. UUID válido: verifique formato no console

#### Múltiplas contagens
**Se ainda acontecer:**
- Limpe sessionStorage: `sessionStorage.removeItem('viewed_ad_{id}')`
- Verifique se há múltiplas chamadas no useEffect

### 6. Testando

**Teste 1: Primeira visualização**
```javascript
// Console deve mostrar:
[Views] Incrementando visualização para: abc123...
[Views] Visualização incrementada com sucesso
```

**Teste 2: Refresh da página**
```javascript
// Console deve mostrar:
[Views] Anúncio já visualizado nesta sessão
```

**Teste 3: Nova sessão**
```javascript
// Abrir DevTools > Application > Storage > Session Storage
// Deletar chave "viewed_ad_{id}"
// Recarregar página - deve incrementar novamente
```

### 7. Verificação SQL

Para verificar o contador no banco:
```sql
SELECT id, title, views 
FROM announcements 
WHERE id = 'seu-uuid-aqui'
ORDER BY views DESC;
```

### 8. Performance

- ✅ Função RPC é assíncrona (não bloqueia carregamento)
- ✅ Erro no incremento não afeta exibição do anúncio
- ✅ SessionStorage é mais rápido que localStorage
- ✅ Validação UUID evita chamadas desnecessárias

---

**Status:** ✅ Implementado e testado
**Última atualização:** 7 de fevereiro de 2026
