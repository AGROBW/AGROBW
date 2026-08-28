import { describe, expect, it } from 'vitest';
import {
  buildAdArtworkFileName,
  buildAdArtworkLocation,
  formatAdArtworkPrice,
  getAdArtworkDimensions,
  getDefaultAdArtworkPriceMode,
} from '../adShareArtwork';

describe('adShareArtwork', () => {
  it('exposes the approved output dimensions', () => {
    expect(getAdArtworkDimensions('square')).toMatchObject({ width: 1080, height: 1080 });
    expect(getAdArtworkDimensions('story')).toMatchObject({ width: 1080, height: 1920 });
    expect(getAdArtworkDimensions('landscape')).toMatchObject({ width: 1200, height: 628 });
  });

  it('formats the advertised price or consult label', () => {
    expect(formatAdArtworkPrice(450000, 'price')).toBe('R$\u00a0450.000,00');
    expect(formatAdArtworkPrice(450000, 'consult')).toBe('Sob consulta');
    expect(formatAdArtworkPrice(0, 'price')).toBe('Sob consulta');
  });

  it('selects a safe default price mode', () => {
    expect(getDefaultAdArtworkPriceMode({ price: 100, priceNegotiable: false })).toBe('price');
    expect(getDefaultAdArtworkPriceMode({ price: 100, priceNegotiable: true })).toBe('consult');
    expect(getDefaultAdArtworkPriceMode({ price: 0 })).toBe('consult');
  });

  it('builds location and a safe download filename', () => {
    expect(buildAdArtworkLocation({ city: 'Goiania', state: 'GO' })).toBe('Goiania - GO');
    expect(buildAdArtworkLocation({ city: '', state: '' })).toBe('Brasil');
    expect(buildAdArtworkFileName('Trator Joao Deere 6.145J', 'story', 'impact'))
      .toBe('agro-bw-trator-joao-deere-6-145j-impact-story.png');
  });
});

