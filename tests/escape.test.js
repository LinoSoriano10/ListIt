import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../src/js/lib/escape.js';

describe('escapeHtml', () => {
  it('escapes < and >', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });
  it('escapes &', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });
  it('escapes quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });
  it('returns empty string for null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
  it('passes through plain text unchanged', () => {
    expect(escapeHtml('Attack on Titan')).toBe('Attack on Titan');
  });
  it('converts non-string values to string', () => {
    expect(escapeHtml(42)).toBe('42');
  });
});
