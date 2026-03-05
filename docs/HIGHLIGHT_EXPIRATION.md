# Sistema de Expiração Automática de Destaques

## 📋 Índice

- [Visão Geral](#visão-geral)
- [Estratégias de Implementação](#estratégias-de-implementação)
- [Instalação](#instalação)
- [Configuração do Cron Job](#configuração-do-cron-job)
- [Testes](#testes)
- [Monitoramento](#monitoramento)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Visão Geral

O sistema de expiração automática de destaques garante que anúncios com `highlight_home` ou `highlight_category` sejam automaticamente desativados quando a data de expiração (`highlight_home_until` / `highlight_category_until`) for atingida.

### Fluxo do Sistema

```
┌─────────────────────────────────────────────────────────────┐
│  Anúncio com Destaque Ativo                                 │
│  highlight_home = true                                      │
│  highlight_home_until = 2024-12-31 23:59:59                │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ (Data atual ultrapassa 2024-12-31)
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  TRIGGER: clean_highlights_on_change                        │
│  Detecta: highlight_home_until < NOW()                     │
│  Ação: SET highlight_home = false                          │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│  Anúncio Normal (sem destaque)                              │
│  highlight_home = false                                     │
│  Aparece apenas em "Publicados Recentemente"               │
└─────────────────────────────────────────────────────────────┘
```

### Benefícios

- ✅ **Automático**: Nenhuma intervenção manual necessária
- ✅ **Consistente**: Frontend e backend sempre sincronizados
- ✅ **Confiável**: Trigger SQL garante proteção em camada de dados
- ✅ **Transparente**: Logs e estatísticas de cada execução
- ✅ **Flexível**: Funciona com ambos os tipos de destaque (home e categoria)

---

## 🔧 Estratégias de Implementação

O sistema oferece **três camadas de proteção** que trabalham juntas:

### 1. Camada Frontend (ATIVA ✅)

**Localização**: [pages/Home.tsx](../pages/Home.tsx#L58-L88)

```tsx
const isHomeHighlight = ad.highlightHome && 
  (!ad.highlightHomeUntil || new Date(ad.highlightHomeUntil) > new Date());
```

**Função**: Filtra destaques expirados durante a renderização.

**Prós**:
- Resposta instantânea
- Não depende do backend

**Contras**:
- Dados ficam desatualizados no banco
- Pode causar inconsistências em analytics

---

### 2. Camada Backend - Trigger (INSTALAR 🔄)

**Localização**: [sql/auto_expire_highlights.sql](../sql/auto_expire_highlights.sql#L41)

```sql
CREATE TRIGGER clean_highlights_on_change
  BEFORE INSERT OR UPDATE
  ON announcements
  FOR EACH ROW
  EXECUTE FUNCTION check_and_clean_highlights_before_select();
```

**Função**: Detecta e limpa destaques expirados antes de salvar no banco.

**Prós**:
- Executa automaticamente em qualquer operação
- Zero overhead de infraestrutura
- Proteção contra dados corrompidos

**Contras**:
- Só executa quando há INSERT/UPDATE
- Destaques podem ficar ativos no banco entre atualizações

---

### 3. Camada Backend - Cron Job (OPCIONAL 🔄)

**Localização**: [sql/auto_expire_highlights.sql](../sql/auto_expire_highlights.sql#L103)

```sql
SELECT * FROM scheduled_highlights_cleanup();
```

**Função**: Limpa destaques expirados periodicamente (ex: a cada 1 hora).

**Prós**:
- Garante limpeza regular mesmo sem atualizações
- Fornece estatísticas de limpeza
- Ideal para analytics precisos

**Contras**:
- Requer configuração externa (Edge Function ou webhook)
- Overhead adicional de infraestrutura

---

## 🚀 Instalação

### Passo 1: Executar SQL no Supabase

1. Acesse o **Supabase Dashboard**
2. Vá em **SQL Editor**
3. Copie o conteúdo de `sql/auto_expire_highlights.sql`
4. Execute o script completo

### Passo 2: Verificar Instalação

Execute no SQL Editor:

```sql
-- Verificar se o trigger foi criado
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name = 'clean_highlights_on_change';

-- Verificar se a função existe
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name IN (
  'check_and_clean_highlights_before_select',
  'clean_expired_highlights',
  'scheduled_highlights_cleanup'
);

-- Verificar se a view existe
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_name = 'announcements_with_active_highlights';
```

Resultado esperado:

```
trigger_name                     | event_manipulation | event_object_table
---------------------------------+--------------------+-------------------
clean_highlights_on_change       | INSERT             | announcements
clean_highlights_on_change       | UPDATE             | announcements

routine_name                                | routine_type
--------------------------------------------+-------------
check_and_clean_highlights_before_select    | FUNCTION
clean_expired_highlights                    | FUNCTION
scheduled_highlights_cleanup                | FUNCTION

table_name                            | table_type
--------------------------------------+-----------
announcements_with_active_highlights  | VIEW
```

### Passo 3: Executar Limpeza Inicial

Limpe destaques expirados que já estão no banco:

```sql
SELECT * FROM scheduled_highlights_cleanup();
```

Resultado:

```
home_highlights_cleaned | category_highlights_cleaned | total_cleaned
-----------------------+----------------------------+--------------
5                      | 3                          | 8
```

---

## ⏰ Configuração do Cron Job

### Opção 1: Supabase Edge Function (Recomendado)

#### 1.1. Criar a Edge Function

```bash
# No terminal do projeto
supabase functions new cleanup-highlights
```

#### 1.2. Editar `supabase/functions/cleanup-highlights/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data, error } = await supabase.rpc('scheduled_highlights_cleanup')

    if (error) {
      console.error('Erro ao limpar destaques:', error)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.log('Limpeza executada:', data)
    
    return new Response(JSON.stringify({ 
      success: true, 
      data,
      timestamp: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Erro inesperado:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
```

#### 1.3. Deploy da Edge Function

```bash
supabase functions deploy cleanup-highlights
```

#### 1.4. Configurar Cron com GitHub Actions

Crie `.github/workflows/cleanup-highlights.yml`:

```yaml
name: Cleanup Expired Highlights

on:
  schedule:
    # Executa a cada 1 hora
    - cron: '0 * * * *'
  workflow_dispatch: # Permite execução manual

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - name: Call Edge Function
        run: |
          curl -X POST \
            ${{ secrets.SUPABASE_FUNCTIONS_URL }}/cleanup-highlights \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}"
```

---

### Opção 2: Cron Job Externo (cron-job.org)

1. Acesse [cron-job.org](https://cron-job.org)
2. Crie uma conta gratuita
3. Adicione um novo Cron Job:
   - **URL**: `https://SEU-PROJETO.supabase.co/functions/v1/cleanup-highlights`
   - **Intervalo**: A cada 1 hora
   - **Método**: POST
   - **Headers**:
     ```
     Authorization: Bearer SEU-ANON-KEY
     Content-Type: application/json
     ```

---

### Opção 3: Webhook do Render/Railway

Se você tem um backend rodando no Render ou Railway:

```typescript
// src/cron/cleanup.ts
import { CronJob } from 'cron';
import { supabase } from './supabaseClient';

const job = new CronJob('0 * * * *', async () => {
  console.log('Executando limpeza de destaques...');
  
  const { data, error } = await supabase.rpc('scheduled_highlights_cleanup');
  
  if (error) {
    console.error('Erro:', error);
  } else {
    console.log('Limpeza concluída:', data);
  }
});

job.start();
```

---

## 🧪 Testes

### Teste 1: Trigger em INSERT

Crie um anúncio com destaque já expirado:

```sql
INSERT INTO announcements (
  title,
  description,
  user_id,
  category_id,
  price,
  status,
  city,
  state,
  highlight_home,
  highlight_home_until
)
VALUES (
  'Teste Destaque Expirado',
  'Este anúncio deveria ter destaque false',
  'SEU-USER-ID',
  'SEU-CATEGORY-ID',
  10000,
  'ACTIVE',
  'São Paulo',
  'SP',
  true, -- Inserindo como true...
  NOW() - INTERVAL '1 day' -- Mas já está expirado!
)
RETURNING id, title, highlight_home, highlight_home_until;
```

**Resultado esperado**:

```
id        | title                      | highlight_home | highlight_home_until
----------+----------------------------+----------------+---------------------
abc-123   | Teste Destaque Expirado    | false          | 2024-12-10 15:30:00
```

✅ **O trigger mudou automaticamente highlight_home para false!**

---

### Teste 2: Trigger em UPDATE

Atualize um anúncio com destaque expirado:

```sql
-- 1. Criar anúncio normal
INSERT INTO announcements (
  title, user_id, category_id, price, status, city, state,
  highlight_home, highlight_home_until
)
VALUES (
  'Anúncio Normal', 'USER-ID', 'CAT-ID', 5000, 'ACTIVE', 'SP', 'SP',
  true, NOW() + INTERVAL '7 days' -- Expira em 7 dias
)
RETURNING id;

-- 2. Simular expiração (mudar data para o passado)
UPDATE announcements
SET highlight_home_until = NOW() - INTERVAL '1 day'
WHERE id = 'ID-DO-ANUNCIO';

-- 3. Fazer qualquer update
UPDATE announcements
SET description = 'Descrição atualizada'
WHERE id = 'ID-DO-ANUNCIO';

-- 4. Verificar
SELECT id, highlight_home, highlight_home_until
FROM announcements
WHERE id = 'ID-DO-ANUNCIO';
```

**Resultado esperado**:

```
highlight_home | highlight_home_until
---------------+---------------------
false          | 2024-12-09 15:30:00
```

✅ **O trigger detectou a expiração e limpou o destaque!**

---

### Teste 3: Função Scheduled

Execute manualmente a limpeza periódica:

```sql
-- Antes da limpeza: Ver quantos destaques estão expirados
SELECT COUNT(*) as expirados_home
FROM announcements
WHERE highlight_home = true
  AND highlight_home_until < NOW();

SELECT COUNT(*) as expirados_categoria
FROM announcements
WHERE highlight_category = true
  AND highlight_category_until < NOW();

-- Executar limpeza
SELECT * FROM scheduled_highlights_cleanup();

-- Depois da limpeza: Verificar se foram limpos
SELECT COUNT(*) as expirados_home
FROM announcements
WHERE highlight_home = true
  AND highlight_home_until < NOW();
```

**Resultado esperado**:

```
-- ANTES
expirados_home: 5
expirados_categoria: 3

-- DURANTE
home_highlights_cleaned | category_highlights_cleaned | total_cleaned
-----------------------+----------------------------+--------------
5                      | 3                          | 8

-- DEPOIS
expirados_home: 0
expirados_categoria: 0
```

✅ **Todos os destaques expirados foram limpos!**

---

### Teste 4: View de Anúncios Ativos

Use a view para facilitar queries:

```sql
-- Buscar apenas anúncios com destaque home ATIVO
SELECT id, title, highlight_home, highlight_home_until, is_home_highlight_active
FROM announcements_with_active_highlights
WHERE is_home_highlight_active = true
LIMIT 10;

-- Buscar anúncios com destaque categoria ATIVO
SELECT id, title, highlight_category, highlight_category_until, is_category_highlight_active
FROM announcements_with_active_highlights
WHERE is_category_highlight_active = true
LIMIT 10;

-- Buscar anúncios SEM nenhum destaque ativo
SELECT id, title
FROM announcements_with_active_highlights
WHERE is_home_highlight_active = false
  AND is_category_highlight_active = false
LIMIT 10;
```

---

## 📊 Monitoramento

### Dashboard de Destaques

Execute periodicamente para monitorar:

```sql
-- STATUS GERAL DOS DESTAQUES
SELECT 
  COUNT(*) FILTER (WHERE highlight_home = true AND (highlight_home_until IS NULL OR highlight_home_until > NOW())) as destaques_home_ativos,
  COUNT(*) FILTER (WHERE highlight_home = true AND highlight_home_until < NOW()) as destaques_home_expirados,
  COUNT(*) FILTER (WHERE highlight_category = true AND (highlight_category_until IS NULL OR highlight_category_until > NOW())) as destaques_categoria_ativos,
  COUNT(*) FILTER (WHERE highlight_category = true AND highlight_category_until < NOW()) as destaques_categoria_expirados
FROM announcements
WHERE status = 'ACTIVE';
```

Resultado esperado:

```
destaques_home_ativos | destaques_home_expirados | destaques_categoria_ativos | destaques_categoria_expirados
---------------------+-------------------------+---------------------------+------------------------------
12                   | 0                       | 8                         | 0
```

✅ **Expirados devem ser sempre 0 se o sistema estiver funcionando!**

---

### Log de Limpezas (Edge Function)

Configure logging na Edge Function:

```typescript
// Adicionar ao final da função
await supabase.from('cleanup_logs').insert({
  executed_at: new Date().toISOString(),
  home_cleaned: data[0].home_highlights_cleaned,
  category_cleaned: data[0].category_highlights_cleaned,
  total_cleaned: data[0].total_cleaned
});
```

Query para ver histórico:

```sql
SELECT * FROM cleanup_logs
ORDER BY executed_at DESC
LIMIT 10;
```

---

## 🔍 Troubleshooting

### Problema 1: Destaques Expirados Não São Limpos

**Sintoma**: Anúncios com `highlight_home_until < NOW()` continuam com `highlight_home = true`

**Possíveis Causas**:

1. **Trigger não instalado**
   ```sql
   -- Verificar
   SELECT * FROM information_schema.triggers 
   WHERE trigger_name = 'clean_highlights_on_change';
   
   -- Se vazio, reinstalar
   -- Executar sql/auto_expire_highlights.sql novamente
   ```

2. **Anúncios não foram atualizados**
   ```sql
   -- Executar limpeza manual
   SELECT * FROM scheduled_highlights_cleanup();
   ```

3. **Cron job não está rodando**
   ```bash
   # Verificar logs da Edge Function
   supabase functions logs cleanup-highlights
   ```

---

### Problema 2: Edge Function Retorna Erro

**Sintoma**: Webhook retorna 500 Internal Server Error

**Possíveis Causas**:

1. **Credenciais incorretas**
   ```typescript
   // Verificar se as variáveis de ambiente estão definidas
   console.log('SUPABASE_URL:', Deno.env.get('SUPABASE_URL'))
   console.log('SERVICE_ROLE_KEY:', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ? 'OK' : 'MISSING')
   ```

2. **RPC não encontrado**
   ```sql
   -- Verificar se a função existe
   SELECT routine_name FROM information_schema.routines
   WHERE routine_name = 'scheduled_highlights_cleanup';
   ```

3. **Permissões insuficientes**
   ```sql
   -- Garantir que a função pode ser executada
   GRANT EXECUTE ON FUNCTION scheduled_highlights_cleanup() TO anon, authenticated;
   ```

---

### Problema 3: Trigger Não Executa

**Sintoma**: INSERT/UPDATE não limpa destaques expirados

**Solução**:

```sql
-- 1. Verificar se o trigger existe
SELECT * FROM information_schema.triggers 
WHERE event_object_table = 'announcements';

-- 2. Se não existir, recriar
DROP TRIGGER IF EXISTS clean_highlights_on_change ON announcements;

CREATE TRIGGER clean_highlights_on_change
  BEFORE INSERT OR UPDATE
  ON announcements
  FOR EACH ROW
  EXECUTE FUNCTION check_and_clean_highlights_before_select();

-- 3. Testar novamente
UPDATE announcements
SET description = 'Test'
WHERE id = 'ALGUM-ID';
```

---

### Problema 4: Performance Degradada

**Sintoma**: Queries ficam lentas após instalar o trigger

**Solução**:

O trigger é executado ANTES de INSERT/UPDATE, apenas quando há mudança. Se houver problemas de performance:

1. **Criar índices**:
   ```sql
   CREATE INDEX idx_highlight_home_expiration 
   ON announcements(highlight_home, highlight_home_until)
   WHERE highlight_home = true;

   CREATE INDEX idx_highlight_category_expiration 
   ON announcements(highlight_category, highlight_category_until)
   WHERE highlight_category = true;
   ```

2. **Desabilitar trigger temporariamente** (apenas para migrações):
   ```sql
   ALTER TABLE announcements DISABLE TRIGGER clean_highlights_on_change;
   -- Executar operações em massa
   ALTER TABLE announcements ENABLE TRIGGER clean_highlights_on_change;
   ```

---

## 📚 Referências

- [Documentação: Sistema de Censura](./CONTACT_CENSORSHIP.md)
- [Documentação: View Vendedores Públicos](./MIGRATION_VENDEDORES_PUBLICOS.md)
- [Código: Home.tsx](../pages/Home.tsx)
- [Código: AdCard.tsx](../components/AdCard.tsx)
- [SQL: auto_expire_highlights.sql](../sql/auto_expire_highlights.sql)

---

## ✅ Checklist de Implementação

- [ ] Executar `sql/auto_expire_highlights.sql` no Supabase SQL Editor
- [ ] Verificar se o trigger foi criado corretamente
- [ ] Executar limpeza inicial com `SELECT * FROM scheduled_highlights_cleanup()`
- [ ] Criar Edge Function `cleanup-highlights` (opcional)
- [ ] Configurar Cron Job (GitHub Actions ou cron-job.org)
- [ ] Executar testes 1, 2 e 3
- [ ] Configurar monitoramento (dashboard de destaques)
- [ ] Documentar URL da Edge Function em variáveis de ambiente

---

**Sistema desenvolvido em:** Dezembro 2024  
**Última atualização:** Dezembro 2024  
**Manutenção:** Executar `SELECT * FROM scheduled_highlights_cleanup()` semanalmente para verificar saúde do sistema
