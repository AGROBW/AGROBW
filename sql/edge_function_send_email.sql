-- ==========================================
-- EDGE FUNCTION PARA ENVIO DE E-MAILS
-- ==========================================

-- Esta função deve ser criada como Supabase Edge Function
-- Arquivo: supabase/functions/send-email/index.ts

/*
INSTRUÇÕES PARA CRIAR A EDGE FUNCTION:

1. Instalar Supabase CLI:
   npm install -g supabase

2. Criar a função:
   supabase functions new send-email

3. Copiar o código TypeScript abaixo para supabase/functions/send-email/index.ts

4. Configurar secrets no Supabase:
   supabase secrets set SMTP_HOST=smtp.gmail.com
   supabase secrets set SMTP_PORT=587
   supabase secrets set SMTP_USER=seu-email@gmail.com
   supabase secrets set SMTP_PASSWORD=sua-senha-app
   supabase secrets set SMTP_FROM_EMAIL=noreply@bwagro.com
   supabase secrets set SMTP_FROM_NAME="BWAGRO Marketplace"

5. Deploy da função:
   supabase functions deploy send-email

6. Dar permissões para authenticated users:
   No Supabase Dashboard > Edge Functions > send-email > Settings
   Enable "Allow authenticated users to call this function"
*/

-- ==========================================
-- CÓDIGO TYPESCRIPT DA EDGE FUNCTION
-- ==========================================

/*
// supabase/functions/send-email/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EmailRequest {
  type: 'new_lead' | 'new_message';
  to: string;
  data: {
    sellerName?: string;
    buyerName?: string;
    announcementTitle?: string;
    announcementPrice?: number;
    announcementId?: string;
    initialMessage?: string;
    messageContent?: string;
    chatId?: string;
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { type, to, data }: EmailRequest = await req.json()

    // Configurar cliente SMTP
    const client = new SmtpClient();
    
    await client.connectTLS({
      hostname: Deno.env.get('SMTP_HOST') || 'smtp.gmail.com',
      port: parseInt(Deno.env.get('SMTP_PORT') || '587'),
      username: Deno.env.get('SMTP_USER') || '',
      password: Deno.env.get('SMTP_PASSWORD') || '',
    });

    let subject = '';
    let html = '';

    // Template para novo lead
    if (type === 'new_lead') {
      subject = `🎯 Novo Lead: ${data.buyerName} interessado em ${data.announcementTitle}`;
      
      const formatPrice = (price: number) => {
        return new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL'
        }).format(price);
      };

      html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #f8fafc; }
            .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #15803d 0%, #166534 100%); padding: 32px; text-align: center; color: white; }
            .content { padding: 32px; }
            .lead-info { background: #f1f5f9; padding: 20px; border-radius: 12px; margin: 20px 0; }
            .button { display: inline-block; padding: 14px 28px; background: #15803d; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 20px; }
            .footer { background: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0; font-size: 28px;">🎯 Novo Lead!</h1>
              <p style="margin: 8px 0 0; opacity: 0.9;">Alguém está interessado no seu anúncio</p>
            </div>
            
            <div class="content">
              <p style="margin: 0 0 20px; font-size: 16px;">Olá, <strong>${data.sellerName}</strong>!</p>
              
              <p style="color: #64748b;">Você tem um novo lead esperando sua resposta:</p>
              
              <div class="lead-info">
                <h2 style="margin: 0 0 12px; color: #0f172a; font-size: 18px;">${data.announcementTitle}</h2>
                <p style="margin: 8px 0; color: #15803d; font-size: 20px; font-weight: 700;">${data.announcementPrice ? formatPrice(data.announcementPrice) : ''}</p>
                
                <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                  <p style="margin: 0; font-size: 14px; color: #64748b;"><strong>Interessado:</strong> ${data.buyerName}</p>
                  <p style="margin: 12px 0 0; font-size: 14px; color: #475569; background: white; padding: 12px; border-radius: 8px;">
                    "${data.initialMessage}"
                  </p>
                </div>
              </div>
              
              <a href="${Deno.env.get('APP_URL') || 'https://bwagro.com'}/#/minha-conta/leads" class="button">
                Ver Todos os Leads
              </a>
              
              <p style="margin: 24px 0 0; color: #64748b; font-size: 12px;">
                💡 Responda rapidamente para aumentar suas chances de fechar negócio!
              </p>
            </div>
            
            <div class="footer">
              <p style="margin: 0; color: #64748b; font-size: 12px;">
                © 2026 BWAGRO - Marketplace Rural<br>
                <a href="${Deno.env.get('APP_URL') || 'https://bwagro.com'}" style="color: #15803d; text-decoration: none;">www.bwagro.com.br</a>
              </p>
            </div>
          </div>
        </body>
        </html>
      `;
    }

    // Template para nova mensagem
    if (type === 'new_message') {
      subject = `💬 Nova mensagem de ${data.buyerName}`;
      
      html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #f8fafc; }
            .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #15803d 0%, #166534 100%); padding: 32px; text-align: center; color: white; }
            .content { padding: 32px; }
            .message-box { background: #f1f5f9; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #15803d; }
            .button { display: inline-block; padding: 14px 28px; background: #15803d; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 20px; }
            .footer { background: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0; font-size: 28px;">💬 Nova Mensagem</h1>
              <p style="margin: 8px 0 0; opacity: 0.9;">Você tem uma nova mensagem</p>
            </div>
            
            <div class="content">
              <p style="margin: 0 0 20px; font-size: 16px;">Olá, <strong>${data.sellerName}</strong>!</p>
              
              <p style="color: #64748b;"><strong>${data.buyerName}</strong> enviou uma mensagem sobre:</p>
              <p style="font-weight: 600; color: #0f172a; margin: 8px 0;">${data.announcementTitle}</p>
              
              <div class="message-box">
                <p style="margin: 0; color: #475569; font-size: 14px; line-height: 1.6;">
                  ${data.messageContent}
                </p>
              </div>
              
              <a href="${Deno.env.get('APP_URL') || 'https://bwagro.com'}/#/minha-conta/mensagens?chat=${data.chatId}" class="button">
                Responder Mensagem
              </a>
            </div>
            
            <div class="footer">
              <p style="margin: 0; color: #64748b; font-size: 12px;">
                © 2026 BWAGRO - Marketplace Rural<br>
                <a href="${Deno.env.get('APP_URL') || 'https://bwagro.com'}" style="color: #15803d; text-decoration: none;">www.bwagro.com.br</a>
              </p>
            </div>
          </div>
        </body>
        </html>
      `;
    }

    // Enviar e-mail
    await client.send({
      from: `${Deno.env.get('SMTP_FROM_NAME')} <${Deno.env.get('SMTP_FROM_EMAIL')}>`,
      to: to,
      subject: subject,
      content: html,
      html: html,
    });

    await client.close();

    return new Response(
      JSON.stringify({ success: true, message: 'E-mail enviado com sucesso' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error('Erro ao enviar e-mail:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
*/

