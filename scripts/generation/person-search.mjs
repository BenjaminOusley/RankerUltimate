import { normalizeTitle } from '../providers/tmdb.mjs';

function createPersonMatch(person) {
  const knownFor = [
    ...new Set(
      (person.known_for ?? []).map((item) => item.title ?? item.name ?? null).filter(Boolean),
    ),
  ].slice(0, 3);

  return {
    id: person.id,
    name: person.name,
    department: person.known_for_department ?? 'Unknown department',
    knownFor,
  };
}

export async function findPersonMatches({ tmdb, query, mode }) {
  const expectedDepartment = mode === 'director' ? 'Directing' : 'Acting';

  const normalizedQuery = normalizeTitle(query);

  const people = await tmdb.searchPerson(query);

  const exactMatches = people.filter((person) => normalizeTitle(person.name) === normalizedQuery);

  const exactDepartmentMatches = exactMatches.filter(
    (person) =>
      normalizeTitle(person.known_for_department ?? '') === normalizeTitle(expectedDepartment),
  );

  const departmentMatches = people.filter(
    (person) =>
      normalizeTitle(person.known_for_department ?? '') === normalizeTitle(expectedDepartment),
  );

  let matches;

  if (exactDepartmentMatches.length > 0) {
    matches = exactDepartmentMatches;
  } else if (exactMatches.length > 0) {
    matches = exactMatches;
  } else if (departmentMatches.length > 0) {
    matches = departmentMatches;
  } else {
    matches = people;
  }

  return matches.slice(0, 10).map(createPersonMatch);
}
