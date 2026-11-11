import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { productKey, SKETCHES, sketchFor } from '../../src/features/space-fit/sketches';

const SKETCH_DIR = resolve('apps/web/public/sketches');

describe('space-fit sketch slot', () => {
  it('maps the 30 shipped drawings, sharing one file across product variants', () => {
    const paths = [...new Set(Object.values(SKETCHES))];
    expect(paths).toHaveLength(30);
    expect(Object.keys(SKETCHES).length).toBeGreaterThanOrEqual(30);
    expect(sketchFor('crawl:daiso:1065176:o1a2b3c4d')).toBe('/sketches/daiso-1065176.webp');
    expect(sketchFor('crawl:daiso:1065177')).toBe('/sketches/daiso-1065176.webp');
    expect(sketchFor('crawl:daiso:1039099')).toBe('/sketches/daiso-1039098.webp');
    expect(sketchFor('crawl:daiso:1078316')).toBe('/sketches/daiso-1078314.webp');
    expect(sketchFor('crawl:muji:1003338')).toBe('/sketches/muji-1003337.webp');
  });

  it('keeps the grey placeholder for the two drawings that are not ready', () => {
    expect(sketchFor('crawl:muji:1006186')).toBeNull();
    expect(sketchFor('crawl:muji:1006187')).toBeNull();
    expect(sketchFor('crawl:muji:1006188')).toBeNull();
    expect(sketchFor('crawl:muji:59138')).toBeNull();
    expect(SKETCHES['crawl:muji:1006187']).toBeUndefined();
    expect(SKETCHES['crawl:muji:59138']).toBeUndefined();
  });

  it('ships a same-origin webp for every mapped path', () => {
    const files = new Set(readdirSync(SKETCH_DIR).filter((name) => name.endsWith('.webp')));
    expect(files.size).toBe(30);
    for (const path of new Set(Object.values(SKETCHES))) {
      expect(path).toMatch(/^\/sketches\/[a-z0-9-]+\.webp$/);
      expect(files.has(path.slice('/sketches/'.length))).toBe(true);
    }
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
