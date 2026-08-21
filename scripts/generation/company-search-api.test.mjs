import { describe, expect, it } from 'vitest';

import { validateCompanySearchRequest } from '../../api/search-company.js';

describe('validateCompanySearchRequest', () => {
  it('accepts company mode', () => {
    expect(
      validateCompanySearchRequest({
        mode: 'company',
        query: 'Marvel',
      }).ok,
    ).toBe(true);
  });

  it('accepts company-features mode', () => {
    expect(
      validateCompanySearchRequest({
        mode: 'company-features',
        query: 'Pixar Animation Studios',
      }).ok,
    ).toBe(true);
  });

  it('rejects an invalid mode', () => {
    expect(
      validateCompanySearchRequest({
        mode: 'actor',
        query: 'Marvel',
      }),
    ).toEqual({
      ok: false,
      error: 'Company search mode must be company or company-features.',
    });
  });

  it('rejects an empty query', () => {
    expect(
      validateCompanySearchRequest({
        mode: 'company',
        query: '   ',
      }),
    ).toEqual({
      ok: false,
      error: 'Search query must contain between 1 and 200 characters.',
    });
  });
});
