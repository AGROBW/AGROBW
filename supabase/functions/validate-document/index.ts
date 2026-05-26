import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { logSecurityEvent, extractBearerToken } from '../_shared/security.ts';
import { getCorsHeaders, handleCorsPreflightBrowser } from '../_shared/cors.ts';
import { checkRateLimit, rateLimitResponse } from '../_shared/rateLimit.ts';

// VULN-017: Tipos de arquivo permitidos para validação de documento
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

/** Tamanho máximo do arquivo: 5MB */
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Verifica os magic bytes do arquivo para confirmar o tipo real.
 * Não confiar apenas no MIME type declarado pelo cliente.
 */
const verifyFileMagicBytes = async (file: File): Promise<boolean> => {
  const buffer = await file.slice(0, 5).arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return true;
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return true;
  // WEBP: starts with RIFF....WEBP (bytes 0-3 = RIFF, 8-11 = WEBP)
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return true;
  // PDF: %PDF
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return true;

  return false;
};

const jsonResponse = (req: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      'Content-Type': 'application/json',
    },
  });

const formatDocument = (doc: string) => {
  const cleanDoc = doc.replace(/\D/g, '');

  if (cleanDoc.length === 11) {
    return cleanDoc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  if (cleanDoc.length === 14) {
    return cleanDoc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }

  return cleanDoc;
};

const extractDocumentFromText = (text: string): string | null => {
  const normalizedText = text.replace(/[\r\n]+/g, ' ').replace(/\s{2,}/g, ' ');

  const cnpjRegex = /\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}/g;
  const cpfRegex = /\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}/g;

  const cnpjMatches = normalizedText.match(cnpjRegex);
  if (cnpjMatches?.length) {
    const cnpj = cnpjMatches[0].replace(/\D/g, '');
    if (cnpj.length === 14) return cnpj;
  }

  const cpfMatches = normalizedText.match(cpfRegex);
  if (cpfMatches?.length) {
    const cpf = cpfMatches[0].replace(/\D/g, '');
    if (cpf.length === 11) return cpf;
  }

  return null;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightBrowser(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const ocrApiKey = Deno.env.get('OCR_SPACE_API_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ success: false, message: 'Serviço indisponível' }, 500);
    }

    if (!ocrApiKey) {
      return jsonResponse({ success: false, message: 'Missing OCR_SPACE_API_KEY secret' }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const token = extractBearerToken(req);
    if (!token) {
      await logSecurityEvent(supabaseAdmin, {
        req,
        attemptedRoute: '/functions/v1/validate-document',
        attemptedAction: 'validate_document_missing_bearer',
        reason: 'Authorization header ausente ou sem Bearer token.',
      });
      return jsonResponse(req, { success: false, message: 'Unauthorized' }, 401);
    }

    const authClient = createClient(supabaseUrl, anonKey);

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !user) {
      await logSecurityEvent(supabaseAdmin, {
        req,
        attemptedRoute: '/functions/v1/validate-document',
        attemptedAction: 'validate_document_invalid_jwt',
        reason: authError?.message || 'JWT inválido na validação de documento.',
      });
      return jsonResponse(req, { success: false, message: 'Unauthorized' }, 401);
    }

    // VULN-007 fix: Rate limiting para proteger a API OCR paga
    const rateLimit = await checkRateLimit(supabaseAdmin, user.id, 'validate-document');
    if (!rateLimit.allowed) {
      await logSecurityEvent(supabaseAdmin, {
        req,
        attemptedRoute: '/functions/v1/validate-document',
        attemptedAction: 'validate_document_rate_limited',
        userId: user.id,
        email: user.email ?? null,
        severity: 'warning',
        reason: 'Rate limit excedido para validação de documento.',
      });
      return rateLimitResponse(getCorsHeaders(req), rateLimit.resetAt);
    }

    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return jsonResponse(req, { success: false, message: 'Arquivo nao informado' }, 400);
    }

    // VULN-017 fix: Validar tipo MIME e tamanho do arquivo
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      await logSecurityEvent(supabaseAdmin, {
        req,
        attemptedRoute: '/functions/v1/validate-document',
        attemptedAction: 'validate_document_invalid_file_type',
        userId: user.id,
        email: user.email ?? null,
        severity: 'warning',
        reason: `Tipo de arquivo não permitido: ${file.type}`,
        metadata: { fileType: file.type, fileName: file.name },
      });
      return jsonResponse(req, { success: false, message: 'Tipo de arquivo não permitido. Use JPG, PNG, WEBP ou PDF.' }, 400);
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return jsonResponse(req, { success: false, message: 'Arquivo muito grande. O tamanho máximo é 5MB.' }, 400);
    }

    // Verificar magic bytes para confirmar o tipo real do arquivo
    const isValidMagic = await verifyFileMagicBytes(file);
    if (!isValidMagic) {
      await logSecurityEvent(supabaseAdmin, {
        req,
        attemptedRoute: '/functions/v1/validate-document',
        attemptedAction: 'validate_document_invalid_magic_bytes',
        userId: user.id,
        email: user.email ?? null,
        severity: 'warning',
        reason: `Magic bytes não correspondem ao tipo declarado: ${file.type}`,
      });
      return jsonResponse(req, { success: false, message: 'Arquivo inválido ou corrompido.' }, 400);
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('document')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      return jsonResponse(req, { success: false, message: 'Erro ao carregar perfil do usuário' }, 500);
    }

    const userDocument = String(profile?.document || '').replace(/\D/g, '');
    if (!userDocument) {
      return jsonResponse(req, {
        success: false,
        message: 'Você ainda não cadastrou seu CPF/CNPJ no perfil.',
      });
    }

    const ocrFormData = new FormData();
    ocrFormData.append('apikey', ocrApiKey);
    ocrFormData.append('language', 'por');
    ocrFormData.append('isOverlayRequired', 'false');
    ocrFormData.append('file', file);

    if (file.type === 'application/pdf') {
      ocrFormData.append('filetype', 'PDF');
    }

    const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: ocrFormData,
    });

    if (!ocrResponse.ok) {
      return jsonResponse(req, {
        success: false,
        message: 'Erro ao comunicar com a API de OCR.',
      });
    }

    const ocrData = await ocrResponse.json();

    if (ocrData.IsErroredOnProcessing) {
      return jsonResponse(req, {
        success: false,
        message: 'Erro ao processar documento.',
      });
    }

    const parsedText = ocrData.ParsedResults?.[0]?.ParsedText;
    if (!parsedText) {
      return jsonResponse(req, {
        success: false,
        message: 'Não foi possível extrair texto do documento. Verifique a qualidade da imagem.',
      });
    }

    const extractedDocument = extractDocumentFromText(parsedText);
    if (!extractedDocument) {
      return jsonResponse(req, {
        success: false,
        message: 'Não foi possível identificar CPF ou CNPJ no documento.',
      });
    }

    if (extractedDocument === userDocument) {
      return jsonResponse(req, {
        success: true,
        message: 'Documento validado com sucesso. Os dados conferem.',
        extractedDocument,
      });
    }

    return jsonResponse(req, {
      success: false,
      message: `Os dados do documento não batem com o seu perfil. Documento extraído: ${formatDocument(extractedDocument)} | Cadastrado: ${formatDocument(userDocument)}`,
      extractedDocument,
    });
  } catch (error) {
    console.error('[validate-document] unexpected error:', error);
    return jsonResponse(
      req,
      { success: false, message: 'Erro inesperado ao validar documento' },
      500
    );
  }
});
