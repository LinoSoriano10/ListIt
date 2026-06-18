import { describe, it, expect } from 'vitest';
import { getImageSrc } from '../src/js/lib/image.js';

describe('getImageSrc', () => {
  it('returns no-image placeholder for null/empty', () => {
    expect(getImageSrc(null)).toBe('img/no-image.png');
    expect(getImageSrc('')).toBe('img/no-image.png');
    expect(getImageSrc(undefined)).toBe('img/no-image.png');
  });

  it('returns http URLs unchanged', () => {
    const url = 'https://cdn.myanimelist.net/image.jpg';
    expect(getImageSrc(url)).toBe(url);
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
