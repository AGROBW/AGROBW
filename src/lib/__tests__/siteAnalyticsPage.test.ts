import { describe, expect, it } from 'vitest';
import { describeSiteAnalyticsPage } from '../siteAnalyticsPage';

const ANNOUNCEMENT_ID = 'a2836277-308e-4bb2-8a63-547041b97750';

describe('describeSiteAnalyticsPage', () => {
  it('envia slug de anuncio como entityKey, nunca como UUID', () => {
    expect(describeSiteAnalyticsPage('/anuncio/tratador-bovino-reforcado')).toEqual({
      pageType: 'announcement',
      pageLabel: 'Detalhe do anúncio',
      entityId: null,
      entityKey: 'tratador-bovino-reforcado',
    });
  });

  it('preserva URL legada com UUID como entityId', () => {
    expect(describeSiteAnalyticsPage(`/anuncio/${ANNOUNCEMENT_ID}`)).toEqual({
      pageType: 'announcement',
      pageLabel: 'Detalhe do anúncio',
      entityId: ANNOUNCEMENT_ID,
      entityKey: null,
    });
  });

  it('mantem slug de loja em entityKey', () => {
    expect(describeSiteAnalyticsPage('/loja/agro-bw')).toMatchObject({
      pageType: 'storefront',
      entityId: null,
      entityKey: 'agro-bw',
    });
  });
});
