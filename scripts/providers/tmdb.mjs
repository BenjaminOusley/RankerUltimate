const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

export function normalizeTitle(title) {
  return title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function getReleaseYear(movie) {
  return movie.release_date?.slice(0, 4) || undefined;
}

export function createItemId(title, tmdbId) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  return `${slug}-${tmdbId}`;
}

export function createRankItem(movie) {
  const releaseYear = getReleaseYear(movie);

  return {
    id: createItemId(movie.title, movie.id),
    name: movie.title,
    subtitle: releaseYear,
    image: movie.poster_path ? `${TMDB_IMAGE_BASE}${movie.poster_path}` : undefined,
    source: {
      provider: 'tmdb',
      id: String(movie.id),
      type: 'movie',
    },
  };
}

export function createTmdbProvider(token) {
  async function request(endpoint, searchParams = {}) {
    const url = new URL(`${TMDB_API_BASE}${endpoint}`);

    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`TMDB returned ${response.status} ${response.statusText} for ${endpoint}`);
    }

    return response.json();
  }

  async function searchMovie(title, year) {
    const data = await request('/search/movie', {
      query: title,
      language: 'en-US',
      include_adult: 'false',
      primary_release_year: year,
    });

    return data.results ?? [];
  }

  async function getMovieById(tmdbId) {
    return request(`/movie/${tmdbId}`, {
      language: 'en-US',
    });
  }

  async function searchCompany(name) {
    const data = await request('/search/company', {
      query: name,
      page: '1',
    });

    return data.results ?? [];
  }

  async function discoverMovies(filters, limit = 250) {
    const movies = [];

    let page = 1;
    let totalPages = 1;

    do {
      const data = await request('/discover/movie', {
        ...filters,
        page: String(page),
      });

      movies.push(...(data.results ?? []));

      if (movies.length >= limit) {
        break;
      }

      totalPages = Math.min(data.total_pages ?? 1, 500);
      page += 1;
    } while (page <= totalPages);

    return movies.slice(0, limit);
  }

  async function searchPerson(name) {
    const data = await request('/search/person', {
      query: name,
      include_adult: 'false',
      language: 'en-US',
      page: '1',
    });

    return data.results ?? [];
  }

  async function getMovieGenres() {
    const data = await request('/genre/movie/list', {
      language: 'en-US',
    });

    return data.genres ?? [];
  }

  async function getPersonById(personId) {
    return request(`/person/${personId}`, {
      language: 'en-US',
    });
  }

  async function getPersonMovieCredits(personId) {
    return request(`/person/${personId}/movie_credits`, {
      language: 'en-US',
    });
  }

  return {
    searchMovie,
    getMovieById,
    searchCompany,
    discoverMovies,
    searchPerson,
    getMovieGenres,
    getPersonById,
    getPersonMovieCredits,
  };
}
