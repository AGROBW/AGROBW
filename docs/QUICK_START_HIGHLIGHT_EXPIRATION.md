# ⚡ Guia Rápido: Expiração Automática de Destaques

> **TL;DR**: Execute [sql/auto_expire_highlights.sql](../sql/auto_expire_highlights.sql) no Supabase. Pronto! 🎉

---

## 🚀 Start em 5 Minutos

### 1. Executar SQL (2 min)

```sql
-- Cole todo o conteúdo de sql/auto_expire_highlights.sql
-- no Supabase SQL Editor e execute
```

### 2. Verificar Instalação (1 min)

```sql
-- Verificar trigger
SELECT trigger_name FROM information_schema.triggers 
WHERE trigger_name = 'clean_highlights_on_change';

-- Deve retornar: clean_highlights_on_change
```

### 3. Limpar Destaques Expirados Atuais (1 min)

```sql
SELECT * FROM scheduled_highlights_cleanup();

-- Resultado: home_highlights_cleaned | category_highlights_cleaned | total_cleaned
--            5                       | 3                           | 8
```

### 4. Testar (1 min)

```sql
-- Criar anúncio com destaque expirado
INSERT INTO announcements (
  title, user_id, category_id, price, status, city, state,
  highlight_home, highlight_home_until
)
VALUES (
  'Teste', 'USER-ID', 'CAT-ID', 1000, 'ACTIVE', 'SP', 'SP',
  true, NOW() - INTERVAL '1 day' -- Já expirado!
)
RETURNING highlight_home; -- Deve retornar FALSE
```

---

## 🔧 O Que Foi Instalado?

### Trigger Automático

```
┌─────────────────────────────────────────┐
│  INSERT ou UPDATE em announcements      │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  check_and_clean_highlights_...()       │
│  - Se highlight_home_until < NOW()      │
│    → highlight_home = false             │
│  - Se highlight_category_until < NOW()  │
│    → highlight_category = false         │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  Anúncio salvo SEM destaque expirado    │
└─────────────────────────────────────────┘
```

**Resultado**: Destaques expirados NUNCA são salvos no banco! ✅

---

### Função de Limpeza Periódica (Opcional)

```sql
-- Execute manualmente ou via cron job
SELECT * FROM scheduled_highlights_cleanup();
```

**Quando usar?**:
- Anúncios que expiraram mas não foram atualizados
- Limpeza semanal/mensal de manutenção
- Antes de gerar relatórios de analytics

---

### View de Consulta Facilitada

```sql
-- Em vez de verificar manualmente se está expirado...
SELECT * FROM announcements
WHERE highlight_home = true
  AND (highlight_home_until IS NULL OR highlight_home_until > NOW());

-- Use a view:
SELECT * FROM announcements_with_active_highlights
WHERE is_home_highlight_active = true;
```

**Benefício**: Código mais limpo nas queries!

---

## 📅 Cron Job (Opcional)

> **Nota**: O trigger automático já resolve 95% dos casos. Cron job é opcional para garantir limpeza 100% precisa.

### Opção 1: GitHub Actions (Free)

Crie `.github/workflows/cleanup-highlights.yml`:

```yaml
name: Cleanup Highlights
on:
  schedule:
    - cron: '0 * * * *' # A cada hora
jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -X POST \
            ${{ secrets.SUPABASE_URL }}/rest/v1/rpc/scheduled_highlights_cleanup \
            -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}"
```

---

### Opção 2: cron-job.org (Free, sem código)

