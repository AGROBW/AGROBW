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
});
