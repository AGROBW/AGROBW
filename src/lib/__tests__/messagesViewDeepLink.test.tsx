import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chat } from '../../../types';

const mocks = vi.hoisted(() => ({
  chats: [] as Chat[],
  chatsLoading: true,
  location: {
    pathname: '/minha-conta/mensagens',
    search: '?guest=contact-1',
    state: null as unknown,
  },
  navigate: vi.fn(),
  useMessages: vi.fn(),
  useGuestContact: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'seller-1', name: 'Vendedor' } }),
}));

vi.mock('../../hooks/useMessages', () => ({
  useChats: () => ({
    chats: mocks.chats,
    isLoading: mocks.chatsLoading,
    refreshChats: vi.fn(async () => undefined),
  }),
  useMessages: (...args: unknown[]) => {
    mocks.useMessages(...args);
    return {
      messages: [],
      isLoading: false,
      sendMessage: vi.fn(async () => true),
      respondToProposal: vi.fn(async () => true),
    };
  },
}));

vi.mock('../../hooks/useGuestAnnouncementContact', () => ({
  useGuestAnnouncementContact: (contactId: string | null) => {
    mocks.useGuestContact(contactId);
    return {
      contact: null,
      isLoading: false,
      error: null,
      markAsRead: vi.fn(async () => true),
      setArchived: vi.fn(async () => true),
    };
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useLocation: () => mocks.location,
    useNavigate: () => mocks.navigate,
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: mocks.toastError },
}));

vi.mock('../../../components/LogisticsSidebar', () => ({ default: () => null }));

import MessagesView from '../../../components/MessagesView';

const makeChat = (overrides: Partial<Chat>): Chat => ({
  id: 'chat-1',
  adId: 'announcement-1',
  adTitle: 'Trator',
  adPrice: 100,
  adImage: '',
  sellerId: 'seller-1',
  sellerName: 'Vendedor',
  buyerId: 'buyer-1',
  buyerName: 'Comprador',
  lastMessage: 'Tenho interesse',
  lastMessageTime: '2026-09-14T12:00:00.000Z',
  unreadCount: 0,
  status: 'NOVO',
  createdAt: '2026-09-14T12:00:00.000Z',
  direction: 'received',
  ...overrides,
} as Chat);

describe('MessagesView guest deep link', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    mocks.chats = [];
    mocks.chatsLoading = true;
    mocks.location.search = '?guest=contact-1';
    mocks.navigate.mockClear();
    mocks.navigate.mockImplementation(() => {
      mocks.location.search = '';
    });
    mocks.useMessages.mockClear();
    mocks.useGuestContact.mockClear();
    mocks.toastError.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('aguarda a lista sem consultar messages com o id sintetico', async () => {
    await act(async () => root.render(<MessagesView />));

    expect(mocks.useMessages).toHaveBeenCalled();
    expect(mocks.useMessages.mock.calls.every((call) => call[0] === null)).toBe(true);
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.useMessages.mock.calls.length).toBeLessThan(10);
  });

  it('remove um deep link inexistente depois que a lista termina de carregar', async () => {
    mocks.chatsLoading = false;
    await act(async () => root.render(<MessagesView />));

    expect(mocks.toastError).toHaveBeenCalledWith('Contato ou conversa nao encontrado.');
    expect(mocks.navigate).toHaveBeenCalledWith('/minha-conta/mensagens', { replace: true, state: null });
    expect(mocks.useMessages.mock.calls.every((call) => call[0] === null)).toBe(true);
    expect(mocks.useMessages.mock.calls.length).toBeLessThan(10);
  });

  it('seleciona o contato visitante uma vez quando ele chega na lista', async () => {
    await act(async () => root.render(<MessagesView />));

    mocks.chats = [makeChat({
      id: 'guest-contact:contact-1',
      sourceKind: 'guest_contact',
      guestContactId: 'contact-1',
    })];
    mocks.chatsLoading = false;
    await act(async () => root.render(<MessagesView />));

    expect(mocks.useGuestContact).toHaveBeenCalledWith('contact-1');
    expect(mocks.useMessages.mock.calls.every((call) => call[0] === null)).toBe(true);
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });

  it('seleciona um chat cadastrado depois do carregamento', async () => {
    mocks.location.search = '?chat=chat-1';
    await act(async () => root.render(<MessagesView />));

    mocks.chats = [makeChat({ id: 'chat-1' })];
    mocks.chatsLoading = false;
    await act(async () => root.render(<MessagesView />));

    expect(mocks.useMessages.mock.calls.some((call) => call[0] === 'chat-1')).toBe(true);
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  });
});
