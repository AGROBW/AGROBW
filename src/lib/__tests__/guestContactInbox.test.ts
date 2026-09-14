import { describe, expect, it } from 'vitest';
import {
  getGuestContactChatId,
  getGuestContactIdFromChatId,
  getMessageInboxTargetFromSearch,
  getMessageInboxTargetStatus,
  mapGuestContactToChat,
  normalizeGuestAnnouncementContact,
} from '../guestContactInbox';

describe('guest contact inbox adapter', () => {
  it('normaliza um contato liberado como conversa recebida de visitante', () => {
    const contact = normalizeGuestAnnouncementContact({
      contact_id: 'contact-1',
      announcement_id: 'announcement-1',
      announcement_title: 'Trator',
      announcement_slug: 'trator',
      announcement_image: 'https://example.com/trator.jpg',
      visitor_name: 'Maria',
      visitor_email: 'maria@example.com',
      visitor_phone: '(11) 99999-9999',
      message_preview: 'Tenho interesse',
      created_at: '2026-09-14T12:00:00.000Z',
      contact_expires_at: null,
      is_locked: false,
      is_read: false,
      is_archived: false,
    }, 'message_preview');

    const chat = mapGuestContactToChat(contact, { id: 'seller-1', name: 'Vendedor' });

    expect(chat.id).toBe('guest-contact:contact-1');
    expect(chat.sourceKind).toBe('guest_contact');
    expect(chat.direction).toBe('received');
    expect(chat.buyerName).toBe('Maria');
    expect(chat.lastMessage).toBe('Tenho interesse');
    expect(chat.unreadCount).toBe(1);
    expect(chat.isFrozen).toBe(false);
  });

  it('mantem dados redigidos e bloqueia o item protegido', () => {
    const contact = normalizeGuestAnnouncementContact({
      contact_id: 'contact-2',
      announcement_id: 'announcement-2',
      announcement_title: 'Colheitadeira',
      visitor_name: 'Contato bloqueado',
      visitor_email: null,
      visitor_phone: null,
      message_preview: null,
      created_at: '2026-09-14T12:00:00.000Z',
      contact_expires_at: '2026-09-14T11:59:59.000Z',
      is_locked: true,
      is_read: true,
      is_archived: true,
    }, 'message_preview');

    const chat = mapGuestContactToChat(contact, { id: 'seller-1' });

    expect(chat.buyerName).toBe('Contato bloqueado');
    expect(chat.lastMessage).toBe('Conteudo protegido');
    expect(chat.freezeReason).toBe('lead_contact_expired');
    expect(chat.isFrozen).toBe(true);
    expect(chat.unreadCount).toBe(0);
    expect(chat.guestContactArchived).toBe(true);
  });

  it('converte ids de links sem aceitar ids de chats comuns', () => {
    expect(getGuestContactChatId('contact-3')).toBe('guest-contact:contact-3');
    expect(getGuestContactIdFromChatId('guest-contact:contact-3')).toBe('contact-3');
    expect(getGuestContactIdFromChatId('chat-3')).toBeNull();
    expect(getMessageInboxTargetFromSearch('?guest=contact-3')).toBe('guest-contact:contact-3');
    expect(getMessageInboxTargetFromSearch('?chat=chat-3')).toBe('chat-3');
    expect(getMessageInboxTargetFromSearch('?guest=contact-3&chat=chat-3')).toBe('guest-contact:contact-3');
  });

  it('aguarda a lista antes de selecionar ou rejeitar um deep link', () => {
    expect(getMessageInboxTargetStatus('guest-contact:1', [], true)).toBe('pending');
    expect(getMessageInboxTargetStatus('guest-contact:1', ['guest-contact:1'], false)).toBe('found');
    expect(getMessageInboxTargetStatus('guest-contact:1', [], false)).toBe('missing');
    expect(getMessageInboxTargetStatus(null, [], false)).toBe('none');
  });
});
