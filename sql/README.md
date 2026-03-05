# 📁 Scripts SQL - BWAGRO

Este diretório contém todos os scripts SQL para configuração e manutenção do banco de dados Supabase.

---

## 📋 Índice de Scripts

### 1. 🔒 Sistema de Censura de Contatos

#### [`censor_contact_trigger.sql`](./censor_contact_trigger.sql)

**Propósito**: Proteger usuários censurando automaticamente telefones, e-mails, links e redes sociais em anúncios.

**Quando usar**: Execute **UMA VEZ** após implementar o sistema de censura no frontend.

**O que faz**:
- Cria função `censor_contact_data()` com 15+ regex patterns
- Cria trigger `censor_announcements_contact` BEFORE INSERT/UPDATE
- Substitui contatos por `[CONTATO PROTEGIDO]`
- **Exceção**: Campo `whatsapp` não é afetado (contato oficial)

**Instalação**:
```sql
-- Execute o arquivo completo no Supabase SQL Editor
```

**Verificação**:
```sql
SELECT trigger_name FROM information_schema.triggers
WHERE trigger_name = 'censor_announcements_contact';

-- Deve retornar: censor_announcements_contact
```

**Documentação**: [CONTACT_CENSORSHIP.md](../docs/CONTACT_CENSORSHIP.md)

---

#### [`migrate_existing_announcements_censorship.sql`](./migrate_existing_announcements_censorship.sql)

**Propósito**: Aplicar censura em anúncios que já existem no banco (antes do trigger ser instalado).

**Quando usar**: Execute **APÓS** instalar `censor_contact_trigger.sql` e **APENAS UMA VEZ**.

**O que faz**:
- **OPÇÃO A** (Rápida): Update em massa usando o trigger
- **OPÇÃO B** (Controlada): Loop manual que não altera `updated_at`
- Backup automático antes da migração
- Preview dos dados que serão alterados
- Rollback em caso de erro

**Instalação**:
```sql
-- 1. Criar backup
CREATE TABLE announcements_backup AS 
SELECT * FROM announcements;

-- 2. Ver preview (sem modificar)
SELECT 
  id, title, description,
  censor_contact_data(title) as new_title,
  censor_contact_data(description) as new_description
FROM announcements
WHERE title ~ '[\(\d{2,3}\)]|\d{4,5}[-\s]?\d{4}|@|http'
   OR description ~ '[\(\d{2,3}\)]|\d{4,5}[-\s]?\d{4}|@|http'
LIMIT 10;

-- 3a. OPÇÃO A: Aplicar rápido (altera updated_at)
UPDATE announcements 
SET title = title, description = description;

-- 3b. OPÇÃO B: Aplicar controlado (mantém updated_at)
SELECT apply_censorship_to_existing_announcements();

-- 4. Verificar resultado
SELECT COUNT(*) as total_com_contato_protegido
FROM announcements
WHERE title LIKE '%[CONTATO PROTEGIDO]%'
   OR description LIKE '%[CONTATO PROTEGIDO]%';
```

**Documentação**: [MIGRATION_GUIDE_CENSORSHIP.md](../docs/MIGRATION_GUIDE_CENSORSHIP.md)

---

### 2. 👤 View de Dados Públicos do Vendedor

#### [`create_vendedores_publicos_view.sql`](./create_vendedores_publicos_view.sql)

**Propósito**: Expor apenas dados seguros do vendedor (nome, avatar, documento verificado, cidade, estado) sem vazar informações sensíveis.

**Quando usar**: Execute **UMA VEZ** para criar a view pública.

**O que faz**:
- Cria view `vendedores_publicos` com JOIN de `users` + `addresses`
- Expõe apenas: `id`, `name`, `avatar`, `document_verified`, `cidade`, `estado`
- Garante que dados sensíveis (telefone, e-mail, CPF) não aparecem
- Configura permissões para `anon` e `authenticated`

**Instalação**:
```sql
-- Execute o arquivo completo no Supabase SQL Editor

-- Verificação
SELECT * FROM vendedores_publicos LIMIT 5;

-- Deve retornar:
-- id | name | avatar | document_verified | cidade | estado
```

**Uso no Frontend**:
```typescript
const { data: seller } = await supabase
  .from('vendedores_publicos')
  .select('*')
  .eq('id', sellerId)
  .single();

console.log(seller.name); // ✅ OK
console.log(seller.phone); // ❌ undefined (protegido!)
```

**Documentação**: [MIGRATION_VENDEDORES_PUBLICOS.md](../docs/MIGRATION_VENDEDORES_PUBLICOS.md)

---

