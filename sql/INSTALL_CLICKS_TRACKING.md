# 🎯 Ativação do Sistema de Rastreamento de Cliques

Este guia detalha como ativar completamente o sistema "Alcance por Região" no Dashboard de Inteligência.

## 📋 Status Atual

✅ **Tabela existe**: `announcement_clicks_by_state` já está criada no banco  
❌ **Função RPC inexistente**: Falta a função para registrar cliques  
❌ **RLS não configurado**: Tabela está como UNRESTRICTED  
✅ **Frontend implementado**: Captura automática de cliques adicionada ao AdCard.tsx

## 🚀 Passos para Ativação

### **1. Criar Função RPC (OBRIGATÓRIO)**

Execute este script no SQL Editor do Supabase:

```bash
📁 sql/create_register_click_function.sql
```

**O que faz:**
- Cria função `register_click_by_state(p_announcement_id, p_state)`
- Implementa UPSERT: insere novo registro ou incrementa count existente
- Concede permissões para usuários anônimos e autenticados

**Como executar:**
1. Acesse: https://supabase.com/dashboard/project/SEU_PROJETO/sql/new
2. Copie o conteúdo do arquivo `create_register_click_function.sql`
3. Cole no SQL Editor
4. Clique em "Run"
5. Verifique se retorna: ✅ Success. No rows returned

---

### **2. Configurar Segurança RLS (OBRIGATÓRIO)**

Execute este script no SQL Editor do Supabase:

```bash
📁 sql/configure_clicks_rls.sql
```

**O que faz:**
- Ativa Row Level Security na tabela
- Permite INSERT público (visitantes anônimos podem registrar cliques)
- Restringe SELECT apenas para donos dos anúncios
- Garante privacidade dos dados de analytics

**Políticas criadas:**
- ✅ `Public can insert click records` - Qualquer visitante pode registrar
- ✅ `Users see only their announcement clicks` - Privacidade garantida
- ✅ `Users can update their announcement clicks` - Apenas via função RPC

---

### **3. Validar Instalação**

Execute estes comandos no SQL Editor para testar:

```sql
-- 1️⃣ Verificar se função foi criada
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_name = 'register_click_by_state';
-- ✅ Deve retornar 1 linha com routine_type = 'FUNCTION'

-- 2️⃣ Verificar políticas RLS
SELECT policyname, cmd, roles 
FROM pg_policies 
WHERE tablename = 'announcement_clicks_by_state';
-- ✅ Deve retornar 3 linhas (INSERT, SELECT, UPDATE)

-- 3️⃣ Testar inserção (substitua pelos valores reais)
SELECT register_click_by_state(
  'dc2f6bad-79ec-491b-9043-3d802...'::uuid, -- ID de anúncio existente
  'SP'
);
-- ✅ Deve retornar "Success. No rows returned"

-- 4️⃣ Conferir se foi registrado
SELECT * FROM announcement_clicks_by_state 
ORDER BY created_at DESC 
LIMIT 5;
-- ✅ Deve mostrar o clique de SP incrementado ou criado
```

---

## 🎨 Como Funciona no Frontend

### **Fluxo de Captura Automática:**

1. **Usuário clica** em "Ver Detalhes" em qualquer card de anúncio
2. **Detecção de estado** via `detectUserState()`:
   - 🔹 **Tentativa 1**: ipinfo.io (até 50k req/mês, mais confiável)
   - 🔹 **Tentativa 2**: ip-api.com (até 45 req/min, fallback)
   - 🔹 **Se falhar**: Ignora silenciosamente, não prejudica UX
3. **Registro assíncrono** via RPC (fire-and-forget):
   ```typescript
   supabase.rpc('register_click_by_state', {
     p_announcement_id: ad.id,
     p_state: userState // Ex: 'SP', 'RJ', 'MG'
   })
   ```
4. **Navegação não bloqueada** - Se analytics falhar, usuário nem percebe
5. **Dashboard atualiza** automaticamente no próximo reload

### **Arquivos Modificados:**

- ✅ `components/AdCard.tsx` - Captura de cliques adicionada
- ✅ `src/utils/geoLocation.ts` - Detecção de estado via IP (NOVO)
- ✅ `sql/create_register_click_function.sql` - Função RPC (NOVO)
- ✅ `sql/configure_clicks_rls.sql` - Políticas de segurança (NOVO)

---

## 📊 Visualização no Dashboard

Após a ativação, o módulo "Alcance por Região" em `UserDashboardView.tsx` exibirá:

- 🗺️ **Mapa do Brasil** com estados destacados por intensidade de cliques
- 📈 **Top 5 Estados** com maior número de cliques
- 📊 **Barras de progresso** mostrando proporção entre estados
- 📍 **Cores gradientes** indicando volume (verde claro → verde escuro)

**Exemplo de dados:**
```
1. SP - São Paulo          ████████████████ 847 cliques
2. MG - Minas Gerais      ████████████─── 623 cliques
3. RJ - Rio de Janeiro     ██████████───── 512 cliques
4. PR - Paraná             ████████─────── 401 cliques
5. RS - Rio Grande do Sul  ██████───────── 298 cliques
```

---

## 🔧 Troubleshooting

### **Erro: "function register_click_by_state does not exist"**
❌ Causa: Função RPC não foi criada  
✅ Solução: Execute o arquivo `sql/create_register_click_function.sql`

### **Erro: "permission denied for table announcement_clicks_by_state"**
❌ Causa: RLS bloqueando acesso  
✅ Solução: Execute o arquivo `sql/configure_clicks_rls.sql`

### **Cliques não aparecem no dashboard**
❌ Causa possível 1: Usuário não está logado (SELECT requer autenticação)  
✅ Solução: Faça login e recarregue o dashboard

❌ Causa possível 2: Cliques registrados para anúncios de outro usuário  
✅ Solução: RLS garante que você vê apenas cliques dos seus anúncios

### **Estado não detectado (null)**
❌ Causa: IP não brasileiro ou serviço ipapi.co fora do ar  
✅ Solução: Clique será ignorado, não prejudica UX. Verifique console do navegador

---

## 🎯 Próximos Passos

Após executar os scripts SQL:

1. ✅ Abra o site em navegador anônimo (Ctrl+Shift+N)
2. ✅ Navegue até listagem de anúncios
3. ✅ Clique em "Ver Detalhes" de alguns anúncios
4. ✅ Faça login como dono dos anúncios
5. ✅ Acesse o Dashboard → Módulo "Alcance por Região"
6. ✅ Verifique se os cliques estão sendo registrados

---

## 📝 Notas Técnicas

- **APIs de Geolocalização**: 
  - **ipinfo.io**: Até 50k requisições/mês (primária)
  - **ip-api.com**: Até 45 requisições/min (fallback)
- **Cache de sessão**: Estado do usuário é cacheado após primeira detecção
- **Privacidade**: RLS garante que cada usuário vê apenas analytics dos próprios anúncios
- **Performance**: Registro de cliques não bloqueia navegação (assíncrono)
- **Fallback gracioso**: Se detecção falhar, clique é ignorado silenciosamente
- **Resiliência**: Múltiplas APIs com fallback automático

---

## ✅ Checklist Final

- [ ] Executar `create_register_click_function.sql` no Supabase
- [ ] Executar `configure_clicks_rls.sql` no Supabase
- [ ] Validar com queries de teste
- [ ] Testar clique em anúncio (modo anônimo)
- [ ] Verificar dashboard do dono do anúncio
- [ ] Confirmar que dados aparecem no módulo "Alcance por Região"

---

🎉 **Sistema pronto para uso!** Os cliques serão capturados automaticamente a partir de agora.