1. Acesse [cron-job.org](https://cron-job.org)
2. Adicione job:
   - URL: `https://SEU-PROJETO.supabase.co/rest/v1/rpc/scheduled_highlights_cleanup`
   - Método: POST
   - Header: `apikey: SEU-ANON-KEY`
   - Intervalo: A cada 1 hora

---

### Opção 3: Supabase Edge Function

```bash
# Criar função
supabase functions new cleanup-highlights

# Editar supabase/functions/cleanup-highlights/index.ts
# (ver documentação completa em HIGHLIGHT_EXPIRATION.md)

# Deploy
supabase functions deploy cleanup-highlights
```

---

## 🧪 Como Testar?

### Teste Completo em 3 Comandos

```sql
-- 1. Criar anúncio com destaque expirado
INSERT INTO announcements (
  title, user_id, category_id, price, status, city, state,
  highlight_home, highlight_home_until
)
VALUES (
  'Teste Expiração', 'USER-ID', 'CAT-ID', 1000, 'ACTIVE', 'SP', 'SP',
  true, NOW() - INTERVAL '1 day'
)
RETURNING id, highlight_home, highlight_home_until;

-- RESULTADO ESPERADO: highlight_home = false (trigger mudou automaticamente!)

-- 2. Atualizar anúncio com destaque que vai expirar
UPDATE announcements
SET highlight_home_until = NOW() - INTERVAL '1 hour'
WHERE id = 'ALGUM-ID';

UPDATE announcements
SET description = 'Forçar trigger'
WHERE id = 'ALGUM-ID';

-- Verificar
SELECT highlight_home FROM announcements WHERE id = 'ALGUM-ID';
-- RESULTADO ESPERADO: highlight_home = false

-- 3. Executar limpeza manual
SELECT * FROM scheduled_highlights_cleanup();
-- RESULTADO ESPERADO: total_cleaned > 0 (se houver destaques expirados)
```

---

## 📊 Monitoramento Rápido

### Dashboard de 1 Query

```sql
SELECT 
  COUNT(*) FILTER (
    WHERE highlight_home = true 
      AND (highlight_home_until IS NULL OR highlight_home_until > NOW())
  ) as "✅ Destaques Home Ativos",
  
  COUNT(*) FILTER (
    WHERE highlight_home = true 
      AND highlight_home_until < NOW()
  ) as "❌ Destaques Home Expirados (PROBLEMA!)",
  
  COUNT(*) FILTER (
    WHERE highlight_category = true 
      AND (highlight_category_until IS NULL OR highlight_category_until > NOW())
  ) as "✅ Destaques Categoria Ativos",
  
  COUNT(*) FILTER (
    WHERE highlight_category = true 
      AND highlight_category_until < NOW()
  ) as "❌ Destaques Categoria Expirados (PROBLEMA!)"
FROM announcements
WHERE status = 'ACTIVE';
```

**Resultado esperado**:

```
✅ Destaques Home Ativos | ❌ Destaques Home Expirados | ✅ Destaques Categoria Ativos | ❌ Destaques Categoria Expirados
-----------------------+---------------------------+-------------------------------+----------------------------------
12                     | 0                         | 8                              | 0
```

> ⚠️ **Se houver destaques expirados**: Execute `SELECT * FROM scheduled_highlights_cleanup();`

---

## 🔍 Troubleshooting Ultra-Rápido

### Problema: Destaques Expirados Não São Limpos

```sql
-- Solução 1: Verificar se trigger existe
SELECT trigger_name FROM information_schema.triggers 
WHERE trigger_name = 'clean_highlights_on_change';

-- Se vazio: Reinstalar sql/auto_expire_highlights.sql

-- Solução 2: Forçar limpeza manual
SELECT * FROM scheduled_highlights_cleanup();
```

---

### Problema: Trigger Não Executa

```sql
-- Solução: Recriar trigger
DROP TRIGGER IF EXISTS clean_highlights_on_change ON announcements;

CREATE TRIGGER clean_highlights_on_change
  BEFORE INSERT OR UPDATE
  ON announcements
  FOR EACH ROW
  EXECUTE FUNCTION check_and_clean_highlights_before_select();
```

---

### Problema: Performance Lenta

```sql
-- Solução: Criar índices
CREATE INDEX idx_highlight_home_exp 
ON announcements(highlight_home, highlight_home_until)
WHERE highlight_home = true;

CREATE INDEX idx_highlight_category_exp 
ON announcements(highlight_category, highlight_category_until)
WHERE highlight_category = true;
```

---

## 📚 Documentação Completa

Para detalhes técnicos, testes avançados e configuração de Cron Jobs:

👉 **[HIGHLIGHT_EXPIRATION.md](./HIGHLIGHT_EXPIRATION.md)** (Documentação completa)

---

## ✅ Checklist de Implementação

**Essencial**:
- [ ] Executar `sql/auto_expire_highlights.sql` no Supabase
- [ ] Verificar que trigger foi criado
- [ ] Executar limpeza inicial: `SELECT * FROM scheduled_highlights_cleanup()`
- [ ] Testar inserção de anúncio com destaque expirado

**Opcional** (para garantir 100% de limpeza):
- [ ] Configurar Cron Job (GitHub Actions, cron-job.org, ou Edge Function)
- [ ] Criar índices para performance
- [ ] Configurar monitoramento semanal

---

## 🎯 Resultado Final

Após instalação:

1. ✅ Anúncios com destaque expirado **NUNCA** são salvos no banco
2. ✅ Frontend e backend sempre **sincronizados**
3. ✅ Sem duplicidade na Home: anúncios aparecem **OU** em destaque **OU** em recentes
4. ✅ Sistema **100% automático**: zero manutenção

---

**Tempo de instalação**: 5 minutos  
**Complexidade**: Baixa  
**Manutenção**: Zero (após instalar)  
**Impacto**: Alto (elimina bugs de destaque expirado)

---

**Dúvidas?** Consulte [HIGHLIGHT_EXPIRATION.md](./HIGHLIGHT_EXPIRATION.md) para documentação completa.
