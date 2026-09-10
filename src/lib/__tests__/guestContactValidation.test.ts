import { describe, expect, it } from 'vitest';
import { normalizeGuestContactInput } from '../../../supabase/functions/submit-guest-announcement-contact/core';

const validInput = {
  announcementId: '123e4567-e89b-42d3-a456-426614174000',
  name: '  Maria   Silva ',
  email: ' MARIA@EXAMPLE.COM ',
  phone: '(11) 99999-9999',
  message: 'Tenho interesse neste anuncio.',
  acceptedTerms: true,
  captchaToken: 'captcha-token-valido',
  captchaProvider: 'hcaptcha',
  userAgent: 'browser',
};

describe('normalizeGuestContactInput', () => {
  it('normaliza um contato valido', () => {
    expect(normalizeGuestContactInput(validInput)).toMatchObject({
      name: 'Maria Silva',
      email: 'maria@example.com',
      phone: '(11) 99999-9999',
      acceptedTerms: true,
      captchaProvider: 'hcaptcha',
    });
  });

  it.each([
    ['uuid invalido', { announcementId: 'invalido' }],
    ['nome curto', { name: 'A' }],
    ['email invalido', { email: 'maria@' }],
    ['telefone curto', { phone: '123' }],
    ['mensagem curta', { message: 'Oi' }],
    ['sem consentimento', { acceptedTerms: false }],
    ['captcha ausente', { captchaToken: '' }],
    ['provedor desconhecido', { captchaProvider: 'mock' }],
  ])('rejeita %s', (_label, override) => {
    expect(normalizeGuestContactInput({ ...validInput, ...override })).toBeNull();
  });

  it('aceita telefone vazio como opcional', () => {
    expect(normalizeGuestContactInput({ ...validInput, phone: '' })?.phone).toBeNull();
  });
});
