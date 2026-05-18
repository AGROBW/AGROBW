import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { logSecurityEvent } from '../_shared/security.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
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
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const ocrApiKey = Deno.env.get('OCR_SPACE_API_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ success: false, message: 'Missing Supabase secrets' }, 500);
    }

    if (!ocrApiKey) {
      return jsonResponse({ success: false, message: 'Missing OCR_SPACE_API_KEY secret' }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      await logSecurityEvent(supabaseAdmin, {
        req,
        attemptedRoute: '/functions/v1/validate-document',
        attemptedAction: 'validate_document_missing_bearer',
        reason: 'Authorization header ausente ou sem Bearer token.',
      });
      return jsonResponse({ success: false, message: 'Unauthorized' }, 401);
    }

    const token = authHeader.slice(7).trim();
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
      return jsonResponse({ success: false, message: 'Invalid JWT' }, 401);
    }

    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return jsonResponse({ success: false, message: 'Arquivo nao informado' }, 400);
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('document')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      return jsonResponse({ success: false, message: 'Nao foi possivel carregar o perfil do usuario' }, 500);
    }

    const userDocument = String(profile?.document || '').replace(/\D/g, '');
    if (!userDocument) {
      return jsonResponse({
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
      return jsonResponse({
        success: false,
        message: 'Erro ao comunicar com a API de OCR.',
      });
    }

    const ocrData = await ocrResponse.json();

    if (ocrData.IsErroredOnProcessing) {
      return jsonResponse({
        success: false,
        message: ocrData.ErrorMessage?.[0] || 'Erro ao processar documento.',
      });
    }

    const parsedText = ocrData.ParsedResults?.[0]?.ParsedText;
    if (!parsedText) {
      return jsonResponse({
        success: false,
        message: 'Não foi possível extrair texto do documento. Verifique a qualidade da imagem.',
      });
    }

    const extractedDocument = extractDocumentFromText(parsedText);
    if (!extractedDocument) {
      return jsonResponse({
        success: false,
        message: 'Não foi possível identificar CPF ou CNPJ no documento.',
      });
    }

    if (extractedDocument === userDocument) {
      return jsonResponse({
        success: true,
        message: 'Documento validado com sucesso. Os dados conferem.',
        extractedDocument,
      });
    }

    return jsonResponse({
      success: false,
      message: `Os dados do documento não batem com o seu perfil. Documento extraído: ${formatDocument(extractedDocument)} | Cadastrado: ${formatDocument(userDocument)}`,
      extractedDocument,
    });
  } catch (error) {
    console.error('[validate-document] unexpected error:', error);
    return jsonResponse(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Erro inesperado ao validar documento',
      },
      500
    );
  }
});
