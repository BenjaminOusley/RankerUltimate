export const SUPPORTED_GENERATION_MODES = [
  'company',
  'company-features',
  'director',
  'actor',
  'genre',
];

const VALUE_OPTIONS = new Set([
  'media',
  'limit',
  'tmdb-id',
  'from',
  'to',
  'sort',
  'min-runtime',
]);

const FLAG_OPTIONS = new Set(['exclude-documentaries', 'include-adult']);

const SUPPORTED_MEDIA_TYPES = new Set(['movie', 'tv']);

const SUPPORTED_SORTS = new Set(['release-asc', 'release-desc', 'popularity']);

function failure(error) {
  return {
    ok: false,
    error,
  };
}

function parsePositiveInteger(value) {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < 1) {
    return null;
  }

  return number;
}

function parseNonNegativeInteger(value) {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const number = Number(value);

  if (!Number.isSafeInteger(number) || number < 0) {
    return null;
  }

  return number;
}

function parseYear(value) {
  if (!/^\d{4}$/.test(value)) {
    return null;
  }

  const year = Number(value);

  if (!Number.isInteger(year) || year < 1870 || year > 9999) {
    return null;
  }

  return year;
}

export function parseGenerationRequest(args) {
  const [mode, query, collectionId, ...options] = args;

  if (!mode || !query || !collectionId) {
    return failure(
      'Missing arguments.\n' +
        'Example: npm run generate:tmdb -- company "Pixar Animation Studios" pixar',
    );
  }

  if (!SUPPORTED_GENERATION_MODES.includes(mode)) {
    return failure(
      `Unsupported generation mode: ${mode}\n` +
        `Currently supported: ${SUPPORTED_GENERATION_MODES.join(', ')}`,
    );
  }

  const values = new Map();
  const flags = new Set();

  for (let index = 0; index < options.length; index += 1) {
    const token = options[index];

    if (!token.startsWith('--')) {
      return failure(`Unexpected argument: ${token}`);
    }

    const name = token.slice(2);

    if (FLAG_OPTIONS.has(name)) {
      if (flags.has(name)) {
        return failure(`Option --${name} was provided more than once.`);
      }

      flags.add(name);
      continue;
    }

    if (!VALUE_OPTIONS.has(name)) {
      return failure(`Unknown option: --${name}`);
    }

    if (values.has(name)) {
      return failure(`Option --${name} was provided more than once.`);
    }

    const value = options[index + 1];

    if (value === undefined || value.startsWith('--')) {
      return failure(`--${name} requires a value.`);
    }

    values.set(name, value);
    index += 1;
  }

  const mediaType = values.get('media') ?? 'movie';

  if (!SUPPORTED_MEDIA_TYPES.has(mediaType)) {
    return failure('--media must be movie or tv.');
  }

  if (mediaType === 'tv' && (mode === 'company-features' || mode === 'director')) {
    return failure(`${mode} mode is only supported for movies.`);
  }

  const limitValue = values.get('limit');
  const limit = limitValue === undefined ? 250 : parsePositiveInteger(limitValue);

  if (limit === null) {
    return failure('--limit must be a positive integer.');
  }

  const tmdbIdValue = values.get('tmdb-id');
  const tmdbId = tmdbIdValue === undefined ? null : parsePositiveInteger(tmdbIdValue);

  if (tmdbIdValue !== undefined && tmdbId === null) {
    return failure('--tmdb-id must be a positive integer.');
  }

  if (
    tmdbId !== null &&
    mode !== 'company' &&
    mode !== 'company-features' &&
    mode !== 'actor' &&
    mode !== 'director' &&
    mode !== 'genre'
  ) {
    return failure(
      '--tmdb-id can only be used with company, company-features, actor, director, or genre mode.',
    );
  }

  const fromValue = values.get('from');
  const fromYear = fromValue === undefined ? null : parseYear(fromValue);

  if (fromValue !== undefined && fromYear === null) {
    return failure('--from must be a valid four-digit year.');
  }

  const toValue = values.get('to');
  const toYear = toValue === undefined ? null : parseYear(toValue);

  if (toValue !== undefined && toYear === null) {
    return failure('--to must be a valid four-digit year.');
  }

  if (fromYear !== null && toYear !== null && fromYear > toYear) {
    return failure('--from cannot be later than --to.');
  }

  const sort = values.get('sort') ?? 'release-asc';

  if (!SUPPORTED_SORTS.has(sort)) {
    return failure('--sort must be release-asc, release-desc, or popularity.');
  }

  const minRuntimeValue = values.get('min-runtime');
  const minRuntime =
    minRuntimeValue === undefined ? null : parseNonNegativeInteger(minRuntimeValue);

  if (minRuntimeValue !== undefined && minRuntime === null) {
    return failure('--min-runtime must be a non-negative integer.');
  }

  if (mediaType === 'tv' && minRuntime !== null) {
    return failure('--min-runtime is currently only supported for movies.');
  }

  return {
    ok: true,
    request: {
      mediaType,
      mode,
      query,
      collectionId,
      limit,
      tmdbId,
      fromYear,
      toYear,
      sort,
      minRuntime,
      excludeDocumentaries: flags.has('exclude-documentaries'),
      includeAdult: flags.has('include-adult'),
      language: 'en-US',
    },
  };
}
