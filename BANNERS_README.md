# 🎯 Sistema de Gestão de Banners - Guia de Configuração

## 📋 Visão Geral

Sistema completo de CRUD para gerenciar banners dinâmicos da Home com:
- ✅ Painel administrativo com preview em tempo real
- ✅ Upload otimizado (redimensionamento + conversão WebP)
- ✅ Integração automática com o slider da Home
- ✅ Controle de visibilidade e ordenação
- ✅ Storage seguro no Supabase

---

## 🗄️ PASSO 1: Configurar Banco de Dados

### 1.1 Criar Tabela `home_banners`

Execute o arquivo SQL no Supabase:

```bash
sql/create_home_banners.sql
```

**O que este script faz:**
- ✅ Cria tabela `home_banners` com todos os campos necessários
- ✅ Configura índices para performance
- ✅ Habilita RLS (Row Level Security)
- ✅ Cria políticas de acesso (admins escrevem, público lê banners ativos)
- ✅ Insere 2 banners iniciais (migração dos dados estáticos)

**Verificar se funcionou:**
```sql
SELECT * FROM home_banners;
-- Deve retornar 2 banners
```

---

## 📦 PASSO 2: Configurar Storage Bucket

### 2.1 Criar Bucket `banners`

**Opção A: Via Dashboard (Recomendado)**
1. Acesse **Supabase Dashboard > Storage**
2. Clique em **Create Bucket**
3. Configure:
   - **Name:** `banners`
   - **Public:** ✅ Enabled (para leitura pública)
   - **File size limit:** 5 MB
   - **Allowed MIME types:** `image/jpeg, image/png, image/webp, image/avif`
4. Clique em **Create**

**Opção B: Via SQL**
```sql
-- Execute apenas se não criou pelo Dashboard
INSERT INTO storage.buckets (id, name, public)
VALUES ('banners', 'banners', true)
ON CONFLICT (id) DO NOTHING;
```

### 2.2 Configurar Políticas RLS do Storage

Execute o arquivo SQL:

```bash
sql/configure_banners_storage.sql
```

**O que este script faz:**
- ✅ Cria políticas de upload (apenas admins)
- ✅ Cria políticas de leitura (público)
- ✅ Cria políticas de delete (apenas admins)

**Verificar se funcionou:**
```sql
SELECT * FROM storage.buckets WHERE id = 'banners';
-- Deve retornar 1 linha com public = true

SELECT policyname FROM pg_policies 
WHERE schemaname = 'storage' 
  AND tablename = 'objects'
  AND policyname LIKE '%banner%';
-- Deve retornar 4 políticas
```

---

## 🎨 PASSO 3: Testar o Sistema

### 3.1 Acessar Painel Admin

1. Faça login como admin
2. Navegue para: **Admin > Configurações**
3. Clique na aba **Banners Home**

### 3.2 Criar Primeiro Banner

1. Clique em **Novo Banner**
2. Preencha os campos:
   - **Imagem:** Selecione uma imagem (será otimizada automaticamente)
   - **Título:** Ex: "Promoção de Inverno"
   - **Subtítulo:** Ex: "Até 50% de desconto em insumos"
   - **Texto do Badge:** Ex: "Oferta Limitada"
   - **Texto do Botão:** Ex: "Ver Ofertas"
   - **Link do Botão:** Ex: `#/categoria/insumos`
   - **Ordem:** 1
   - ✅ **Banner ativo**
3. Visualize o **Preview em Tempo Real** abaixo do formulário
4. Clique em **Criar Banner**

### 3.3 Verificar na Home

1. Acesse a página inicial do site
2. O novo banner deve aparecer no slider automaticamente
3. Teste:
   - ✅ Navegação entre slides (setas)
   - ✅ Dots de paginação
   - ✅ Auto-play (6 segundos)
   - ✅ Link do botão funcionando

---

## 🔧 Funcionalidades do Painel

### Listagem de Banners
- **Miniatura:** Preview da imagem
- **Informações:** Título, subtítulo, badge, botão
- **Status:** Badge verde (Ativo) ou cinza (Inativo)
- **Ordem:** Número de ordenação

### Ações Disponíveis
- 👁️ **Ativar/Desativar:** Toggle de visibilidade
- ✏️ **Editar:** Modificar qualquer campo
- 🗑️ **Deletar:** Remove banner + imagem do storage

### Preview em Tempo Real
- Ao preencher o formulário e fazer upload da imagem
- Mostra exatamente como ficará na Home
- Atualiza automaticamente ao editar textos

---

## ⚙️ Otimização de Imagens

### Processo Automático
1. **Upload:** Usuário seleciona imagem (JPG/PNG/WebP)
2. **Validação:** Máximo 10MB
3. **Redimensionamento:** Ajusta para 1600x600px (mantém proporção)
4. **Conversão:** Transforma em WebP (85% de qualidade)
5. **Compressão:** Resultado final ~100-200kb
6. **Storage:** Upload para `banners/` no Supabase

