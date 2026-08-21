import type { CompanyGenerationMode, CompanyMatch } from '../models';

type CompanySearchResponse = {
  matches?: CompanyMatch[];
  error?: string;
};

export async function searchCompanies(
  mode: CompanyGenerationMode,
  query: string,
): Promise<CompanyMatch[]> {
  const response = await fetch('/api/search-company', {
    method: 'POST',

    headers: {
      'Content-Type': 'application/json',
    },

    body: JSON.stringify({
      mode,
      query,
    }),
  });

  let result: CompanySearchResponse;

  try {
    result = (await response.json()) as CompanySearchResponse;
  } catch {
    throw new Error(`Company search failed with HTTP ${response.status}.`);
  }

  if (!response.ok) {
    throw new Error(result.error ?? `Company search failed with HTTP ${response.status}.`);
  }

  return result.matches ?? [];
}
