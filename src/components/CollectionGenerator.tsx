import { useState } from 'react';

import type { GenerationMode, GenerationRequest, GenerationSort } from '../models';

type CollectionGeneratorProps = {
  onGenerate: (request: GenerationRequest) => Promise<void>;

  onBack: () => void;
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

function CollectionGenerator({ onGenerate, onBack }: CollectionGeneratorProps) {
  const [mode, setMode] = useState<GenerationMode>('genre');

  const [query, setQuery] = useState('');

  const [fromYear, setFromYear] = useState('');

  const [toYear, setToYear] = useState('');

  const [sort, setSort] = useState<GenerationSort>('popularity');

  const [limit, setLimit] = useState('50');

  const [minRuntime, setMinRuntime] = useState('');

  const [excludeDocumentaries, setExcludeDocumentaries] = useState(false);

  const [includeAdult, setIncludeAdult] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);

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

    const request: GenerationRequest = {
      mode,
      query: trimmedQuery,
      collectionId: createCollectionId(trimmedQuery, mode),
      limit: parsedLimit,
      tmdbId: null,
      fromYear: parsedFromYear,
      toYear: parsedToYear,
      sort,
      minRuntime: parsedMinRuntime,
      excludeDocumentaries,
      includeAdult,
      language: 'en-US',
    };

    setError(null);
    setIsGenerating(true);

    try {
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
              onChange={(event) => setMode(event.target.value as GenerationMode)}
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
              onChange={(event) => setQuery(event.target.value)}
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

          <p className="generation-note">
            Only released titles are currently included. TMDB metadata is requested in English (US).
          </p>

          {error && <p className="generation-error">{error}</p>}

          <div className="actions">
            <button
              type="button"
              onClick={onBack}
              disabled={isGenerating}
            >
              Back
            </button>

            <button
              type="submit"
              disabled={isGenerating}
            >
              {isGenerating ? 'Generating...' : 'Generate Collection'}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

export default CollectionGenerator;
