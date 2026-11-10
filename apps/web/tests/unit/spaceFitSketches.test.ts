import { describe, expect, it } from 'vitest';
import { productKey, SKETCHES, sketchFor } from '../../src/features/space-fit/sketches';

describe('space-fit sketch slot', () => {
  it('ships no drawings yet, so every row hides the slot', () => {
    expect(Object.keys(SKETCHES)).toEqual([]);
    expect(sketchFor('crawl:daiso:1010289:o1a2b3c4d')).toBeNull();
  });

  it('matches a variant or its product id', () => {
    const table = { 'crawl:daiso:1010289': '/sketches/daiso-1010289.webp' };
    expect(productKey('crawl:daiso:1010289:o1a2b3c4d')).toBe('crawl:daiso:1010289');
    expect(sketchFor('crawl:daiso:1010289:o1a2b3c4d', table)).toBe('/sketches/daiso-1010289.webp');
    expect(sketchFor('crawl:muji:1:o00000001', table)).toBeNull();
  });

  it('refuses anything but a same-origin /sketches/ drawing', () => {
    for (const bad of ['https://cdn.example/a.jpg', '//cdn.example/a.webp', '/sketches/../a.webp', '/sketches/a.png', 'data:image/png;base64,AA']) {
      expect(sketchFor('crawl:muji:1', { 'crawl:muji:1': bad })).toBeNull();
    }
  });
});
