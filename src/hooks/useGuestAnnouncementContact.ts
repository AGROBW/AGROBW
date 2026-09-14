import { useCallback, useEffect, useRef, useState } from 'react';
import type { GuestAnnouncementContact } from '../../types';
import { supabase } from '../lib/supabaseClient';
import { emitCountsRefresh } from '../lib/countSync';
import { normalizeGuestAnnouncementContact } from '../lib/guestContactInbox';
import { isSupabaseUnauthorizedError } from '../lib/supabaseAuthGuard';
import { appError, appWarn } from '../utils/appLogger';

export const useGuestAnnouncementContact = (contactId?: string | null) => {
  const [contact, setContact] = useState<GuestAnnouncementContact | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequenceRef = useRef(0);
  const activeContactIdRef = useRef(contactId);
  activeContactIdRef.current = contactId;

  const fetchContact = useCallback(async () => {
    const requestSequence = ++requestSequenceRef.current;
    const requestedContactId = contactId;

    if (!contactId) {
      setContact(null);
      setError(null);
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);
    const { data, error: detailError } = await supabase.rpc('get_my_guest_announcement_contact', {
      p_contact_id: contactId,
    });

    if (
      requestSequence !== requestSequenceRef.current ||
      activeContactIdRef.current !== requestedContactId
    ) {
      return null;
    }

    if (detailError) {
      if (isSupabaseUnauthorizedError(detailError)) {
        appWarn('[GuestContact] Sessao expirada ao carregar contato visitante', { contactId });
      } else {
        appError('[GuestContact] Erro ao carregar contato visitante', detailError, { contactId });
      }
      setContact(null);
      setError(detailError.message || 'Nao foi possivel carregar o contato visitante.');
      setIsLoading(false);
      return null;
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) {
      setContact(null);
      setError('Contato visitante nao encontrado.');
      setIsLoading(false);
      return null;
    }

    const normalized = normalizeGuestAnnouncementContact(row as Record<string, unknown>);
    setContact(normalized);
    setError(null);
    setIsLoading(false);
    return normalized;
  }, [contactId]);

  const markAsRead = useCallback(async () => {
    if (!contactId) return false;

    const { data, error: markError } = await supabase.rpc('mark_my_guest_announcement_contact_read', {
      p_contact_id: contactId,
    });

    if (markError || data !== true) {
      appError('[GuestContact] Erro ao marcar contato visitante como lido', markError, { contactId });
      return false;
    }

    if (activeContactIdRef.current === contactId) {
      setContact((current) => current ? { ...current, isRead: true } : current);
    }
    emitCountsRefresh();
    return true;
  }, [contactId]);

  const setArchived = useCallback(async (archived: boolean) => {
    if (!contactId) return false;

    const { data, error: archiveError } = await supabase.rpc('set_my_guest_announcement_contact_archived', {
      p_contact_id: contactId,
      p_archived: archived,
    });

    if (archiveError || data !== true) {
      appError('[GuestContact] Erro ao alterar arquivamento do contato visitante', archiveError, {
        contactId,
        archived,
      });
      return false;
    }

    if (activeContactIdRef.current === contactId) {
      setContact((current) => current ? { ...current, isArchived: archived } : current);
    }
    emitCountsRefresh();
    return true;
  }, [contactId]);

  useEffect(() => {
    void fetchContact();
  }, [fetchContact]);

  return { contact, isLoading, error, refreshContact: fetchContact, markAsRead, setArchived };
};
