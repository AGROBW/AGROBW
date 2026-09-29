import { ensureSiteAnalyticsSessionId } from '../siteAnalyticsSession';
import { supabase } from '../supabaseClient';
import { appWarn } from '../../utils/appLogger';
import type { SellerStoreInsightSourceChannel } from './attribution';

export type SellerStoreInsightBrowserEventType =
  | 'store_visit_attribution'
  | 'announcement_open'
  | 'contact_whatsapp'
  | 'contact_platform'
  | 'website_click'
  | 'store_share'
  | 'catalog_qr_open';

type RecordSellerStoreInsightEventInput = {
  storeSlug: string;
  eventType: SellerStoreInsightBrowserEventType;
  sourceChannel: SellerStoreInsightSourceChannel;
  announcementId?: string | null;
  catalogExportId?: string | null;
  eventKey?: string;
};

const createEventKey = () => {
  const cryptoApi = typeof globalThis.crypto !== 'undefined'
    ? globalThis.crypto as {
        randomUUID?: () => string;
        getRandomValues?: (array: Uint8Array) => Uint8Array;
      }
    : undefined;

  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();

  const bytes = new Uint8Array(16);
  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export const recordSellerStoreInsightEvent = async ({
  storeSlug,
  eventType,
  sourceChannel,
  announcementId = null,
  catalogExportId = null,
  eventKey = createEventKey(),
}: RecordSellerStoreInsightEventInput) => {
  const sessionId = ensureSiteAnalyticsSessionId();
  if (!storeSlug || !sessionId) return false;

  try {
    const { data, error } = await supabase.rpc('record_seller_store_insight_event', {
      p_store_slug: storeSlug,
      p_event_type: eventType,
      p_session_id: sessionId,
      p_event_key: eventKey,
      p_announcement_id: announcementId,
      p_catalog_export_id: catalogExportId,
      p_source_channel: sourceChannel,
    });

    if (error) {
      appWarn('[SellerStoreInsights] Nao foi possivel registrar evento', {
        eventType,
        message: error.message,
      });
      return false;
    }

    return data === true;
  } catch (error) {
    appWarn('[SellerStoreInsights] Falha inesperada ao registrar evento', {
      eventType,
      error,
    });
    return false;
  }
};
