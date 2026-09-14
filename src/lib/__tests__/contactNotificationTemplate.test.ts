import { describe, expect, it } from 'vitest';
import { getContactNotificationTemplate } from '../../../supabase/functions/sync-contact-notification-emails/template';

describe('getContactNotificationTemplate', () => {
  it('inclui a mensagem completa e os dados de resposta do visitante', () => {
    const message = `Mensagem completa: ${'x'.repeat(400)}`;
    const email = getContactNotificationTemplate({
      appUrl: 'https://agrobw.com.br',
      siteName: 'BW Agro',
      recipientName: 'Vendedor',
      senderName: 'Visitante',
      announcementTitle: 'Trator',
      messagePreview: message,
      link: '/anuncio/123',
      sourceKind: 'guest_lead',
      replyToEmail: 'visitante@example.com',
      senderPhone: '(11) 99999-9999',
    });

    expect(email.html).toContain(message);
    expect(email.html).toContain('visitante@example.com');
    expect(email.html).toContain('(11) 99999-9999');
    expect(email.html).toContain('href="https://agrobw.com.br/anuncio/123"');
    expect(email.html).not.toContain('/#/anuncio/123');
  });

  it('escapa HTML e remove quebras do assunto', () => {
    const email = getContactNotificationTemplate({
      appUrl: 'https://agrobw.com.br',
      siteName: 'BW Agro',
      recipientName: '<img src=x onerror=alert(1)>',
      senderName: '<script>alert(1)</script>',
      announcementTitle: 'Trator\r\nBcc: attacker@example.com',
      messagePreview: '<a href="javascript:alert(1)">clique</a>',
      link: '/anuncio/123',
      sourceKind: 'guest_lead',
      replyToEmail: 'visitor@example.com',
    });

    expect(email.subject).not.toMatch(/[\r\n]/);
    expect(email.html).not.toContain('<script>');
    expect(email.html).not.toContain('<img src=x');
    expect(email.html).not.toContain('href="javascript:');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).toContain('&lt;a href=&quot;javascript:alert(1)&quot;&gt;');
  });

  it('oculta todos os dados do visitante quando o contato esta bloqueado', () => {
    const email = getContactNotificationTemplate({
      appUrl: 'https://agrobw.com.br',
      siteName: 'BW Agro',
      recipientName: 'Vendedor',
      senderName: 'NOME_VISITANTE_SECRETO',
      announcementTitle: 'Trator',
      messagePreview: 'MENSAGEM_VISITANTE_SECRETA',
      link: '/minha-conta/mensagens?guest=123',
      sourceKind: 'guest_lead',
      replyToEmail: 'email-secreto@example.com',
      senderPhone: '(11) 98888-7777',
      contentLocked: true,
    });

    expect(email.subject).toContain('contato visitante protegido');
    expect(email.html).toContain('dados estao protegidos');
    expect(email.html).toContain('Ver mensagens');
    expect(email.html).not.toContain('NOME_VISITANTE_SECRETO');
    expect(email.html).not.toContain('MENSAGEM_VISITANTE_SECRETA');
    expect(email.html).not.toContain('email-secreto@example.com');
    expect(email.html).not.toContain('(11) 98888-7777');
    expect(email.html).toContain('href="https://agrobw.com.br/minha-conta/mensagens?guest=123"');
  });
});
