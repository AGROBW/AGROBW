import { describe, expect, it } from 'vitest';
import {
  getAnnouncementIdentifier,
  getAnnouncementPath,
  isAnnouncementSlug,
  isAnnouncementUuid,
} from '../announcementUrl';

const UUID = '20593db3-8d55-48e9-a0af-959e327e9add';

describe('announcementUrl', () => {
  it('prioriza slug válido na URL pública', () => {
    expect(getAnnouncementIdentifier({ id: UUID, slug: 'trator-john-deere-6145j' }))
      .toBe('trator-john-deere-6145j');
    expect(getAnnouncementPath({ id: UUID, slug: 'trator-john-deere-6145j' }))
      .toBe('/anuncio/trator-john-deere-6145j');
  });

  it('mantém UUID como fallback para dados legados sem slug', () => {
    expect(getAnnouncementIdentifier({ id: UUID, slug: null })).toBe(UUID);
    expect(getAnnouncementPath({ id: UUID })).toBe(`/anuncio/${UUID}`);
  });

  it('não aceita slug malformado', () => {
    expect(isAnnouncementSlug('trator-john-deere')).toBe(true);
    expect(isAnnouncementSlug('Trator John Deere')).toBe(false);
    expect(isAnnouncementSlug('trator--john')).toBe(false);
    expect(isAnnouncementSlug('-trator')).toBe(false);
    expect(isAnnouncementSlug(UUID)).toBe(false);
  });

  it('reconhece UUID legado', () => {
    expect(isAnnouncementUuid(UUID)).toBe(true);
    expect(isAnnouncementUuid('trator-john-deere')).toBe(false);
  });
});