### 3. ⏰ Sistema de Expiração Automática de Destaques

#### [`auto_expire_highlights.sql`](./auto_expire_highlights.sql)

**Propósito**: Mudar automaticamente `highlight_home` e `highlight_category` para `false` quando a data de expiração for atingida.

**Quando usar**: Execute **UMA VEZ** para instalar o sistema.

**O que faz**:
- **Trigger Automático**: Detecta e limpa destaques expirados em INSERT/UPDATE
- **Função Periódica**: `scheduled_highlights_cleanup()` para limpeza manual/cron
- **View Facilitada**: `announcements_with_active_highlights` com campos calculados

**Componentes**:

1. **Trigger `clean_highlights_on_change`**:
   ```sql
   -- Executa ANTES de INSERT/UPDATE
   -- Verifica: highlight_home_until < NOW()
   -- Ação: SET highlight_home = false
   ```

2. **Função `scheduled_highlights_cleanup()`**:
   ```sql
   -- Executa limpeza manual ou via cron
   -- Retorna estatísticas de quantos foram limpos
   SELECT * FROM scheduled_highlights_cleanup();
   ```

3. **View `announcements_with_active_highlights`**:
   ```sql
   -- Adiciona colunas:
   -- - is_home_highlight_active (bool)
   -- - is_category_highlight_active (bool)
   SELECT * FROM announcements_with_active_highlights
   WHERE is_home_highlight_active = true;
   ```

**Instalação**:
```sql
-- 1. Execute o arquivo completo no Supabase SQL Editor

-- 2. Verificar instalação
SELECT trigger_name FROM information_schema.triggers
WHERE trigger_name = 'clean_highlights_on_change';

-- 3. Executar limpeza inicial
SELECT * FROM scheduled_highlights_cleanup();

-- Resultado esperado:
-- home_highlights_cleaned | category_highlights_cleaned | total_cleaned
-- 5                       | 3                           | 8
```

**Cron Job (Opcional)**:
```yaml
# .github/workflows/cleanup-highlights.yml
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

**Documentação**: 
- [HIGHLIGHT_EXPIRATION.md](../docs/HIGHLIGHT_EXPIRATION.md) (completa)
- [QUICK_START_HIGHLIGHT_EXPIRATION.md](../docs/QUICK_START_HIGHLIGHT_EXPIRATION.md) (rápida)

---

## 📊 Ordem de Execução Recomendada

Execute os scripts na seguinte ordem para evitar problemas de dependência:

1. **Primeiro**: `create_vendedores_publicos_view.sql`
   - Não depende de nenhum outro script
   - Necessário para exibir dados do vendedor

2. **Segundo**: `censor_contact_trigger.sql`
   - Protege novos anúncios automaticamente
   - Deve ser instalado ANTES da migração

3. **Terceiro**: `migrate_existing_announcements_censorship.sql`
   - Aplica censura em anúncios antigos
   - Requer que o trigger já esteja instalado

4. **Quarto**: `auto_expire_highlights.sql`
   - Gerencia expiração de destaques
   - Independente dos outros scripts

---

## 🧪 Testes Completos

### Teste Global do Sistema

```sql
-- ===================================
-- TESTE 1: View Vendedores Públicos
-- ===================================

-- Deve retornar dados sem informações sensíveis
SELECT * FROM vendedores_publicos LIMIT 1;

-- Resultado esperado:
-- id | name | avatar | document_verified | cidade | estado
-- ✅ SEM: phone, email, cpf, password, etc.

-- ===================================
-- TESTE 2: Censura de Contatos
-- ===================================

-- Criar anúncio com telefone no título
INSERT INTO announcements (
  title, user_id, category_id, price, status, city, state
)
VALUES (
  'Vendo trator (11) 98765-4321', 
  'USER-ID', 'CAT-ID', 50000, 'ACTIVE', 'SP', 'SP'
)
RETURNING title;

-- Resultado esperado:
-- title: "Vendo trator [CONTATO PROTEGIDO]"
-- ✅ Telefone foi censurado automaticamente!

-- ===================================
-- TESTE 3: Expiração de Destaques
-- ===================================

-- Criar anúncio com destaque expirado
INSERT INTO announcements (
  title, user_id, category_id, price, status, city, state,
  highlight_home, highlight_home_until
)
VALUES (
  'Teste Destaque', 'USER-ID', 'CAT-ID', 1000, 'ACTIVE', 'SP', 'SP',
  true, NOW() - INTERVAL '1 day' -- Já expirado!
)
RETURNING highlight_home, highlight_home_until;

