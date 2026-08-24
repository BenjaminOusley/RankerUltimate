import { useState } from 'react';

import type {
  GenerationMode,
  GenerationRequest,
  GenerationSort,
  PersonGenerationMode,
  PersonMatch,
  CompanyGenerationMode,
  CompanyMatch,
} from '../../../models';

type CollectionGeneratorProps = {
  initialRequest: GenerationRequest | null;

  onGenerate: (request: GenerationRequest) => Promise<void>;

  onSearchPeople: (mode: PersonGenerationMode, query: string) => Promise<PersonMatch[]>;

  onSearchCompanies: (mode: CompanyGenerationMode, query: string) => Promise<CompanyMatch[]>;
};

const generationModes: {
  value: GenerationMode;
  label: string;
}[] = [
  {
    value: 'company',
    label: 'Company',
  },
  {
    value: 'company-features',
    label: 'Company Feature Films',
  },
  {
    value: 'director',
    label: 'Director',
  },
  {
    value: 'actor',
    label: 'Actor',
  },
  {
    value: 'genre',
    label: 'Genre',
  },
];

const generationSorts: {
  value: GenerationSort;
  label: string;
}[] = [
  {
    value: 'release-asc',
    label: 'Release Date — Oldest First',
  },
  {
    value: 'release-desc',
    label: 'Release Date — Newest First',
  },
  {
    value: 'popularity',
    label: 'Popularity',
  },
];

function createCollectionId(query: string, mode: GenerationMode) {
  const querySlug = query
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `${querySlug || 'generated'}-${mode}`;
}

function parseOptionalInteger(value: string) {
  if (value.trim() === '') {
    return null;
  }

  return Number(value);
}

