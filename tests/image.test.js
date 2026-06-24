import { describe, it, expect } from 'vitest';
import { getImageSrc } from '../src/js/lib/image.js';

describe('getImageSrc', () => {
  it('returns no-image placeholder for null/empty', () => {
    expect(getImageSrc(null)).toBe('img/no-image.png');
    expect(getImageSrc('')).toBe('img/no-image.png');
    expect(getImageSrc(undefined)).toBe('img/no-image.png');
  });

  it('routes http URLs through the local image cache (imgcache://)', () => {
    const url = 'https://cdn.myanimelist.net/image.jpg';
    const src = getImageSrc(url);
    expect(src.startsWith('imgcache://i/')).toBe(true);
    // la URL original se recupera decodificando el base64url
    const b64 = src.replace('imgcache://i/', '').replace(/-/g, '+').replace(/_/g, '/');
    expect(atob(b64)).toBe(url);
  });

  it('converts Windows paths to file:// URL', () => {
    expect(getImageSrc('C:\\Users\\linos\\image.png'))
      .toBe('file:///C:/Users/linos/image.png');
  });

  it('handles already-normalized paths', () => {
    expect(getImageSrc('/home/user/image.png'))
      .toBe('file:///home/user/image.png');
  });
});
