export type GuestContactInput = {
  announcementId: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  acceptedTerms: boolean;
  captchaToken: string;
  captchaProvider: 'hcaptcha' | 'turnstile';
  userAgent: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const normalizeGuestContactInput = (body: unknown): GuestContactInput | null => {
  if (!body || typeof body !== 'object') return null;
  const value = body as Record<string, unknown>;
  const announcementId = String(value.announcementId || '').trim();
  const name = String(value.name || '').trim().replace(/\s+/g, ' ');
  const email = String(value.email || '').trim().toLowerCase();
  const phone = String(value.phone || '').trim() || null;
  const message = String(value.message || '').trim();
  const captchaToken = String(value.captchaToken || '').trim();
  const captchaProvider = String(value.captchaProvider || '');
  const userAgent = String(value.userAgent || '').trim().slice(0, 500) || null;

  if (!UUID_PATTERN.test(announcementId)) return null;
  if (name.length < 2 || name.length > 120) return null;
  if (!EMAIL_PATTERN.test(email) || email.length > 254) return null;
  if (phone && (phone.length > 30 || phone.replace(/\D/g, '').length < 8)) return null;
  if (message.length < 10 || message.length > 2000) return null;
  if (value.acceptedTerms !== true) return null;
  if (captchaToken.length < 10 || captchaToken.length > 4096) return null;
  if (captchaProvider !== 'hcaptcha' && captchaProvider !== 'turnstile') return null;

  return {
    announcementId,
    name,
    email,
    phone,
    message,
    acceptedTerms: true,
    captchaToken,
    captchaProvider,
    userAgent,
  };
};
