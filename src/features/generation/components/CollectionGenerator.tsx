import { useState } from 'react';

import styles from './CollectionGenerator.module.css';

import type {
  CompanyGenerationMode,
  CompanyMatch,
  GameGenerationMode,
  GameGenerationSort,
  GenerationMediaType,
  GenerationMode,
  GenerationRequest,
  GenerationSort,
  IgdbEntityMatch,
  PersonGenerationMode,
  PersonMatch,
  TmdbGenerationMode,
  TmdbGenerationSort,
} from '../types';

type CollectionGeneratorProps = {
  initialRequest: GenerationRequest | null;
  onGenerate: (request: GenerationRequest) => Promise<string>;
  onGenerated: (collectionId: string) => void;
  onSearchPeople: (mode: PersonGenerationMode, query: string) => Promise<PersonMatch[]>;
  onSearchCompanies: (mode: CompanyGenerationMode, query: string) => Promise<CompanyMatch[]>;
  onSearchIgdbEntities: (
    mode: GameGenerationMode,
    query: string,
  ) => Promise<IgdbEntityMatch[]>;
};

type SelectOption<T extends string> = {
  value: T;
  label: string;
};

const generationMediaTypes: SelectOption<GenerationMediaType>[] = [
  { value: 'movie', label: 'Movies' },
  { value: 'tv', label: 'TV Shows' },
  { value: 'game', label: 'Games' },
];

const movieModes: SelectOption<TmdbGenerationMode>[] = [
  { value: 'company', label: 'Company' },
  { value: 'company-features', label: 'Company Feature Films' },
  { value: 'director', label: 'Director' },
  { value: 'actor', label: 'Actor' },
  { value: 'genre', label: 'Genre' },
];

const tvModes: SelectOption<TmdbGenerationMode>[] = [
  { value: 'company', label: 'Company' },
  { value: 'actor', label: 'Actor' },
  { value: 'genre', label: 'Genre' },
];

const gameModes: SelectOption<GameGenerationMode>[] = [
  { value: 'genre', label: 'Genre' },
  { value: 'franchise', label: 'Franchise' },
  { value: 'platform', label: 'Platform' },
  { value: 'company', label: 'Company' },
];

const tmdbSorts: SelectOption<TmdbGenerationSort>[] = [
  { value: 'release-asc', label: 'Release Date — Oldest First' },
  { value: 'release-desc', label: 'Release Date — Newest First' },
  { value: 'popularity', label: 'Popularity' },
];

const gameSorts: SelectOption<GameGenerationSort>[] = [
  { value: 'popular', label: 'Popularity' },
  { value: 'rating', label: 'Highest Rated' },
  { value: 'release-asc', label: 'Release Date — Oldest First' },
  { value: 'release-desc', label: 'Release Date — Newest First' },
  { value: 'name', label: 'Name — A–Z' },
];

function createRuntimeCollectionId() {
  return `generated-${crypto.randomUUID()}`;
}

function parseOptionalInteger(value: string) {
  if (value.trim() === '') {
    return null;
  }

  return Number(value);
}

function isGameMode(mode: GenerationMode): mode is GameGenerationMode {
  return gameModes.some((option) => option.value === mode);
}

function isTmdbMode(mode: GenerationMode): mode is TmdbGenerationMode {
  return movieModes.some((option) => option.value === mode);
}

function isGameSort(sort: GenerationSort): sort is GameGenerationSort {
  return gameSorts.some((option) => option.value === sort);
}

function isTmdbSort(sort: GenerationSort): sort is TmdbGenerationSort {
  return tmdbSorts.some((option) => option.value === sort);
}

function getModes(mediaType: GenerationMediaType) {
  if (mediaType === 'game') {
    return gameModes;
  }

  return mediaType === 'tv' ? tvModes : movieModes;
}

function getSearchPlaceholder(mediaType: GenerationMediaType, mode: GenerationMode) {
  if (mediaType === 'game') {
    if (mode === 'franchise') {
      return 'Halo';
    }

    if (mode === 'platform') {
      return 'PlayStation 2';
    }

    if (mode === 'company') {
      return 'Nintendo';
    }

    return 'Shooter';
  }

  if (mode === 'genre') {
    return 'Horror';
  }

  if (mode === 'actor') {
    return 'Ryan Gosling';
  }

  if (mode === 'director') {
    return 'Christopher Nolan';
  }

  return 'Pixar Animation Studios';
}

