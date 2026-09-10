export type ContactNotificationSourceKind = 'new_message' | 'new_lead' | 'guest_lead';

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const singleLine = (value: string) => value.replace(/[\r\n]+/g, ' ').trim();

export const getContactNotificationTemplate = (params: {
  appUrl: string;
  siteName: string;
  recipientName: string;
  senderName: string;
  announcementTitle: string;
  messagePreview?: string | null;
  link?: string | null;
  sourceKind: ContactNotificationSourceKind;
  replyToEmail?: string | null;
  senderPhone?: string | null;
}) => {
  const isGuestLead = params.sourceKind === 'guest_lead';
  const isLead = params.sourceKind === 'new_lead' || isGuestLead;
  const announcementTitle = singleLine(params.announcementTitle);
  const title = isGuestLead
    ? `Novo contato visitante no anuncio ${announcementTitle}`
    : isLead
    ? `Novo lead no anuncio ${announcementTitle}`
    : `Nova mensagem sobre ${announcementTitle}`;
  const badge = isGuestLead ? 'Contato visitante' : isLead ? 'Novo lead' : 'Nova mensagem';
  const ctaLabel = isGuestLead ? 'Ver anuncio' : isLead ? 'Ver lead' : 'Abrir conversa';
  const intro = isGuestLead
    ? `${params.senderName} enviou um contato sem criar uma conta na ${params.siteName}. Responda diretamente a este e-mail.`
    : isLead
    ? `${params.senderName} demonstrou interesse no seu anuncio e abriu um novo contato na ${params.siteName}.`
    : `${params.senderName} enviou uma nova mensagem para voce na ${params.siteName}.`;
  const footer = isGuestLead
    ? 'Este contato foi protegido por CAPTCHA e limites de envio. Os dados foram compartilhados com o consentimento do visitante.'
    : isLead
    ? 'Acompanhe esse lead o quanto antes para aumentar suas chances de conversao.'
    : 'Entre na conversa para responder rapido e manter a negociacao ativa.';

  const linkHref = params.link
    ? params.link.startsWith('http')
      ? params.link
      : `${params.appUrl.replace(/\/$/, '')}/#${params.link}`
    : null;
  const preview = params.messagePreview?.trim();
  const safeTitle = escapeHtml(title);
  const safeRecipientName = escapeHtml(singleLine(params.recipientName));
  const safeIntro = escapeHtml(intro);
  const safeAnnouncementTitle = escapeHtml(announcementTitle);
  const safePreview = preview ? escapeHtml(preview) : null;
  const safeLinkHref = linkHref ? escapeHtml(linkHref) : null;
  const safeReplyToEmail = params.replyToEmail ? escapeHtml(singleLine(params.replyToEmail)) : null;
  const safeSenderPhone = params.senderPhone ? escapeHtml(singleLine(params.senderPhone)) : null;

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${safeTitle}</title></head>
      <body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
        <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;">
          <div style="padding:28px 32px;background:#0f172a;color:#ffffff;">
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.24em;text-transform:uppercase;color:#86efac;">${escapeHtml(badge)}</p>
            <h1 style="margin:0;font-size:24px;line-height:1.2;">${safeTitle}</h1>
          </div>
          <div style="padding:32px;">
            <p style="margin:0 0 16px;font-size:15px;">Ola, <strong>${safeRecipientName}</strong>.</p>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569;">${safeIntro}</p>
            <div style="margin:0 0 20px;padding:18px 20px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;">
              <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#64748b;">Anuncio</p>
              <p style="margin:0;font-size:17px;font-weight:700;color:#0f172a;">${safeAnnouncementTitle}</p>
            </div>
            ${preview ? `<div style="margin:0 0 24px;padding:18px 20px;border-radius:14px;background:#ecfdf5;border:1px solid #bbf7d0;"><p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#15803d;">${isLead ? 'Mensagem inicial' : 'Conteudo da mensagem'}</p><p style="margin:0;font-size:15px;line-height:1.7;color:#166534;white-space:pre-wrap;">${safePreview}</p></div>` : ''}
            ${isGuestLead && (safeReplyToEmail || safeSenderPhone) ? `<div style="margin:0 0 24px;padding:18px 20px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;"><p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#64748b;">Como responder</p>${safeReplyToEmail ? `<p style="margin:0 0 6px;font-size:14px;color:#0f172a;">E-mail: ${safeReplyToEmail}</p>` : ''}${safeSenderPhone ? `<p style="margin:0;font-size:14px;color:#0f172a;">Telefone: ${safeSenderPhone}</p>` : ''}</div>` : ''}
            ${linkHref ? `<a href="${safeLinkHref}" style="display:inline-block;padding:14px 22px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:12px;font-weight:700;">${ctaLabel}</a>` : ''}
          </div>
          <div style="padding:18px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">${escapeHtml(footer)}</div>
        </div>
      </body>
    </html>
  `.trim();

  return { subject: singleLine(title), html };
};
