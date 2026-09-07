import process from 'node:process';

import { createHardcoverProvider } from '../providers/hardcover.mjs';
import { resolveCollectionRequestTurn } from '../resolution/collection-request-resolver.mjs';
import { planCollectionRequest } from '../resolution/collection-request-planner.mjs';

const token = process.env.HARDCOVER_API_TOKEN?.trim() || '';

if (!token) {
  throw new Error('HARDCOVER_API_TOKEN is missing from .env.');
}

const hardcover = createHardcoverProvider({
  token,
});

const TESTS = [
  {
    label: 'Brandon Sanderson — individual books',
    text: 'top 20 Brandon Sanderson individual books',
  },
  {
    label: 'Brandon Sanderson — book series',
    text: 'Brandon Sanderson book series',
  },
  {
    label: 'Stephen King — individual books',
    text: 'top 20 Stephen King individual books',
  },
  {
    label: 'Stephen King — book series',
    text: 'Stephen King book series',
  },
];

function summarizeAuthorSearchResult(author) {
  return {
    id: author?.id ?? null,
    name: author?.name ?? null,
    canonicalId: author?.canonical_id ?? null,
    booksCount: author?.books_count ?? null,
    usersCount: author?.users_count ?? null,
    slug: author?.slug ?? null,
  };
}

function summarizeSource(source) {
  return {
    provider: source?.provider ?? null,
    mode: source?.mode ?? null,
    resolvedId: source?.resolvedId ?? null,
    resolvedName: source?.resolvedName ?? null,
    parameters: source?.parameters ?? null,
  };
}

function summarizeContribution(contribution) {
  return {
    roleCategory: contribution?.contributor_role?.contributor_role_category_id ?? null,
    bookId: contribution?.book?.id ?? null,
    canonicalBookId: contribution?.book?.canonical_id ?? null,
    title: contribution?.book?.title ?? null,
    readers: contribution?.book?.users_read_count ?? null,
  };
}

async function inspectAuthorId(id) {
  const page = await hardcover.getAuthorContributionsPage({
    id,
    limit: 100,
    offset: 0,
  });

  const author = page?.author ?? null;
  const contributions = Array.isArray(page?.contributions) ? page.contributions : [];

  const authored = contributions.filter(
    (contribution) => contribution?.contributor_role?.contributor_role_category_id === 1,
  );

  return {
    requestedId: id,
    returnedAuthor: author
      ? {
          id: author.id ?? null,
          canonicalId: author.canonical_id ?? null,
          name: author.name ?? null,
          booksCount: author.books_count ?? null,
          usersCount: author.users_count ?? null,
          canonical: author.canonical
            ? {
                id: author.canonical.id ?? null,
                name: author.canonical.name ?? null,
                booksCount: author.canonical.books_count ?? null,
                usersCount: author.canonical.users_count ?? null,
              }
            : null,
        }
      : null,
    contributionRows: contributions.length,
    authorshipRows: authored.length,
    topAuthoredBooks: authored.slice(0, 20).map(summarizeContribution),
  };
}

async function main() {
  console.log('RankerUltimate book-provider spike #10');
  console.log('======================================');

  for (const name of ['Brandon Sanderson', 'Stephen King']) {
    console.log(`\nAUTHOR SEARCH: ${name}`);
    console.log('------------------------------');

    const matches = await hardcover.searchAuthors(name, 15);

    console.table(matches.map(summarizeAuthorSearchResult));
  }

  const inspectedIds = new Set();

  for (const test of TESTS) {
    console.log(`\nFLOW: ${test.label}`);
    console.log('------------------------------');

    const resolution = resolveCollectionRequestTurn({
      text: test.text,
    });

    console.log('Resolution:');
    console.dir(resolution, { depth: null });

    if (!resolution.ok) {
      continue;
    }

    const planned = await planCollectionRequest({
      request: resolution.result,
      hardcover,
    });

    console.log('Plan:');
    console.dir(planned, { depth: null });

    const sources =
      planned?.status === 'planned' && Array.isArray(planned?.plan?.sources)
        ? planned.plan.sources
        : [];

    if (sources.length > 0) {
      console.table(sources.map(summarizeSource));
    }

    for (const source of sources) {
      if (
        source?.provider === 'hardcover' &&
        (source?.mode === 'author' || source?.mode === 'author-series') &&
        Number.isSafeInteger(Number(source?.resolvedId))
      ) {
        inspectedIds.add(Number(source.resolvedId));
      }
    }
  }

  for (const id of inspectedIds) {
    console.log(`\nAUTHOR CONTRIBUTIONS FOR RESOLVED ID ${id}`);
    console.log('------------------------------------------');

    const inspection = await inspectAuthorId(id);

    console.dir(inspection, {
      depth: null,
    });

    const canonicalId = Number(inspection.returnedAuthor?.canonical?.id);

    if (Number.isSafeInteger(canonicalId) && canonicalId > 0 && canonicalId !== id) {
      console.log(`\nCANONICAL AUTHOR CONTRIBUTIONS FOR ${id} -> ${canonicalId}`);
      console.log('------------------------------------------');

      console.dir(await inspectAuthorId(canonicalId), {
        depth: null,
      });
    }
  }
}

await main();
