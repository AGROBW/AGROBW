# Sistema de Validação de Documentos por OCR

## 📋 Visão Geral

Sistema automatizado de validação de documentos usando OCR.space API para extrair CPF/CNPJ de imagens e compará-los com os dados cadastrados no perfil do usuário.

## 🔑 Configuração da API

**API**: OCR.space (Free Tier)
- **Endpoint**: `https://api.ocr.space/parse/image`
- **API Key**: `K85883462288957` (hardcoded temporariamente)
- **Idioma**: Português (`por`)
- **Limite**: 500 requisições/dia (free tier)
- **Suporte a PDF**: Ativado para arquivos <1MB (parâmetro `filetype: 'PDF'`)

### 📏 Limitações de Tamanho

Para garantir velocidade e evitar erros da API:

- **PDFs < 1MB**: Validação OCR automática
- **PDFs > 1MB**: Análise manual (reduz carga na API e evita timeouts)
- **Imagens**: Sem limite específico (já validado no upload - max 10MB)

### ⚠️ Migração Futura

A chave da API está atualmente no front-end para prototipagem rápida. **Recomendado migrar para Edge Function do Supabase** para segurança:

```typescript
// supabase/functions/validate-document/index.ts
export default async function handler(req: Request) {
  const formData = await req.formData();
  const file = formData.get('file');
  
  // OCR processing com API key no servidor
  // ...
}
```

## 🎯 Funcionalidades

### 1. Extração de Documento

Regex flexível para identificar CPF e CNPJ com ou sem formatação:

**CPF**:
- Formatado completo: `123.456.789-00`
- Sem pontos: `123456789-00`
- Com espaços: `123 456 789-00`
- Sem formatação: `12345678900`
- **Regex**: `/\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}/g`

**CNPJ**:
- Formatado completo: `12.345.678/0001-90`
- Sem pontos: `12345678/0001-90`
- Com espaços: `12 345 678/0001-90`
- Sem formatação: `12345678000190`
- **Regex**: `/\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}/g`

**Lógica de Normalização**:
1. Remove quebras de linha e múltiplos espaços
2. Busca padrão com regex flexível (separadores opcionais)
3. Remove todos os caracteres não numéricos (`\D`)
4. Valida comprimento: 11 dígitos (CPF) ou 14 dígitos (CNPJ)
5. Retorna apenas números para comparação

**Exemplos de Conversão**:
```
"61 232.149/0001-90"  → "61232149000190"
"029.177.601-92"      → "02917760192"
"61232149/0001-90"    → "61232149000190"
"029 177 601-92"      → "02917760192"
```

### 2. Fluxo de Validação

#### Para Imagens (JPG, PNG)

1. **Upload** → `verification_docs/{username}/{filename}`
2. **OCR Automático** → Extração de texto via OCR.space
3. **Parsing** → Busca por CPF/CNPJ usando regex
4. **Comparação** → Confronto com `users.document`
5. **Atualização**:
   - `document_path`: Caminho do arquivo
   - `document_verified`: `true` (validado) ou `false` (erro)
6. **Feedback UI** → Badge verde (✅) ou vermelho (❌)

#### Para PDFs

**PDFs Pequenos (<1MB):**

1. **Upload** → `verification_docs/{username}/{filename}`
2. **OCR Automático** → Extração de texto via OCR.space com `filetype: 'PDF'`
3. **Parsing** → Busca por CPF/CNPJ usando regex
4. **Comparação** → Confronto com `users.document`
5. **Atualização**:
   - `document_path`: Caminho do arquivo
   - `document_verified`: `true` (validado) ou `false` (erro)
6. **Feedback UI** → Badge verde (✅) ou vermelho (❌)

**PDFs Grandes (>1MB):**

1. **Upload** → `verification_docs/{username}/{filename}`
2. **Análise Manual** → Sem OCR (limitação de processamento)
3. **Atualização**:
   - `document_path`: Caminho do arquivo
   - `document_verified`: `null` (pendente)
4. **Feedback UI** → Mensagem "📄 PDF enviado! Por ser um arquivo grande, aguarde análise manual"

### 3. Estados de Validação

```typescript
// Durante upload
isUploadingDocument: boolean

// Durante validação OCR
isValidatingDocument: boolean

// Resultado da validação
validationResult: {
  success: boolean;
  message: string;
  extractedDocument?: string; // CPF/CNPJ extraído
} | null
```

### 4. Coluna no Banco de Dados

```sql
ALTER TABLE users 
ADD COLUMN document_verified BOOLEAN DEFAULT FALSE;

-- Valores possíveis:
-- TRUE  = Validado automaticamente por OCR
-- FALSE = Erro na validação (documento não bate)
-- NULL  = Não enviado ou aguardando análise manual (PDF)
```

## 📱 Mensagens de Feedback

### Sucesso ✅

