# Sistema de Gestão da Página "Quem Somos"

## 📋 Visão Geral

Sistema completo de gerenciamento de conteúdo para a página "Quem Somos" com campos estruturados. **O design é fixo no código, apenas o conteúdo é editável** via painel admin.

---

## 🏗️ Arquitetura

### 1. Banco de Dados

**Tabela:** `about_page_content` (Singleton - apenas 1 registro)

**Estrutura:**
```sql
-- Estatísticas (Hero)
stat_users_value, stat_users_label     -- Ex: "10k+" / "USUÁRIOS ATIVOS"
stat_ads_value, stat_ads_label         -- Ex: "50k+" / "ANÚNCIOS CRIADOS"
stat_revenue_value, stat_revenue_label -- Ex: "850 Mi" / "NEGÓCIOS GERADOS"

-- História
history_title                          -- Ex: "Nossa História"
history_text                           -- Texto completo (TEXT)
history_image_url                      -- URL da imagem lateral

-- Pilares
mission_title, mission_text            -- Missão
vision_title, vision_text              -- Visão
values_title, values_text              -- Valores

-- Diferenciais
diff1_title, diff1_text                -- 01. Tecnologia de Ponta
diff2_title, diff2_text                -- 02. Facilidade de Uso
diff3_title, diff3_text                -- 03. Suporte Especializado
```

**RLS Policies:**
- ✅ Público pode ler (`SELECT`)
- ✅ Apenas admins podem editar (`UPDATE`)

### 2. Hook: `useAboutPage.ts`

```typescript
export const useAboutPage = (): UseAboutPageReturn => {
  const { content, isLoading, fetchContent, updateContent }
}

// Fallback automático se banco estiver vazio
export const ABOUT_PAGE_FALLBACK: AboutPageContent
```

### 3. Painel Admin: `AboutPageManagement.tsx`

**Localização:** `/admin/settings` → Aba "Quem Somos"

**Seções do Formulário:**

#### 📊 Estatísticas (Hero)
- 3 cards (Usuários, Anúncios, Receita)
- Valor + Label para cada

#### 📖 História
- Título da seção
- Texto completo (textarea)
- URL da imagem lateral (com preview)

#### 🎯 Pilares
- 3 colunas (Missão, Visão, Valores)
- Título + Descrição para cada

#### 💡 Diferenciais
- 3 itens numerados (01, 02, 03)
- Título + Descrição para cada