-- Resultado esperado:
-- highlight_home: false (trigger mudou automaticamente!)
-- ✅ Destaque expirado foi limpo!

-- ===================================
-- TESTE 4: View de Destaques Ativos
-- ===================================

SELECT 
  id, title, 
  highlight_home, 
  is_home_highlight_active
FROM announcements_with_active_highlights
WHERE highlight_home = true
LIMIT 5;

-- Resultado esperado:
-- is_home_highlight_active = true apenas se NÃO expirado
-- ✅ View calcula status correto automaticamente!
```

---

## 🔧 Troubleshooting Global

### Problema 1: "relation does not exist"

**Causa**: Script executado fora de ordem ou não executado.

**Solução**:
```sql
-- Verificar quais objetos existem
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('vendedores_publicos', 'announcements_with_active_highlights');

SELECT trigger_name FROM information_schema.triggers
WHERE trigger_name IN ('censor_announcements_contact', 'clean_highlights_on_change');

-- Se algum estiver faltando, executar o script correspondente
```

---

### Problema 2: "permission denied"

**Causa**: Permissões não configuradas corretamente.

**Solução**:
```sql
-- Garantir permissões na view
GRANT SELECT ON vendedores_publicos TO anon, authenticated;

-- Garantir permissões na função
GRANT EXECUTE ON FUNCTION scheduled_highlights_cleanup() TO anon, authenticated;
```

---

### Problema 3: Trigger não executa

**Causa**: Trigger foi desativado ou não foi criado.

**Solução**:
```sql
-- Verificar se está ativo
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE event_object_table = 'announcements';

-- Se não aparecer, recriar triggers
-- Executar novamente censor_contact_trigger.sql
-- Executar novamente auto_expire_highlights.sql
```

---

## 📚 Estrutura de Documentação

```
docs/
├── CONTACT_CENSORSHIP.md              # Sistema de censura (completo)
├── QUICK_START_CENSORSHIP.md          # Guia rápido de censura
├── MIGRATION_GUIDE_CENSORSHIP.md      # Guia de migração
├── MIGRATION_VENDEDORES_PUBLICOS.md   # View de vendedores
├── AJUSTE_VISUALIZACAO_VENDEDOR.md    # Resumo executivo
├── HIGHLIGHT_EXPIRATION.md            # Expiração de destaques (completo)
└── QUICK_START_HIGHLIGHT_EXPIRATION.md # Guia rápido de expiração

sql/
├── README.md                                    # Este arquivo
├── censor_contact_trigger.sql                   # Trigger de censura
├── migrate_existing_announcements_censorship.sql # Migração de censura
├── create_vendedores_publicos_view.sql          # View pública
└── auto_expire_highlights.sql                   # Sistema de expiração
```

---

## ✅ Checklist de Implementação Completa

### Scripts Essenciais (Execute SEMPRE)

- [ ] Executar `create_vendedores_publicos_view.sql`
- [ ] Executar `censor_contact_trigger.sql`
- [ ] Executar `auto_expire_highlights.sql`
- [ ] Verificar que todos os triggers foram criados
- [ ] Executar `scheduled_highlights_cleanup()` para limpeza inicial
- [ ] Testar censura criando anúncio com telefone
- [ ] Testar expiração criando destaque expirado

### Scripts Opcionais (Execute APENAS SE NECESSÁRIO)

- [ ] Executar `migrate_existing_announcements_censorship.sql` (apenas se há anúncios antigos)
- [ ] Configurar Cron Job para `scheduled_highlights_cleanup()` (opcional)
- [ ] Criar índices para performance (se banco estiver lento)

---

## 🎯 Status dos Scripts

| Script | Status | Priority | Instalado? |
|--------|--------|----------|------------|
| `create_vendedores_publicos_view.sql` | ✅ Pronto | HIGH | ⚠️ Aguarda execução |
| `censor_contact_trigger.sql` | ✅ Pronto | HIGH | ⚠️ Aguarda execução |
| `migrate_existing_announcements_censorship.sql` | ✅ Pronto | MEDIUM | ⚠️ Opcional |
| `auto_expire_highlights.sql` | ✅ Pronto | MEDIUM | ⚠️ Aguarda execução |

---

## 📞 Suporte

Para dúvidas ou problemas:

1. Consulte a documentação específica de cada script (links acima)
2. Verifique a seção de Troubleshooting
3. Execute os testes completos para identificar o problema
4. Verifique logs do Supabase SQL Editor

---

**Última atualização**: Dezembro 2024  
**Manutenção**: Verifique periodicamente o dashboard de monitoramento  
**Backup**: Sempre crie backup antes de executar migrações
