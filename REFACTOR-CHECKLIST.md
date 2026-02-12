# 🔄 REFATORAÇÃO: ads → announcements (Anti-AdBlock)

## ✅ STATUS: CÓDIGO FRONTEND COMPLETO

### 📋 Checklist de Execução

#### 1️⃣ Banco de Dados (EXECUTAR PRIMEIRO)
- [ ] Faça backup completo do banco Supabase
- [ ] Execute o arquivo `refactor-ads-to-announcements.sql` no SQL Editor do Supabase
- [ ] Verifique se todas as constraints foram recriadas corretamente
- [ ] Confirme que as políticas RLS estão ativas na tabela `announcements`

#### 2️⃣ Código Frontend (JÁ APLICADO) ✅
- [x] `AdCreationView.tsx` - Todas as chamadas `.from('ads')` → `.from('announcements')`
- [x] `src/hooks/useAds.ts` - 4 hooks atualizados
- [x] `src/hooks/useFavorites.ts` - Query e mapeamento atualizados (`ads` → `announcements`, `ad_id` → `announcement_id`)
- [x] `src/hooks/useNotifications.ts` - Campo `ad_id` → `announcement_id` 
- [x] `src/hooks/useMessages.ts` - Mapeamento `ad_id` → `announcement_id`
- [x] `UserDashboardView.tsx` - Query de anúncios do usuário atualizada
- [x] Referência `ad_technical_details` → `announcement_technical_details`

#### 3️⃣ Arquivos NÃO Alterados (Não Afetam HTTP)
- [ ] **LocalStorage keys**: `bwagro_ad_draft` e `bwagro_ad_draft_id` permanecem iguais (não causam bloqueio)
- [ ] **Bucket Storage**: `ads-images` pode permanecer (não é bloqueado por AdBlock pois usa CDN)
- [ ] **Nomes de componentes**: `AdCard.tsx`, `AdSlider.tsx` etc. não precisam mudar (são locais)
- [ ] **Rotas**: URLs como `/anuncios` não são bloqueadas (apenas APIs com `/ads/` no path)

#### 4️⃣ Testes Pós-Refatoração
- [ ] Criar novo anúncio e verificar se salva em `announcements`
- [ ] Listar anúncios na home e categorias
- [ ] Editar anúncio existente
- [ ] Upload de imagens funcionando
- [ ] Dashboard do usuário mostrando seus anúncios
- [ ] Filtros e busca operacionais

---

## 🎯 O Que Foi Alterado

### Tabelas Renomeadas
| Antes | Depois |
|-------|--------|
| `ads` | `announcements` |
| `ad_metrics` | `announcement_metrics` |
| `ad_technical_details` | `announcement_technical_details` |

### Colunas Renomeadas
| Tabela | Coluna Antiga | Coluna Nova |
|--------|---------------|-------------|
| `favorites` | `ad_id` | `announcement_id` |
| `leads` | `ad_id` | `announcement_id` |
| `chats` | `ad_id` | `announcement_id` |
| `announcement_metrics` | `ad_id` | `announcement_id` |
| `announcement_technical_details` | `ad_id` | `announcement_id` |

### Foreign Keys Recriadas
Todas as FKs foram dropadas e recriadas apontando para `announcements(id)` com `ON DELETE CASCADE`.

### Políticas RLS Atualizadas
```sql
- public_read_active_announcements
- users_create_own_announcements  
- users_update_own_announcements
- users_delete_own_announcements
```

---

## 🚨 ATENÇÃO: Ordem de Execução

### ⚠️ CRÍTICO: Execute nesta sequência exata

1. **BACKUP** → Exporte banco completo do Supabase
2. **SQL** → Execute `refactor-ads-to-announcements.sql` 
3. **TESTE SQL** → Verifique no Table Editor se `announcements` existe
4. **FRONTEND** → Código já está atualizado, só recarregar a aplicação
5. **TESTE E2E** → Crie um anúncio teste e valide todo o fluxo

---

## 🔍 Por Que Isso Funciona?

AdBlockers bloqueiam requisições HTTP que contêm `/ads/` no path da URL:
- ❌ `https://api.exemplo.com/rest/v1/ads` → BLOQUEADO
- ✅ `https://api.exemplo.com/rest/v1/announcements` → PERMITIDO

Arquivos locais, componentes React e LocalStorage **NÃO** são afetados porque não fazem requisições HTTP.

---

## 📊 Arquivos Modificados (Git Diff)

```
modified:   pages/AdCreationView.tsx
modified:   src/hooks/useAds.ts
modified:   src/hooks/useFavorites.ts
modified:   src/hooks/useNotifications.ts
modified:   src/hooks/useMessages.ts
modified:   pages/UserDashboardView.tsx
modified:   refactor-ads-to-announcements.sql (adicionadas VIEWs)
modified:   REFACTOR-CHECKLIST.md
```

---

## 🛡️ Rollback (Se Necessário)

Para reverter, execute:
```sql
ALTER TABLE public.announcements RENAME TO ads;
-- E reverta todas as FKs e políticas conforme necessário
```

---

## ✅ Conclusão

Todas as alterações de código estão **completas e sem erros de TypeScript**.

**Próximo Passo**: Execute o SQL no Supabase e recarregue a aplicação.

---

**Data da Refatoração**: 2026-02-07  
**Responsável**: GitHub Copilot  
**Motivo**: Evitar bloqueios por extensões AdBlock  