export function CollectionGenerator({
  initialRequest,
  onGenerate,
  onGenerated,
  onSearchPeople,
  onSearchCompanies,
  onSearchIgdbEntities,
}: CollectionGeneratorProps) {
  const initialMediaType = initialRequest?.mediaType ?? 'movie';

  const [mediaType, setMediaType] = useState<GenerationMediaType>(initialMediaType);
  const [mode, setMode] = useState<GenerationMode>(initialRequest?.mode ?? 'genre');
  const [query, setQuery] = useState(initialRequest?.query ?? '');

  const [fromYear, setFromYear] = useState(
    initialRequest && initialRequest.mediaType !== 'game' && initialRequest.fromYear !== null
      ? String(initialRequest.fromYear)
      : '',
  );

  const [toYear, setToYear] = useState(
    initialRequest && initialRequest.mediaType !== 'game' && initialRequest.toYear !== null
      ? String(initialRequest.toYear)
      : '',
  );

  const [sort, setSort] = useState<GenerationSort>(
    initialRequest?.sort ?? (initialMediaType === 'game' ? 'popular' : 'popularity'),
  );

  const [limit, setLimit] = useState(String(initialRequest?.limit ?? 50));

  const [minRuntime, setMinRuntime] = useState(
    initialRequest &&
      initialRequest.mediaType === 'movie' &&
      initialRequest.minRuntime !== null
      ? String(initialRequest.minRuntime)
      : '',
  );

  const [excludeDocumentaries, setExcludeDocumentaries] = useState(
    initialRequest && initialRequest.mediaType !== 'game'
      ? initialRequest.excludeDocumentaries
      : false,
  );

  const [includeAdult, setIncludeAdult] = useState(
    initialRequest && initialRequest.mediaType !== 'game' ? initialRequest.includeAdult : false,
  );

  const [includeDlcExpansions, setIncludeDlcExpansions] = useState(
    initialRequest?.mediaType === 'game' ? initialRequest.includeDlcExpansions : false,
  );

  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const [personMatches, setPersonMatches] = useState<PersonMatch[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(
    initialRequest &&
      initialRequest.mediaType !== 'game' &&
      (initialRequest.mode === 'actor' || initialRequest.mode === 'director')
      ? initialRequest.tmdbId
      : null,
  );

  const [companyMatches, setCompanyMatches] = useState<CompanyMatch[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(
    initialRequest &&
      initialRequest.mediaType !== 'game' &&
      (initialRequest.mode === 'company' || initialRequest.mode === 'company-features')
      ? initialRequest.tmdbId
      : null,
  );

  const [igdbMatches, setIgdbMatches] = useState<IgdbEntityMatch[]>([]);
  const [selectedIgdbId, setSelectedIgdbId] = useState<number | null>(
    initialRequest?.mediaType === 'game' ? initialRequest.igdbId : null,
  );

  function clearResolvedMatches() {
    setPersonMatches([]);
    setSelectedPersonId(null);
    setCompanyMatches([]);
    setSelectedCompanyId(null);
    setIgdbMatches([]);
    setSelectedIgdbId(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      setError('Enter something to search for.');
      return;
    }

    const parsedLimit = Number(limit);

    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 250) {
      setError('Maximum results must be between 1 and 250.');
      return;
    }

    setError(null);
    setIsGenerating(true);

    try {
      if (mediaType === 'game') {
        if (!isGameMode(mode)) {
          throw new Error('Choose a supported game collection type.');
        }

        let igdbId = selectedIgdbId;

        if (igdbId === null) {
          const matches = await onSearchIgdbEntities(mode, trimmedQuery);

          if (matches.length === 0) {
            setIgdbMatches([]);
            throw new Error(`No matching IGDB ${mode}s were found.`);
          }

          if (matches.length === 1) {
            igdbId = matches[0].id;
            setIgdbMatches(matches);
            setSelectedIgdbId(igdbId);
          } else {
            setIgdbMatches(matches);
            setSelectedIgdbId(null);
            setIsGenerating(false);
            return;
          }
        }

        const request: GenerationRequest = {
          mediaType: 'game',
          mode,
          query: trimmedQuery,
          collectionId: createRuntimeCollectionId(),
          limit: parsedLimit,
          igdbId,
          sort: isGameSort(sort) ? sort : 'popular',
          includeDlcExpansions,
        };

        const generatedCollectionId = await onGenerate(request);
        setIsGenerating(false);
        onGenerated(generatedCollectionId);
        return;
      }

      if (!isTmdbMode(mode)) {
        throw new Error('Choose a supported movie or TV collection type.');
      }

      const parsedFromYear = parseOptionalInteger(fromYear);
      const parsedToYear = parseOptionalInteger(toYear);

      if (
        parsedFromYear !== null &&
        (!Number.isInteger(parsedFromYear) || parsedFromYear < 1870 || parsedFromYear > 9999)
      ) {
        throw new Error('From Year must be a valid four-digit year.');
      }

      if (
        parsedToYear !== null &&
        (!Number.isInteger(parsedToYear) || parsedToYear < 1870 || parsedToYear > 9999)
      ) {
        throw new Error('To Year must be a valid four-digit year.');
      }

      if (parsedFromYear !== null && parsedToYear !== null && parsedFromYear > parsedToYear) {
        throw new Error('From Year cannot be later than To Year.');
      }

      const parsedMinRuntime = mediaType === 'movie' ? parseOptionalInteger(minRuntime) : null;

      if (
        parsedMinRuntime !== null &&
        (!Number.isInteger(parsedMinRuntime) || parsedMinRuntime < 0 || parsedMinRuntime > 1000)
      ) {
        throw new Error('Minimum runtime must be between 0 and 1000 minutes.');
      }

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
            setIsGenerating(false);
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
            setIsGenerating(false);
            return;
          }

          tmdbId = matches[0].id;
          setCompanyMatches(matches);
          setSelectedCompanyId(tmdbId);
        }
      }

      const request: GenerationRequest = {
        mediaType,
        mode,
        query: trimmedQuery,
        collectionId: createRuntimeCollectionId(),
        limit: parsedLimit,
        tmdbId,
        fromYear: parsedFromYear,
        toYear: parsedToYear,
        sort: isTmdbSort(sort) ? sort : 'popularity',
        minRuntime: parsedMinRuntime,
        excludeDocumentaries,
        includeAdult,
        language: 'en-US',
      };

      const generatedCollectionId = await onGenerate(request);
      setIsGenerating(false);
      onGenerated(generatedCollectionId);
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : 'Collection generation failed.',
      );
      setIsGenerating(false);
    }
  }

  const needsPersonSelection =
    mediaType !== 'game' &&
    (mode === 'actor' || mode === 'director') &&
    personMatches.length > 1 &&
    selectedPersonId === null;

  const needsCompanySelection =
    mediaType !== 'game' &&
    (mode === 'company' || mode === 'company-features') &&
    companyMatches.length > 1 &&
    selectedCompanyId === null;

  const needsIgdbSelection =
    mediaType === 'game' && igdbMatches.length > 1 && selectedIgdbId === null;

  const visibleSorts = mediaType === 'game' ? gameSorts : tmdbSorts;
  const visibleModes = getModes(mediaType);

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.grid}>
        <label className={styles.field}>
          <span>Media Type</span>

          <select
            value={mediaType}
            onChange={(event) => {
              const nextMediaType = event.target.value as GenerationMediaType;
              const nextModes = getModes(nextMediaType);

              setMediaType(nextMediaType);

              if (!nextModes.some((option) => option.value === mode)) {
                setMode('genre');
              }

              if (nextMediaType === 'game') {
                setSort('popular');
              } else if (!isTmdbSort(sort)) {
                setSort('popularity');
              }

              clearResolvedMatches();
              setError(null);
            }}
          >
            {generationMediaTypes.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>Collection Type</span>

          <select
            value={mode}
            onChange={(event) => {
              setMode(event.target.value as GenerationMode);
              clearResolvedMatches();
              setError(null);
            }}
          >
            {visibleModes.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className={styles.field}>
        <span>Search</span>

        <input
          type="text"
          maxLength={200}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            clearResolvedMatches();
            setError(null);
          }}
          placeholder={getSearchPlaceholder(mediaType, mode)}
        />
      </label>

      {mediaType !== 'game' && (
        <div className={styles.grid}>
          <label className={styles.field}>
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

          <label className={styles.field}>
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
      )}

      <div className={styles.grid}>
        <label className={styles.field}>
          <span>Sort</span>

          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as GenerationSort)}
          >
            {visibleSorts.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>Maximum Results</span>
          <input
            type="number"
            min="1"
            max="250"
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
          />
        </label>
      </div>

      {mediaType === 'movie' && (
        <label className={styles.field}>
          <span>Minimum Runtime (minutes)</span>
          <input
            type="number"
            min="0"
            max="1000"
            value={minRuntime}
            onChange={(event) => setMinRuntime(event.target.value)}
            placeholder="Optional"
          />
        </label>
      )}

      {mediaType === 'game' && (
        <div className={styles.checks}>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={includeDlcExpansions}
              onChange={(event) => setIncludeDlcExpansions(event.target.checked)}
            />
            <span>Include DLC / expansions</span>
          </label>
        </div>
      )}

      {mediaType !== 'game' && (
        <div className={styles.checks}>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={excludeDocumentaries}
              onChange={(event) => setExcludeDocumentaries(event.target.checked)}
            />
            <span>Exclude documentaries</span>
          </label>

          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={includeAdult}
              onChange={(event) => setIncludeAdult(event.target.checked)}
            />
            <span>Include adult titles</span>
          </label>
        </div>
      )}

      {personMatches.length > 1 && mediaType !== 'game' && (
        <section className={styles.matches}>
          <div className={styles.matchesHeading}>
            <h2>Choose Person</h2>
            <p>Multiple TMDB profiles matched "{query}". Select the correct person.</p>
          </div>

          <div className={styles.matchList}>
            {personMatches.map((person) => (
              <label
                className={[
                  styles.match,
                  selectedPersonId === person.id ? styles.matchSelected : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={person.id}
              >
                <input
                  type="radio"
                  name="person-match"
                  checked={selectedPersonId === person.id}
                  onChange={() => setSelectedPersonId(person.id)}
                />

                <span className={styles.matchInfo}>
                  <strong>{person.name}</strong>
                  <span className={styles.matchDepartment}>{person.department}</span>
                  {person.knownFor.length > 0 && (
                    <span className={styles.matchKnownFor}>{person.knownFor.join(' • ')}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </section>
      )}

      {companyMatches.length > 1 && mediaType !== 'game' && (
        <section className={styles.matches}>
          <div className={styles.matchesHeading}>
            <h2>Choose Company</h2>
            <p>Multiple TMDB companies matched "{query}". Select the correct company.</p>
          </div>

          <div className={styles.matchList}>
            {companyMatches.map((company) => (
              <label
                className={[
                  styles.match,
                  selectedCompanyId === company.id ? styles.matchSelected : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={company.id}
              >
                <input
                  type="radio"
                  name="company-match"
                  checked={selectedCompanyId === company.id}
                  onChange={() => setSelectedCompanyId(company.id)}
                />

                {company.logo && <img className={styles.companyLogo} src={company.logo} alt="" />}

                <span className={styles.matchInfo}>
                  <strong>{company.name}</strong>
                  {company.originCountry && <span>{company.originCountry}</span>}
                </span>
              </label>
            ))}
          </div>
        </section>
      )}

      {igdbMatches.length > 1 && mediaType === 'game' && (
        <section className={styles.matches}>
          <div className={styles.matchesHeading}>
            <h2>Choose {gameModes.find((option) => option.value === mode)?.label ?? 'Match'}</h2>
            <p>Multiple IGDB matches were found for "{query}". Select the one you meant.</p>
          </div>

          <div className={styles.matchList}>
            {igdbMatches.map((match) => (
              <label
                className={[
                  styles.match,
                  selectedIgdbId === match.id ? styles.matchSelected : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={match.id}
              >
                <input
                  type="radio"
                  name="igdb-match"
                  checked={selectedIgdbId === match.id}
                  onChange={() => setSelectedIgdbId(match.id)}
                />

                {match.image && <img className={styles.companyLogo} src={match.image} alt="" />}

                <span className={styles.matchInfo}>
                  <strong>{match.name}</strong>
                  {match.detail && <span>{match.detail}</span>}
                </span>
              </label>
            ))}
          </div>
        </section>
      )}

      <p className={styles.note}>
        {mediaType === 'game'
          ? includeDlcExpansions
            ? 'Game candidates are sourced from IGDB. DLC, expansions, and standalone expansions are included.'
            : 'Game candidates are sourced from IGDB. DLC and expansions are excluded by default.'
          : 'Only released titles are currently included. TMDB metadata is requested in English (US).'}
      </p>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.actions}>
        <button
          type="submit"
          disabled={
            isGenerating || needsPersonSelection || needsCompanySelection || needsIgdbSelection
          }
        >
          {isGenerating
            ? 'Generating...'
            : needsPersonSelection
              ? 'Select a Person'
              : needsCompanySelection
                ? 'Select a Company'
                : needsIgdbSelection
                  ? 'Select a Match'
                  : 'Generate Collection'}
        </button>
      </div>
    </form>
  );
}