-- ==========================================
-- FUNÇÃO AUXILIAR NO BANCO DE DADOS
-- ==========================================

-- Criar função para chamar a Edge Function automaticamente
CREATE OR REPLACE FUNCTION send_email_notification()
RETURNS TRIGGER AS $$
DECLARE
  seller_email TEXT;
  seller_name TEXT;
  buyer_name TEXT;
  announcement_title TEXT;
  announcement_price NUMERIC;
  announcement_id UUID;
BEGIN
  -- Buscar dados do vendedor
  SELECT email, name INTO seller_email, seller_name
  FROM users
  WHERE id = NEW.seller_id;
  
  -- Buscar dados do comprador
  SELECT name INTO buyer_name
  FROM users
  WHERE id = NEW.buyer_id;
  
  -- Buscar dados do anúncio
  SELECT title, price, id INTO announcement_title, announcement_price, announcement_id
  FROM announcements
  WHERE id = NEW.announcement_id;
  
  -- Chamar Edge Function via HTTP (Supabase fará isso automaticamente)
  -- A Edge Function será invocada pelo trigger create_lead_notification
  -- que já existe em create_chat_triggers.sql
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentário: O trigger já existe em create_chat_triggers.sql
-- Este arquivo serve apenas como documentação da Edge Function

-- ==========================================
-- CONFIGURAÇÕES NECESSÁRIAS
-- ==========================================

/*
No Supabase Dashboard:

1. Settings > API > Edge Functions
   - Anote a URL da função: https://[projeto].supabase.co/functions/v1/send-email

2. Settings > Vault (para armazenar secrets com segurança)
   - Adicionar:
     * smtp_host
     * smtp_port  
     * smtp_user
     * smtp_password
     * smtp_from_email
     * smtp_from_name

3. SQL Editor > Executar:
   -- Conceder permissão para invocar a função
   GRANT EXECUTE ON FUNCTION send_email_notification() TO authenticated;
*/

-- ==========================================
-- EXEMPLO DE CHAMADA MANUAL DA EDGE FUNCTION
-- ==========================================

/*
-- No frontend (ContactModal.tsx), adicionar após criar o lead:

const { data, error } = await supabase.functions.invoke('send-email', {
  body: {
    type: 'new_lead',
    to: sellerEmail,
    data: {
      sellerName: sellerName,
      buyerName: formData.name,
      announcementTitle: announcementTitle,
      announcementPrice: announcementPrice,
      announcementId: announcementId,
      initialMessage: formData.message
    }
  }
});

if (error) {
  console.error('Erro ao enviar e-mail:', error);
} else {
  console.log('E-mail enviado com sucesso:', data);
}
*/
