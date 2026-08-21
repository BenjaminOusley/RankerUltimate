import { normalizeTitle } from '../providers/tmdb.mjs';

const TMDB_COMPANY_LOGO_BASE = 'https://image.tmdb.org/t/p/w185';

function createCompanyMatch(company) {
  return {
    id: company.id,
    name: company.name,

    originCountry: company.origin_country || null,

    logo: company.logo_path ? `${TMDB_COMPANY_LOGO_BASE}${company.logo_path}` : null,
  };
}

export async function findCompanyMatches({ tmdb, query }) {
  const companies = await tmdb.searchCompany(query);

  const normalizedQuery = normalizeTitle(query);

  const exactMatches = companies.filter(
    (company) => normalizeTitle(company.name) === normalizedQuery,
  );

  const aliasMatches = companies.filter((company) => {
    const candidate = normalizeTitle(company.name);

    return normalizedQuery.includes(candidate) || candidate.includes(normalizedQuery);
  });

  let matches;

  if (exactMatches.length > 0) {
    matches = exactMatches;
  } else if (aliasMatches.length > 0) {
    matches = aliasMatches;
  } else {
    matches = companies;
  }

  return [...new Map(matches.map((company) => [company.id, company])).values()]
    .slice(0, 10)
    .map(createCompanyMatch);
}
