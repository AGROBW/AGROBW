import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  WHATSAPP_GATEWAY_TEST_MESSAGE,
  buildWhatsappGatewayUrl,
  createWhatsappGatewayAuthHeaders,
  createWhatsappGatewayTestPayload,
  isAllowedWhatsappGatewayHostname,
  isBlockedWhatsappGatewayAddress,
  parseWhatsappGatewayAdminAction,
} from '../../../supabase/functions/_shared/whatsappGateway';

const edgeFunction = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-gateway-admin/index.ts'),
  'utf8',
);
const gatewayDispatch = readFileSync(
  resolve(process.cwd(), 'supabase/functions/_shared/whatsappGatewayDispatch.ts'),
  'utf8',
);
const supabaseConfig = readFileSync(resolve(process.cwd(), 'supabase/config.toml'), 'utf8');
const stage2Validation = readFileSync(
  resolve(process.cwd(), 'sql/VALIDATE_whatsapp_central_stage2_2026-09-14.sql'),
  'utf8',
);

describe('Central WhatsApp stage 2 protocol', () => {
  it('aceita apenas as duas operacoes administrativas previstas', () => {
    expect(parseWhatsappGatewayAdminAction('health')).toBe('health');
    expect(parseWhatsappGatewayAdminAction('test_message')).toBe('test_message');
    expect(parseWhatsappGatewayAdminAction('send')).toBeNull();
  });

  it('bloqueia enderecos privados, locais, reservados e IPv6 mapeado', () => {
    ['127.0.0.1', '10.1.2.3', '169.254.169.254', '172.16.0.1', '192.168.1.1',
      '100.64.0.1', '192.0.2.1', '198.51.100.1', '203.0.113.1', '::1',
      'fd00::1', 'fe80::1', '::ffff:7f00:1', '::127.0.0.1',
      '0:0:0:0:0:0:0:1', '2002:0808:0808::1', '::ffff:0808:0808',
      '::ffff:0:a00:1', '::ffff:0:808:808'].forEach((address) => {
      expect(isBlockedWhatsappGatewayAddress(address), address).toBe(true);
    });
    expect(isBlockedWhatsappGatewayAddress('8.8.8.8')).toBe(false);
    expect(isBlockedWhatsappGatewayAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('aceita somente hosts exatos presentes na allowlist', () => {
    expect(isAllowedWhatsappGatewayHostname('gateway.example.com', 'gateway.example.com, backup.example.com')).toBe(true);
    expect(isAllowedWhatsappGatewayHostname('GATEWAY.EXAMPLE.COM.', 'gateway.example.com')).toBe(true);
    expect(isAllowedWhatsappGatewayHostname('evil.gateway.example.com', 'gateway.example.com')).toBe(false);
    expect(isAllowedWhatsappGatewayHostname('gateway.example.com', '')).toBe(false);
  });

  it('monta somente URLs HTTPS com caminho relativo seguro', () => {
    expect(buildWhatsappGatewayUrl('https://api.example.com', '/api/v1/health'))
      .toBe('https://api.example.com/api/v1/health');
    expect(() => buildWhatsappGatewayUrl('http://api.example.com', '/health')).toThrow();
    expect(() => buildWhatsappGatewayUrl('https://127.0.0.1', '/health')).toThrow();
    expect(() => buildWhatsappGatewayUrl('https://api.example.com', '//attacker.example')).toThrow();
  });

  it('gera autenticacao bearer e HMAC sem alterar o corpo assinado', async () => {
    await expect(createWhatsappGatewayAuthHeaders('bearer', 'token-value', '', '123'))
      .resolves.toEqual({ Authorization: 'Bearer token-value' });
    const first = await createWhatsappGatewayAuthHeaders('hmac_sha256', 'secret', '{"ok":true}', '123');
    const second = await createWhatsappGatewayAuthHeaders('hmac_sha256', 'secret', '{"ok":true}', '123');
    expect(first).toEqual(second);
    expect(first['X-BWAgro-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it('usa mensagem fixa, destino configurado e chave de idempotencia', () => {
    const payload = createWhatsappGatewayTestPayload('request-1', '5564999999999');
    expect(payload.to).toBe('5564999999999');
    expect(payload.text.body).toBe(WHATSAPP_GATEWAY_TEST_MESSAGE);
    expect(payload.idempotency_key).toBe('request-1');
  });
});

describe('Central WhatsApp stage 2 edge security', () => {
  it('exige admin AAL2 e aplica rate limit com falha fechada', () => {
    expect(edgeFunction).toContain('isAdminAal2Profile(profile, token)');
    expect(edgeFunction).toContain("supabaseAdmin.rpc('check_rate_limit'");
    expect(edgeFunction).toContain("error: 'Protecao de frequencia indisponivel.'");
  });

  it('grava auditoria server-side antes de acessar o provedor', () => {
    const auditPosition = edgeFunction.indexOf(".from('admin_audit_logs')");
    const dispatchPosition = edgeFunction.indexOf('await dispatchWhatsappGatewayRequest');
    expect(auditPosition).toBeGreaterThan(0);
    expect(dispatchPosition).toBeGreaterThan(auditPosition);
    expect(edgeFunction).toContain("error: 'Auditoria administrativa indisponivel.'");
    expect(edgeFunction).not.toContain('auth_secret: settings.auth_secret');
  });

  it('revalida DNS, bloqueia redirects e nao devolve corpo do provedor', () => {
    expect(edgeFunction).toContain('dispatchWhatsappGatewayRequest');
    expect(gatewayDispatch).toContain('Deno.resolveDns');
    expect(gatewayDispatch).toContain("Deno.env.get('WHATSAPP_GATEWAY_ALLOWED_HOSTS')");
    expect(gatewayDispatch).toContain('GATEWAY_HOST_NOT_ALLOWED');
    expect(gatewayDispatch).toContain('isBlockedWhatsappGatewayAddress');
    expect(gatewayDispatch).toContain("redirect: 'error'");
    expect(gatewayDispatch).toContain('upstreamResponse.body?.cancel()');
    expect(gatewayDispatch).not.toContain('upstreamResponse.text()');
    expect(gatewayDispatch).not.toContain('upstreamResponse.json()');
  });

  it('nao aceita mensagem ou telefone arbitrarios do navegador', () => {
    expect(edgeFunction).toContain('recipientPhone: settings.default_recipient_phone');
    expect(edgeFunction).toContain('Teste de integracao da Central WhatsApp BW Agro.');
    expect(edgeFunction).not.toMatch(/body\?\.(message|phone|to)/);
  });

  it('registra a funcao com autenticacao manual no config', () => {
    expect(supabaseConfig).toContain('[functions.whatsapp-gateway-admin]');
    expect(supabaseConfig).toMatch(/\[functions\.whatsapp-gateway-admin\][\s\S]*verify_jwt = false/);
  });

  it('inclui pre-validacao das dependencias operacionais', () => {
    expect(stage2Validation).toContain('rate_limit_disponivel');
    expect(stage2Validation).toContain('service_role_executa_rate_limit');
    expect(stage2Validation).toContain('service_role_grava_auditoria');
    expect(stage2Validation).toContain('service_role_atualiza_auditoria');
  });
});