### Dimensões Recomendadas
- **Largura:** 1600px ou superior
- **Altura:** 600px ou superior
- **Proporção:** 8:3 (landscape)
- **Peso Final:** ~100-200kb (após otimização)

---

## 🛠️ Arquivos Criados

### SQL
- `sql/create_home_banners.sql` - Tabela + RLS + Dados iniciais
- `sql/configure_banners_storage.sql` - Storage bucket + Políticas

### TypeScript
- `src/hooks/useBanners.ts` - Hook React para CRUD
- `src/services/bannerService.ts` - Upload otimizado de imagens
- `pages/admin/BannersManagement.tsx` - Painel administrativo
- `pages/admin/SettingsView.tsx` - Página de configurações (atualizada)
- `components/AdSlider.tsx` - Slider da Home (atualizado)

---

## 📊 Fluxo de Dados

```
┌─────────────────────────────────────────────────────────┐
│              PAINEL ADMINISTRATIVO                      │
│                                                         │
│  Admin cria/edita banner                               │
│  ↓                                                      │
│  Upload de imagem                                      │
│  ↓                                                      │
│  [bannerService.ts]                                    │
│  • Redimensiona (1600x600)                            │
│  • Converte para WebP                                  │
│  • Comprime (~200kb)                                   │
│  ↓                                                      │
│  Supabase Storage (bucket: banners)                   │
│  ↓                                                      │
│  Retorna URL pública                                   │
│  ↓                                                      │
│  [useBanners.ts]                                       │
│  • Salva no banco (home_banners)                      │
│  ↓                                                      │
│  ✅ Banner disponível                                  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                   HOME (SLIDER)                         │
│                                                         │
│  [AdSlider.tsx]                                        │
│  ↓                                                      │
│  useEffect(() => {                                     │
│    fetchBanners()                                      │
│  })                                                     │
│  ↓                                                      │
│  SELECT * FROM home_banners                            │
│  WHERE is_active = true                                │
│  ORDER BY sort_order                                   │
│  ↓                                                      │
│  Renderiza banners ativos                             │
│  ↓                                                      │
│  ✅ Slider funcionando                                 │
└─────────────────────────────────────────────────────────┘
```

---

## 🐛 Troubleshooting

### ❌ Erro: "Não é possível fazer upload"
**Causa:** RLS bloqueando upload  
**Solução:** Execute `sql/configure_banners_storage.sql`

### ❌ Erro: "Função is_admin() não existe"
**Causa:** Função não criada (necessária para RLS)  
**Solução:** Execute `sql/fix_rls_recursion.sql` (já deve estar aplicado)

### ❌ Banners não aparecem na Home
**Possíveis causas:**
1. Banner está desativado → Ative no painel
2. Tabela não foi criada → Execute `sql/create_home_banners.sql`
3. RLS bloqueando leitura → Verifique políticas


### ❌ Imagem não carrega/aparece quebrada
**Possíveis causas:**
1. Bucket não é público → Configure bucket como público
2. Políticas de leitura faltando → Execute SQL de storage
3. URL incorreta → Verifique se campo `image_url` está preenchido

---

## 🎯 Checklist de Configuração

- [ ] Executar `sql/create_home_banners.sql`
- [ ] Criar bucket `banners` via Dashboard
- [ ] Executar `sql/configure_banners_storage.sql`
- [ ] Verificar que função `is_admin()` existe
- [ ] Testar criar banner no painel
- [ ] Verificar otimização de imagem (deve ser WebP)
- [ ] Confirmar que banner aparece na Home
- [ ] Testar ativar/desativar banner
- [ ] Testar edição de banner
- [ ] Testar exclusão de banner

---

## 📝 Notas Importantes

1. **Performance:** Imagens são otimizadas automaticamente para WebP, garantindo carregamento rápido
2. **Segurança:** RLS garante que apenas admins podem criar/editar banners
3. **Fallback:** Se não houver banners ativos, exibe banner padrão do sistema
4. **Ordenação:** Use campo `sort_order` para controlar a sequência de exibição
5. **Migração:** Os 2 banners estáticos originais foram migrados para o banco

---

## 🚀 Próximos Passos

Após configurar banners, você pode:
1. **Páginas Institucionais:** Implementar CRUD similar para páginas
2. **Planos de Assinatura:** Criar gestão dinâmica de planos
3. **Analytics:** Adicionar tracking de cliques nos banners
4. **A/B Testing:** Implementar testes A/B de banners
5. **Agendamento:** Permitir agendar ativação/desativação de banners

---

**Sistema implementado com sucesso! 🎉**

Qualquer dúvida, consulte este README ou os comentários no código.
