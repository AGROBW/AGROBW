# Troubleshooting: Especificações Técnicas não Gravando

## Diagnóstico Implementado

### Logs de Debug Adicionados

O sistema agora exibe logs detalhados em cada etapa:

#### 1. **Seleção de Categoria**
```javascript
[Debug] Categoria selecionada: Máquinas maquinas
[Debug] Schema de campos técnicos carregado: [{...}]
```
**Ou, se não houver schema:**
```javascript
[Debug] Nenhum schema de campos técnicos definido para esta categoria
```

#### 2. **Preenchimento dos Campos**
Ao digitar nos inputs dinâmicos, o `formData.technical` é atualizado automaticamente.

#### 3. **Ao Publicar Anúncio**
```javascript
[Publish] Iniciando publicação com dados: {
  categoryId: "uuid...",
  technical: { ano: "2024", horas_uso: "5000" },
  technicalFieldsSchemaLength: 6
}
```

#### 4. **Processamento dos Dados**
```javascript
[Debug] Dados técnicos para salvar: { ano: "2024", horas_uso: "5000" }
[Debug] Schema de campos técnicos: [{key: "ano", label: "Ano", ...}, ...]
[Debug] Campo "Ano" (ano): 2024 | Incluir: true
[Debug] Campo "Horas de Uso" (horas_uso): 5000 | Incluir: true
[Debug] Detalhes técnicos a serem inseridos: [
  {announcement_id: "...", label: "Ano", value: "2024", icon_name: "Calendar"},
  {announcement_id: "...", label: "Horas de Uso", value: "5000", icon_name: "Gauge"}
]
```

#### 5. **Resultado da Gravação**
**Sucesso:**
```javascript
[Publish] Detalhes técnicos antigos removidos (se existiam)
[Publish] Especificações técnicas salvas com sucesso: 2 registros
```

**Erro:**
```javascript
[Publish] Erro ao salvar especificações técnicas: {error}
```

## Checklist de Diagnóstico

### ✅ Passo 1: Verificar Schema no Banco
```sql
-- Execute no Supabase SQL Editor
SELECT id, name, slug, technical_fields_schema 
FROM categories 
WHERE slug = 'maquinas'; -- ou outra categoria

-- Se retornar NULL, execute:
-- sql/populate_technical_fields_schema.sql
```

### ✅ Passo 2: Verificar Logs no Console
1. Abra DevTools (F12)
2. Selecione uma categoria
3. Procure por: `[Debug] Schema de campos técnicos carregado`
4. Se não aparecer, o schema não está no banco

### ✅ Passo 3: Verificar Inputs Renderizados
1. Após selecionar categoria, os campos técnicos devem aparecer
2. Se não aparecerem: `technicalFieldsSchema` está vazio
3. Verifique o log: `[Debug] Nenhum schema de campos técnicos definido`

### ✅ Passo 4: Verificar Dados no formData
1. Preencha os campos técnicos
2. Clique em "Publicar"
3. Procure no console: `[Publish] Iniciando publicação com dados`
4. Verifique se `technical` tem os valores preenchidos

### ✅ Passo 5: Verificar Insert no Banco
```sql
-- Após publicar, verifique se os dados foram salvos
SELECT * FROM announcement_technical_details 
WHERE announcement_id = 'seu-uuid-aqui'
ORDER BY created_at DESC;
```

## Cenários Comuns de Erro

### ❌ Erro 1: Schema NULL no Banco
**Sintoma:**
```javascript
[Debug] Nenhum schema de campos técnicos definido para esta categoria
```

**Solução:**
Execute o script `sql/populate_technical_fields_schema.sql` no Supabase SQL Editor.

---

### ❌ Erro 2: Campos Não Aparecem na Tela
**Sintoma:** Após selecionar categoria, nenhum campo técnico é renderizado.

**Possíveis causas:**
1. Schema vazio no banco
2. `categoryId` não está sendo setado corretamente
3. `dbCategories` não carregou