**Layout Fixed:**
- ✅ Cores (verde #10b981)
- ✅ Fontes e tamanhos
- ✅ Espaçamentos e animações
- ✅ Ícones e badges

**Editável:**
- ✅ Todos os textos
- ✅ URL da imagem da seção História
- ✅ Valores das estatísticas

### 4. Frontend: `AboutView.tsx`

**Antes:**
```tsx
import { ABOUT_DATA } from '../constants';
// Dados hardcoded estáticos
```

**Agora:**
```tsx
import { useAboutPage, ABOUT_PAGE_FALLBACK } from '../hooks/useAboutPage';

const { content, isLoading } = useAboutPage();
const data = content || ABOUT_PAGE_FALLBACK; // Fallback automático
```

**Benefícios:**
- 🔄 Conteúdo dinâmico (atualização sem deploy)
- 🎨 Design consistente (fixo no código)
- ⚡ Performance (singleton no banco)
- 🛡️ Seguro (RLS + validações)

---

## 🚀 Instalação

### Passo 1: Executar SQL

No SQL Editor do Supabase:

```bash
# Execute o arquivo completo:
sql/create_about_page.sql
```

Isso criará:
- ✅ Tabela `about_page_content`
- ✅ Políticas RLS
- ✅ Triggers (updated_at)
- ✅ Dados iniciais

### Passo 2: Verificar Dados

```sql
SELECT * FROM about_page_content;
```

Deve retornar **1 linha** com todos os valores padrão.

---

## 📝 Como Usar

### 1. Acessar Painel Admin

```
/#/admin/settings → Aba "Quem Somos"
```

### 2. Editar Conteúdo

**Estatísticas:**
- Digite valores curtos: `10k+`, `50k+`, `R$ 850M`
- Labels em MAIÚSCULAS: `USUÁRIOS ATIVOS`

**História:**
- Escreva texto corrido (sem formatação HTML)
- Cole URL de imagem do Unsplash ou similar (800x600px mínimo)

**Pilares:**
- Títulos curtos: "Missão", "Visão", "Valores"
- Textos de 1-2 parágrafos

**Diferenciais:**
- Títulos de 3-5 palavras
- Descrições de 1 parágrafo

### 3. Salvar

```
Botão "Salvar Alterações" → Logs automáticos em audit_logs
```

### 4. Verificar no Site

```
/#/quem-somos
```

Mudanças aparecem **instantaneamente** (sem cache).

---

## 🔧 Desenvolvimento

### Adicionar Novo Campo

**1. Banco de Dados:**
```sql
ALTER TABLE about_page_content 
ADD COLUMN new_field TEXT;
```

**2. Hook (TypeScript):**
```typescript
// src/hooks/useAboutPage.ts
export interface AboutPageContent {
  ...
  new_field: string;
}
```

**3. Painel Admin:**
```tsx
// pages/admin/AboutPageManagement.tsx
<input
  value={formData.new_field || ''}
  onChange={(e) => setFormData({ ...formData, new_field: e.target.value })}
/>
```

**4. Frontend:**
```tsx
// pages/AboutView.tsx
<p>{data.new_field}</p>
```

### Customizar Layout

Edite diretamente `pages/AboutView.tsx`:
```tsx
// Mudar cores
className="bg-green-700" → className="bg-blue-700"

// Mudar tamanhos
text-4xl → text-5xl

// Adicionar animações
hover:scale-110 transition-transform
```

**Importante:** Layout mudanças requerem **deploy**, mas conteúdo não.

---

## 🎯 Boas Práticas

### Imagens

✅ **Recomendado:**
- Unsplash, Pexels (alta qualidade)
- 1600x600px ou superior
- WebP ou JPG otimizado
- Tema: agronegócio, campo, tecnologia

❌ **Evitar:**
- Imagens < 800px (pixelizadas)
- GIFs animados (pesa muito)
- URLs quebradas (sempre testar)

### Textos

✅ **Bom:**
- Frases curtas e diretas
- Linguagem do público (prod rutor rural)
- Dados concretos (`10k+` ao invés de "muitos")

❌ **Evitar:**
- Parágrafos longos (quebrar em 2-3 linhas)
- Termos técnicos sem explicação
- Promessas vagas

### Estatísticas

✅ **Atualize regularmente:**
```
10k+ → 15k+ (quando atingir meta)
```

✅ **Formatos válidos:**
- `10k+` (milhares)
- `850 Mi` (milhões)
- `R$ 1.2 Bi` (bilhões)

---

## 🔒 Segurança

### RLS Configurado

```sql
-- Público LÊ
CREATE POLICY "Public can view about page"
USING (true);

-- Apenas ADMINS EDITAM
CREATE POLICY "Admins can update about page"
USING (public.is_admin() = true);
```

### Auditoria

Todas as edições são registradas em `admin_audit_logs`:
```typescript
await logAction({
  action: ADMIN_ACTIONS.UPDATE_PAGE_CONTENT,
  resourceType: RESOURCE_TYPES.PAGE,
  resourceId: content.id,
  newValue: { page: 'Quem Somos' }
});
```

Acesse logs em: `/#/admin/audit`

---

## 🐛 Troubleshooting

### "Página não carrega"

**Problema:** Banco vazio
**Solução:**
```sql
-- Re-execute insert inicial
INSERT INTO about_page_content (id, ...) VALUES (...);
```

**Problema:** RLS bloqueando
**Solução:**
```sql
-- Verificar políticas
SELECT * FROM pg_policies WHERE tablename = 'about_page_content';
```

### "Alterações não aparecem"

**Cache do navegador:**
```
Ctrl + Shift + R (force refresh)
```

**Verificar no banco:**
```sql
SELECT updated_at FROM about_page_content;
-- Deve ter timestamp recente
```

### "Imagem não aparece"

**URL inválida:**
- Testar URL diretamente no navegador
- Verificar CORS (Unsplash/Pexels são permitidos)
- Usar HTTPS (nunca HTTP)

---

## 📊 Diferenças do Sistema Anterior

### Antes (constants.tsx)

```tsx
export const ABOUT_DATA = {
  hero: { title: "...", subtitle: "..." },
  stats: [{ value: "10k+", label: "..." }],
  // ... hardcoded
};
```

**Problemas:**
- ❌ Editar requer código
- ❌ Deploy obrigatório
- ❌ Sem histórico de mudanças
- ❌ Sem permissões (qualquer dev)

### Agora (Banco + CMS)

```tsx
const { content } = useAboutPage();
// Dados dinâmicos do Supabase
```

**Vantagens:**
- ✅ Edição via painel admin
- ✅ Sem deploy necessário
- ✅ Logs de auditoria completos
- ✅ RLS (apenas admins)
- ✅ Rollback fácil (histórico no banco)

---

## 📚 Arquivos Relacionados

```
sql/
  └── create_about_page.sql          # Schema + dados iniciais

src/hooks/
  └── useAboutPage.ts                # Hook CRUD + fallback

pages/
  └── AboutView.tsx                  # Frontend público
  
pages/admin/
  ├── SettingsView.tsx               # Menu de configurações
  └── AboutPageManagement.tsx        # Painel de edição

components/
  └── Header.tsx                     # Link para /quem-somos
```

---

## 🎨 Customizações Futuras

### Upload de Imagem Direto

Substituir campo URL por upload:
```tsx
<input type="file" accept="image/*" onChange={handleImageUpload} />
```

Integrar com Supabase Storage (bucket `about-images`).

### Campos Adicionais

- `hero_cta_text`: Texto do botão CTA
- `video_url`: Vídeo institucional
- `team_section`: Seção "Nossa Equipe"

### Multi-idioma

Adicionar colunas `_en`, `_es`:
```sql
history_title_en TEXT,
history_title_es TEXT
```

---

## ✅ Checklist Pós-Instalação

- [ ] SQL executado sem erros
- [ ] 1 registro em `about_page_content`
- [ ] RLS policies ativas
- [ ] Aba "Quem Somos" visível em `/admin/settings`
- [ ] Formulário carrega com dados padrão
- [ ] Botão "Salvar" funciona
- [ ] Frontend `/quem-somos` renderiza corretamente
- [ ] Logs de auditoria registrando mudanças

---

**Desenvolvedor:** GitHub Copilot + Claude Sonnet 4.5  
**Data:** 13 de março de 2026  
**Versão:** 1.0.0