```
✅ Documento validado com sucesso!
```

### Erros ❌

```
❌ Não foi possível extrair texto do documento.
❌ Não foi possível identificar CPF ou CNPJ.
❌ Os dados não batem. Extraído: 12345678900 | Cadastrado: 98765432100
❌ Erro ao comunicar com a API de OCR
```

### Avisos ⚠️

```
⚠️ Você ainda não cadastrou seu CPF/CNPJ no perfil.
```

### Informações ℹ️

```
Documento PDF enviado! Aguarde análise manual.
```

## 🧪 Testes Recomendados

### Teste 1: CPF Válido (Imagem)
- **Documento**: RG ou CNH com CPF visível
- **Resultado Esperado**: ✅ Validado (se CPF bater com cadastro)

### Teste 2: CNPJ Válido (Imagem)
- **Documento**: Contrato Social com CNPJ
- **Resultado Esperado**: ✅ Validado (se CNPJ bater com cadastro)

### Teste 3: PDF Pequeno com CPF (<1MB)
- **Documento**: PDF de RG escaneado (< 1MB)
- **Resultado Esperado**: ✅ Validado automaticamente via OCR

### Teste 4: PDF Grande (>1MB)
- **Documento**: PDF multipágina ou alta resolução
- **Resultado Esperado**: 📄 "Aguarde análise manual"

### Teste 5: Documento Sem CPF/CNPJ
- **Documento**: Foto aleatória ou documento sem identificação
- **Resultado Esperado**: ❌ "Não foi possível identificar CPF ou CNPJ"

### Teste 6: Documento com CPF Diferente
- **Documento**: RG de terceiro
- **Resultado Esperado**: ❌ "Os dados não batem"

### Teste 7: Imagem Borrada
- **Documento**: Foto com baixa qualidade
- **Resultado Esperado**: ❌ "Não foi possível extrair texto" ou "Não identificado"

## 🔍 Debugging

### Console Logs

```typescript
console.log('[OCR] Texto extraído:', parsedText);
console.log('[OCR] CNPJ encontrado:', '61.232.149/0001-90', '→', '61232149000190');
console.log('[OCR] CPF encontrado:', '029 177.601-92', '→', '02917760192');
```

### Verificar Response da API

```javascript
{
  "ParsedResults": [
    {
      "ParsedText": "REPÚBLICA FEDERATIVA DO BRASIL\nRG 12.345.678-9\nCPF: 123.456.789-00\n...",
      "ErrorMessage": "",
      "FileParseExitCode": 1
    }
  ],
  "IsErroredOnProcessing": false
}
```

### Casos de Teste para Regex Flexível

**Cenário 1: OCR omite pontos**
- Input: `"CNPJ: 61232149/0001-90"`
- Match: `61232149/0001-90`
- Output: `61232149000190` ✅

**Cenário 2: OCR troca pontos por espaços**
- Input: `"CPF 029 177 601-92"`
- Match: `029 177 601-92`
- Output: `02917760192` ✅

**Cenário 3: OCR omite todos os separadores**
- Input: `"CPF 12345678900"`
- Match: `123 456 789 00` (com espaços aleatórios)
- Output: `12345678900` ✅

**Cenário 4: Formatação completa**
- Input: `"12.345.678/0001-90"`
- Match: `12.345.678/0001-90`
- Output: `12345678000190` ✅

## 📊 Priorização de Documento

A função `extractDocumentFromText()` prioriza CNPJ sobre CPF:

1. **Busca CNPJ** (14 dígitos): Útil para empresas
2. **Se não encontrar, busca CPF** (11 dígitos): Pessoas físicas
3. **Remove formatação**: `.`, `-`, `/` antes de retornar

## 🛡️ Segurança

### Dados Sensíveis
- Documentos armazenados em bucket privado (`verification_docs`)
- RLS (Row Level Security) aplicado no Supabase
- Criptografia em trânsito (HTTPS)

### API Key Exposure
⚠️ **IMPORTANTE**: API key está no front-end temporariamente.

**Migração para Edge Function antes de produção:**

```bash
# Criar Edge Function
supabase functions new validate-document

# Deploy
supabase functions deploy validate-document
```

## 🚀 Próximos Passos

1. ✅ Implementar validação OCR (COMPLETO)
2. ✅ Adicionar feedback visual (COMPLETO)
3. ⏳ Migrar API key para Edge Function
4. ⏳ Adicionar verificação de qualidade de imagem
5. ⏳ Implementar fila para análise manual de PDFs
6. ⏳ Dashboard admin para revisar documentos pendentes
7. ⏳ Notificações por email sobre status de verificação

## 📞 Suporte

Em caso de dúvidas sobre a implementação:
- Consultar código em: `pages/UserDashboardView.tsx` (linhas 130-367)
- Verificar tipos em: `types.ts`
- SQL em: `sql/add_document_verified_column.sql`