**Solução:**
```javascript
// No console, execute:
console.log(formData.categoryId); // Deve retornar UUID
console.log(dbCategories); // Deve retornar array com categorias
console.log(technicalFieldsSchema); // Deve retornar array com campos
```

---

### ❌ Erro 3: formData.technical Vazio
**Sintoma:**
```javascript
[Debug] Dados técnicos para salvar: {}
```

**Causa:** Inputs não estão atualizando o estado.

**Solução:**
Verifique se os inputs têm:
```typescript
value={formData.technical?.[field.key] || ''}
onChange={e => setFormData({...formData, technical: {...formData.technical, [field.key]: e.target.value}})}
```

---

### ❌ Erro 4: Insert Falha no Banco
**Sintoma:**
```javascript
[Publish] Erro ao salvar especificações técnicas: {error}
```

**Possíveis causas:**
1. Tabela `announcement_technical_details` não existe
2. Permissões RLS bloqueando insert
3. Foreign key inválida

**Soluções:**
```sql
-- 1. Verificar se tabela existe
SELECT * FROM information_schema.tables 
WHERE table_name = 'announcement_technical_details';

-- 2. Verificar RLS
SELECT * FROM pg_policies 
WHERE tablename = 'announcement_technical_details';

-- 3. Criar política de insert se necessário
CREATE POLICY "Usuários podem inserir seus próprios detalhes técnicos"
ON announcement_technical_details
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM announcements 
    WHERE announcements.id = announcement_technical_details.announcement_id 
    AND announcements.user_id = auth.uid()
  )
);
```

---

### ❌ Erro 5: Dados Salvos mas Não Aparecem
**Sintoma:** Console mostra sucesso, mas `AdDetailView` não exibe especificações.

**Solução:**
Verifique o hook `useAd`:
```typescript
// Deve buscar os dados corretamente
announcement_technical_details (label, value, icon_name)
```

---

## Teste Passo a Passo

### 1. Limpar Cache
```javascript
// No console do navegador
localStorage.clear();
sessionStorage.clear();
location.reload();
```

### 2. Criar Novo Anúncio
1. Selecione categoria "Máquinas"
2. Console deve mostrar: `[Debug] Schema de campos técnicos carregado`
3. Preencha título e descrição
4. Preencha campos técnicos (Ano: 2024, Horas: 5000)
5. Adicione imagens
6. Publique

### 3. Verificar Console
```javascript
[Publish] Iniciando publicação com dados: {...}
[Debug] Dados técnicos para salvar: { ano: "2024", horas_uso: "5000" }
[Debug] Campo "Ano" (ano): 2024 | Incluir: true
[Debug] Detalhes técnicos a serem inseridos: [{...}]
[Publish] Especificações técnicas salvas com sucesso: 2 registros
```

### 4. Verificar no Banco
```sql
SELECT 
  a.title,
  atd.label,
  atd.value,
  atd.icon_name
FROM announcements a
LEFT JOIN announcement_technical_details atd ON atd.announcement_id = a.id
WHERE a.id = 'seu-uuid-aqui';
```

### 5. Verificar na Tela
1. Acesse a página de detalhes do anúncio
2. Seção "Especificações Técnicas" deve aparecer
3. Deve exibir: "Ano: 2024" e "Horas de Uso: 5000"

---

## Ainda Não Funciona?

### Último Recurso: Console SQL Direto
```sql
-- Forçar insert manual para testar permissões
INSERT INTO announcement_technical_details (announcement_id, label, value, icon_name)
VALUES ('seu-uuid-do-anuncio', 'Teste', '123', 'Circle');

-- Se der erro, verifique a mensagem
```

### Contato de Suporte
Se após todos os passos ainda não funcionar, colete:
1. Logs completos do console (F12)
2. Resultado do SQL de verificação de schema
3. Screenshot dos campos preenchidos
4. Mensagem de erro do Supabase (se houver)

---

**Última atualização:** 7 de fevereiro de 2026
