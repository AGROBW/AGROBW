import { describe, expect, it } from 'vitest';
import {
  buildWhatsappGatewayEndpoint,
  isSafeWhatsappGatewayBaseUrl,
  isSafeWhatsappGatewayPath,
  normalizeWhatsappPhone,
  validateWhatsappGatewaySettings,
} from '../whatsappGateway';

const validDraft = {
  base_url: 'https://whatsapp-api.example.com',
  send_path: '/api/v1/messages',
  health_path: '/api/v1/health',
  auth_type: 'bearer' as const,
  auth_secret: 'secret-value',
  default_recipient_phone: '5564999999999',
  is_enabled: true,
};

describe('whatsappGateway', () => {
  it('aceita somente bases HTTPS publicas sem caminho ou credenciais', () => {
    expect(isSafeWhatsappGatewayBaseUrl('https://whatsapp-api.example.com')).toBe(true);
    expect(isSafeWhatsappGatewayBaseUrl('http://whatsapp-api.example.com')).toBe(false);
    expect(isSafeWhatsappGatewayBaseUrl('https://user:password@example.com')).toBe(false);
    expect(isSafeWhatsappGatewayBaseUrl('https://example.com/api')).toBe(false);
    expect(isSafeWhatsappGatewayBaseUrl('https://192.168.1.10:3333')).toBe(false);
    expect(isSafeWhatsappGatewayBaseUrl('https://203.0.113.10')).toBe(false);
    expect(isSafeWhatsappGatewayBaseUrl('https://127.0.0.1')).toBe(false);
    expect(isSafeWhatsappGatewayBaseUrl('https://gateway.internal')).toBe(false);
  });

  it('rejeita caminhos capazes de trocar host, usar query ou fazer traversal', () => {
    expect(isSafeWhatsappGatewayPath('/api/v1/messages')).toBe(true);
    expect(isSafeWhatsappGatewayPath('//attacker.example/messages')).toBe(false);
    expect(isSafeWhatsappGatewayPath('/api/../admin')).toBe(false);
    expect(isSafeWhatsappGatewayPath('/messages?target=other')).toBe(false);
  });

  it('exige configuracao completa somente quando o gateway for ativado', () => {
    expect(validateWhatsappGatewaySettings(validDraft)).toEqual([]);
    expect(validateWhatsappGatewaySettings({
      ...validDraft,
      base_url: '',
      auth_secret: '',
      default_recipient_phone: '',
      is_enabled: false,
    })).toEqual([]);

    const errors = validateWhatsappGatewaySettings({
      ...validDraft,
      base_url: '',
      auth_secret: '',
      default_recipient_phone: '',
    });
    expect(errors).toContain('Informe a URL da API antes de ativar a integracao.');
    expect(errors).toContain('Informe o numero de destino antes de ativar a integracao.');
    expect(errors).toContain('Informe a credencial da API antes de ativar a integracao.');
  });

  it('permite manter uma credencial write-only previamente configurada', () => {
    expect(validateWhatsappGatewaySettings(
      { ...validDraft, auth_secret: '' },
      { authSecretConfigured: true },
    )).toEqual([]);
  });

  it('normaliza telefone e monta endpoints sem duplicar barras', () => {
    expect(normalizeWhatsappPhone('+55 (64) 99999-9999')).toBe('5564999999999');
    expect(buildWhatsappGatewayEndpoint('https://api.example.com/', '/api/v1/health'))
      .toBe('https://api.example.com/api/v1/health');
  });
});
