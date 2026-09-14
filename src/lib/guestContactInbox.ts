import { CHAT_STATUS } from '../../constants/status';
import type { Chat, GuestAnnouncementContact } from '../../types';

export const GUEST_CONTACT_CHAT_PREFIX = 'guest-contact:';

type GuestContactRpcRow = Record<string, unknown>;

const optionalText = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
};

const requiredText = (value: unknown, fallback: string) => optionalText(value) || fallback;

export const getGuestContactChatId = (contactId: string) => `${GUEST_CONTACT_CHAT_PREFIX}${contactId}`;

export const getGuestContactIdFromChatId = (chatId?: string | null) => {
  if (!chatId?.startsWith(GUEST_CONTACT_CHAT_PREFIX)) return null;
  return chatId.slice(GUEST_CONTACT_CHAT_PREFIX.length) || null;
};

export const getMessageInboxTargetFromSearch = (search: string) => {
  const params = new URLSearchParams(search);
  const guestContactId = params.get('guest');
  if (guestContactId) return getGuestContactChatId(guestContactId);
  return params.get('chat');
};

export const getMessageInboxTargetStatus = (
  targetId: string | null | undefined,
  availableChatIds: string[],
  isLoading: boolean,
) => {
  if (!targetId) return 'none' as const;
  if (availableChatIds.includes(targetId)) return 'found' as const;
  return isLoading ? 'pending' as const : 'missing' as const;
};

export const normalizeGuestAnnouncementContact = (
  row: GuestContactRpcRow,
  messageField: 'message' | 'message_preview' = 'message',
): GuestAnnouncementContact => ({
  contactId: requiredText(row.contact_id, ''),
  announcementId: requiredText(row.announcement_id, ''),
  announcementTitle: requiredText(row.announcement_title, 'Anuncio indisponivel'),
  announcementSlug: optionalText(row.announcement_slug),
  announcementImage: optionalText(row.announcement_image),
  visitorName: requiredText(row.visitor_name, 'Contato visitante'),
  visitorEmail: optionalText(row.visitor_email),
  visitorPhone: optionalText(row.visitor_phone),
  message: optionalText(row[messageField]),
  createdAt: requiredText(row.created_at, new Date(0).toISOString()),
  contactExpiresAt: optionalText(row.contact_expires_at),
  isLocked: row.is_locked === true,
  isRead: row.is_read === true,
  isArchived: row.is_archived === true,
});

export const mapGuestContactToChat = (
  contact: GuestAnnouncementContact,
  seller: { id: string; name?: string | null },
): Chat => ({
  id: getGuestContactChatId(contact.contactId),
  adId: contact.announcementId,
  adTitle: contact.announcementTitle,
  adPrice: 0,
  adImage: contact.announcementImage || '',
  leadContactExpiresAt: contact.contactExpiresAt,
  isLeadContactExpired: contact.isLocked,
  freezeReason: contact.isLocked ? 'lead_contact_expired' : null,
  isFrozen: contact.isLocked,
  direction: 'received',
  sellerId: seller.id,
  sellerName: seller.name?.trim() || 'Vendedor',
  buyerId: '',
  buyerName: contact.visitorName,
  lastMessage: contact.message || (contact.isLocked ? 'Conteudo protegido' : 'Contato sem mensagem'),
  lastMessageTime: contact.createdAt,
  unreadCount: contact.isRead ? 0 : 1,
  status: CHAT_STATUS.NOVO,
  createdAt: contact.createdAt,
  sourceKind: 'guest_contact',
  guestContactId: contact.contactId,
  guestContactArchived: contact.isArchived,
});