function CollectionGenerator({
  initialRequest,
  onGenerate,
  onSearchPeople,
  onSearchCompanies,
}: CollectionGeneratorProps) {
  const [mode, setMode] = useState<GenerationMode>(initialRequest?.mode ?? 'genre');

  const [query, setQuery] = useState(initialRequest?.query ?? '');

  const [fromYear, setFromYear] = useState(
    initialRequest?.fromYear === null || initialRequest?.fromYear === undefined
      ? ''
      : String(initialRequest.fromYear),
  );

  const [toYear, setToYear] = useState(
    initialRequest?.toYear === null || initialRequest?.toYear === undefined
      ? ''
      : String(initialRequest.toYear),
  );

  const [sort, setSort] = useState<GenerationSort>(initialRequest?.sort ?? 'popularity');

  const [limit, setLimit] = useState(String(initialRequest?.limit ?? 50));

  const [minRuntime, setMinRuntime] = useState(
    initialRequest?.minRuntime === null || initialRequest?.minRuntime === undefined
      ? ''
      : String(initialRequest.minRuntime),
  );

  const [excludeDocumentaries, setExcludeDocumentaries] = useState(
    initialRequest?.excludeDocumentaries ?? false,
  );

  const [includeAdult, setIncludeAdult] = useState(initialRequest?.includeAdult ?? false);

  const [error, setError] = useState<string | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);

  const [personMatches, setPersonMatches] = useState<PersonMatch[]>([]);

  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(
    initialRequest && (initialRequest.mode === 'actor' || initialRequest.mode === 'director')
      ? initialRequest.tmdbId
      : null,
  );

  const [companyMatches, setCompanyMatches] = useState<CompanyMatch[]>([]);

  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(
    initialRequest &&
      (initialRequest.mode === 'company' || initialRequest.mode === 'company-features')
      ? initialRequest.tmdbId
      : null,
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      setError('Enter something to search for.');

      return;
    }

    const parsedLimit = Number(limit);

    if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
      setError('Maximum results must be a positive integer.');

      return;
    }

    const parsedFromYear = parseOptionalInteger(fromYear);

    const parsedToYear = parseOptionalInteger(toYear);

    if (
      parsedFromYear !== null &&
      (!Number.isInteger(parsedFromYear) || parsedFromYear < 1870 || parsedFromYear > 9999)
    ) {
      setError('From Year must be a valid four-digit year.');

      return;
    }

    if (
      parsedToYear !== null &&
      (!Number.isInteger(parsedToYear) || parsedToYear < 1870 || parsedToYear > 9999)
    ) {
      setError('To Year must be a valid four-digit year.');

      return;
    }

    if (parsedFromYear !== null && parsedToYear !== null && parsedFromYear > parsedToYear) {
      setError('From Year cannot be later than To Year.');

      return;
    }

    const parsedMinRuntime = parseOptionalInteger(minRuntime);

    if (
      parsedMinRuntime !== null &&
      (!Number.isInteger(parsedMinRuntime) || parsedMinRuntime < 0)
    ) {
      setError('Minimum runtime must be a non-negative integer.');

      return;
    }

    if (
      (mode === 'actor' || mode === 'director') &&
      personMatches.length > 1 &&
      selectedPersonId === null
    ) {
      setError('Select a person before generating the collection.');

      return;
    }

    if (
      (mode === 'company' || mode === 'company-features') &&
      companyMatches.length > 1 &&
      selectedCompanyId === null
    ) {
      setError('Select a company before generating the collection.');

      return;
    }

    setError(null);
    setIsGenerating(true);

    try {
      let tmdbId: number | null = null;

      if (mode === 'actor' || mode === 'director') {
        tmdbId = selectedPersonId;

        if (tmdbId === null) {
          const matches = await onSearchPeople(mode, trimmedQuery);

          if (matches.length === 0) {
            setPersonMatches([]);

            throw new Error('No matching people were found.');
          }

          if (matches.length > 1) {
            setPersonMatches(matches);
            setSelectedPersonId(null);
            setError(null);

            return;
          }

          tmdbId = matches[0].id;

          setPersonMatches(matches);

          setSelectedPersonId(tmdbId);
        }
      } else if (mode === 'company' || mode === 'company-features') {
        tmdbId = selectedCompanyId;

        if (tmdbId === null) {
          const matches = await onSearchCompanies(mode, trimmedQuery);

          if (matches.length === 0) {
            setCompanyMatches([]);

            throw new Error('No matching companies were found.');
          }

          if (matches.length > 1) {
            setCompanyMatches(matches);
            setSelectedCompanyId(null);
            setError(null);

            return;
          }

          tmdbId = matches[0].id;

          setCompanyMatches(matches);

          setSelectedCompanyId(tmdbId);
        }
      }

      const request: GenerationRequest = {
        mode,
        query: trimmedQuery,

        collectionId: createCollectionId(trimmedQuery, mode),

        limit: parsedLimit,
        tmdbId,
        fromYear: parsedFromYear,
        toYear: parsedToYear,
        sort,

        minRuntime: parsedMinRuntime,

        excludeDocumentaries,
        includeAdult,
        language: 'en-US',
      };

      await onGenerate(request);
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : 'Collection generation failed.',
      );
    } finally {
      setIsGenerating(false);
    }
  }

  const needsPersonSelection =
    (mode === 'actor' || mode === 'director') &&
    personMatches.length > 1 &&
    selectedPersonId === null;

  const needsCompanySelection =
    (mode === 'company' || mode === 'company-features') &&
    companyMatches.length > 1 &&
    selectedCompanyId === null;

  return (
    <>
      <header className="header">
        <h1>Create Collection</h1>

        <p>Build a custom movie list from TMDB.</p>
      </header>

      <section className="collection-generator">
        <form
          className="generation-form"
          onSubmit={handleSubmit}
        >
          <label className="generation-field">
            <span>Collection Type</span>

            <select
              value={mode}
              onChange={(event) => {
                setMode(event.target.value as GenerationMode);

                setPersonMatches([]);
                setSelectedPersonId(null);
                setCompanyMatches([]);
                setSelectedCompanyId(null);
              }}
            >
              {generationModes.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="generation-field">
            <span>Search</span>

            <input
              type="text"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);

                setPersonMatches([]);
                setSelectedPersonId(null);
              }}
              placeholder={
                mode === 'genre'
                  ? 'Horror'
                  : mode === 'actor'
                    ? 'Ryan Gosling'
                    : mode === 'director'
                      ? 'Christopher Nolan'
                      : 'Pixar Animation Studios'
              }
            />
          </label>

          <div className="generation-grid">
            <label className="generation-field">
              <span>From Year</span>

              <input
                type="number"
                min="1870"
                max="9999"
                value={fromYear}
                onChange={(event) => setFromYear(event.target.value)}
                placeholder="Optional"
              />
            </label>

            <label className="generation-field">
              <span>To Year</span>

              <input
                type="number"
                min="1870"
                max="9999"
                value={toYear}
                onChange={(event) => setToYear(event.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>

          <div className="generation-grid">
            <label className="generation-field">
              <span>Sort</span>

              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as GenerationSort)}
              >
                {generationSorts.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="generation-field">
              <span>Maximum Results</span>

              <input
                type="number"
                min="1"
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
              />
            </label>
          </div>

          <label className="generation-field">
            <span>Minimum Runtime (minutes)</span>

            <input
              type="number"
              min="0"
              value={minRuntime}
              onChange={(event) => setMinRuntime(event.target.value)}
              placeholder="Optional"
            />
          </label>

          <div className="generation-checks">
            <label className="generation-checkbox">
              <input
                type="checkbox"
                checked={excludeDocumentaries}
                onChange={(event) => setExcludeDocumentaries(event.target.checked)}
              />

              <span>Exclude documentaries</span>
            </label>

            <label className="generation-checkbox">
              <input
                type="checkbox"
                checked={includeAdult}
                onChange={(event) => setIncludeAdult(event.target.checked)}
              />

              <span>Include adult titles</span>
            </label>
          </div>

          {personMatches.length > 1 && (
            <section className="person-matches">
              <div className="person-matches-heading">
                <h2>Choose Person</h2>

                <p>Multiple TMDB profiles matched "{query}". Select the correct person.</p>
              </div>

              <div className="person-match-list">
                {personMatches.map((person) => (
                  <label
                    className={
                      selectedPersonId === person.id
                        ? 'person-match person-match-selected'
                        : 'person-match'
                    }
                    key={person.id}
                  >
                    <input
                      type="radio"
                      name="person-match"
                      checked={selectedPersonId === person.id}
                      onChange={() => setSelectedPersonId(person.id)}
                    />

                    <span className="person-match-info">
                      <strong>{person.name}</strong>

                      <span className="person-match-department">{person.department}</span>

                      {person.knownFor.length > 0 && (
                        <span className="person-match-known-for">
                          {person.knownFor.join(' • ')}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </section>
          )}

          {companyMatches.length > 1 && (
            <section className="company-matches">
              <div className="company-matches-heading">
                <h2>Choose Company</h2>

                <p>Multiple TMDB companies matched "{query}". Select the correct company.</p>
              </div>

              <div className="company-match-list">
                {companyMatches.map((company) => (
                  <label
                    className={
                      selectedCompanyId === company.id
                        ? 'company-match company-match-selected'
                        : 'company-match'
                    }
                    key={company.id}
                  >
                    <input
                      type="radio"
                      name="company-match"
                      checked={selectedCompanyId === company.id}
                      onChange={() => setSelectedCompanyId(company.id)}
                    />

                    {company.logo && (
                      <img
                        className="company-match-logo"
                        src={company.logo}
                        alt=""
                      />
                    )}

                    <span className="company-match-info">
                      <strong>{company.name}</strong>

                      {company.originCountry && <span>{company.originCountry}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </section>
          )}

          <p className="generation-note">
            Only released titles are currently included. TMDB metadata is requested in English (US).
          </p>

          {error && <p className="generation-error">{error}</p>}

          <div className="actions">
            <button
              type="submit"
              disabled={isGenerating || needsPersonSelection || needsCompanySelection}
            >
              {isGenerating
                ? 'Generating...'
                : needsPersonSelection
                  ? 'Select a Person'
                  : needsCompanySelection
                    ? 'Select a Company'
                    : 'Generate Collection'}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

export default CollectionGenerator;
