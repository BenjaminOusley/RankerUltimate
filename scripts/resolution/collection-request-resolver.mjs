const SUPPORTED_MEDIA_TYPES = ['movie', 'tv', 'game', 'book'];

const MEDIA_PATTERNS = [
  {
    mediaType: 'movie',
    patterns: [
      /\bmovies?\b/giu,
      /\bfilms?\b/giu,
      /\bfeature films?\b/giu,
    ],
  },
  {
    mediaType: 'tv',
    patterns: [
      /\btv\s+shows?\b/giu,
      /\btelevision\s+shows?\b/giu,
      /\btelevision\b/giu,
      /\btv\b/giu,
      /\bshows?\b/giu,
    ],
  },
  {
    mediaType: 'game',
    patterns: [
      /\bvideo\s+games?\b/giu,
      /\bgames?\b/giu,
    ],
  },
  {
    mediaType: 'book',
    patterns: [/\bbooks?\b/giu],
  },
];

const GAME_CONTENT_SCOPE_PATTERN = /\b(?:dlcs?|expansions?|seasons?)\b/iu;

const LEADING_FILLER_PATTERN = new RegExp(
  String.raw`^(?:please\s+)?(?:i\s+(?:want|would\s+like|wanna)\s+(?:to\s+)?(?:rank\s+)?|rank\s+|give\s+me\s+|make\s+(?:me\s+)?(?:a\s+)?(?:collection\s+(?:of\s+)?)?|create\s+(?:me\s+)?(?:a\s+)?(?:collection\s+(?:of\s+)?)?)+`,
  'iu',
);

function normalizeWhitespace(value) {
  return value.replace(/\s+/gu, ' ').trim();
}

const RELATION_ONLY_PATTERN = /^(?:the\s+)?(?:genre|subject|mood|franchise|series|platform|console|company|developer|publisher|studio|director|actor|actress|author)$/iu;

function isRelationOnlyClarification(value) {
  return RELATION_ONLY_PATTERN.test(normalizeWhitespace(value));
}

function isRepeatedSubjectRelationClarification(value, previousSubject) {
  const normalizedValue = normalizeWhitespace(value);
  const normalizedSubject = normalizeWhitespace(previousSubject);

  if (normalizedValue.length <= normalizedSubject.length) {
    return false;
  }

  if (normalizedValue.slice(0, normalizedSubject.length).toLowerCase() !== normalizedSubject.toLowerCase()) {
    return false;
  }

  const remainder = normalizedValue.slice(normalizedSubject.length).trim();
  return isRelationOnlyClarification(remainder);
}

function isBookTargetOnlyClarification(value) {
  return /^(?:individual|single|series|trilogy)$/iu.test(normalizeWhitespace(value));
}

function uniqueMediaTypes(mediaTypes) {
  return SUPPORTED_MEDIA_TYPES.filter((mediaType) => mediaTypes.includes(mediaType));
}

export function detectCollectionRequestMediaTypes(text) {
  const detected = [];

  for (const descriptor of MEDIA_PATTERNS) {
    if (descriptor.patterns.some((pattern) => pattern.test(text))) {
      detected.push(descriptor.mediaType);
    }

    for (const pattern of descriptor.patterns) {
      pattern.lastIndex = 0;
    }
  }

  if (detected.length === 0 && GAME_CONTENT_SCOPE_PATTERN.test(text)) {
    detected.push('game');
  }

  return uniqueMediaTypes(detected);
}

export function extractCollectionRequestSubject(text) {
  let subject = normalizeWhitespace(text);

  subject = subject.replace(LEADING_FILLER_PATTERN, '');

  for (const descriptor of MEDIA_PATTERNS) {
    for (const pattern of descriptor.patterns) {
      subject = subject.replace(pattern, ' ');
      pattern.lastIndex = 0;
    }
  }

  subject = subject
    .replace(/\bfrom\b/giu, ' ')
    .replace(/\b(?:collection|list)\b/giu, ' ')
    .replace(/^\s*(?:and|or)\b|\b(?:and|or)\s*$/giu, ' ')
    .replace(/^[\s,;:/&+\-]+|[\s,;:/&+\-]+$/gu, '');

  return normalizeWhitespace(subject);
}

function mediaLabel(mediaTypes) {
  const labels = mediaTypes.map((mediaType) => {
    if (mediaType === 'movie') {
      return 'movies';
    }

    if (mediaType === 'tv') {
      return 'TV shows';
    }

    if (mediaType === 'game') {
      return 'games';
    }

    return 'books';
  });

  if (labels.length === 1) {
    return labels[0];
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`;
}

function subjectClarification(mediaTypes) {
  if (mediaTypes.length === 1 && mediaTypes[0] === 'game') {
    return {
      question:
        'Which games do you want to rank? You can answer however you want - for example, shooters, a specific game series, games from a platform or company, or the most popular games.',
      examples: ['shooters', 'Halo games', 'PlayStation 2 games', 'Nintendo games'],
    };
  }

  if (mediaTypes.length === 1 && mediaTypes[0] === 'movie') {
    return {
      question:
        'Which movies do you want to rank? For example, horror movies, Pixar movies, Christopher Nolan movies, or movies starring Ryan Gosling.',
      examples: [
        'horror movies',
        'Pixar movies',
        'Christopher Nolan movies',
        'Ryan Gosling movies',
      ],
    };
  }

  if (mediaTypes.length === 1 && mediaTypes[0] === 'tv') {
    return {
      question:
        'Which TV shows do you want to rank? For example, drama shows, shows from a studio, or shows starring a particular actor.',
      examples: ['drama shows', 'HBO shows', 'Bryan Cranston shows'],
    };
  }

  if (mediaTypes.length === 1 && mediaTypes[0] === 'book') {
    return {
      question:
        'Which books do you want to rank? For example, a book series, books by an author, or popular individual books or series from a genre or subject.',
      examples: ['Dune books', 'Stephen King books', 'fantasy books', 'drama books'],
    };
  }

  return {
    question: `What ${mediaLabel(mediaTypes)} do you want to rank? Give me the subject, franchise, genre, company, person, platform, or other constraint you have in mind.`,
    examples: ['Star Wars', 'horror', 'Halo', 'Nintendo'],
  };
}

function mediaClarification(subject) {
  const subjectPhrase = subject ? ` from "${subject}"` : '';

  return {
    question: `What kind of things do you want to rank${subjectPhrase}? For example: movies, TV shows, games, books, or a combination.`,
    examples: ['movies', 'TV shows', 'games', 'books', 'movies and TV shows'],
  };
}

function normalizeContext(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      subject: null,
      mediaTypes: [],
    };
  }

  const subject =
    typeof value.subject === 'string' && value.subject.trim()
      ? normalizeWhitespace(value.subject)
      : null;

  const mediaTypes = Array.isArray(value.mediaTypes)
    ? uniqueMediaTypes(
        value.mediaTypes.filter((mediaType) => SUPPORTED_MEDIA_TYPES.includes(mediaType)),
      )
    : [];

  return {
    subject,
    mediaTypes,
  };
}

export function resolveCollectionRequestTurn({ text, context = null }) {
  if (typeof text !== 'string' || text.trim().length < 1 || text.trim().length > 500) {
    return {
      ok: false,
      error: 'Collection request must contain between 1 and 500 characters.',
    };
  }

  const normalizedText = normalizeWhitespace(text);
  const previousContext = normalizeContext(context);
  const detectedMediaTypes = detectCollectionRequestMediaTypes(normalizedText);
  const extractedSubject = extractCollectionRequestSubject(normalizedText);

  const mediaTypes =
    detectedMediaTypes.length > 0 ? detectedMediaTypes : previousContext.mediaTypes;

  let subject = extractedSubject || previousContext.subject;
  let requestText = normalizedText;

  if (previousContext.subject) {
    const relationOnly = extractedSubject && isRelationOnlyClarification(extractedSubject);
    const repeatedSubjectRelation =
      extractedSubject &&
      isRepeatedSubjectRelationClarification(extractedSubject, previousContext.subject);
    const bookTargetOnly =
      mediaTypes.length === 1 &&
      mediaTypes[0] === 'book' &&
      extractedSubject &&
      isBookTargetOnlyClarification(extractedSubject);

    if (!extractedSubject && detectedMediaTypes.length > 0) {
      // A media-only clarification such as "books" keeps the prior subject and
      // rebuilds the full request text so the planner still sees both pieces.
      subject = previousContext.subject;
      requestText = `${previousContext.subject} ${normalizedText}`;
    } else if (relationOnly || repeatedSubjectRelation || bookTargetOnly) {
      // Planner clarifications such as "series", "individual books", "the
      // company", or "franchise" describe the relationship of the existing
      // subject rather than replacing it. Clarification buttons can repeat the
      // subject (for example, "Peter Jackson director"), so keep the canonical
      // subject while preserving the user's full wording for the planner.
      subject = previousContext.subject;
      requestText = repeatedSubjectRelation
        ? normalizedText
        : `${previousContext.subject} ${normalizedText}`;
    } else if (
      extractedSubject &&
      detectedMediaTypes.length === 0 &&
      previousContext.mediaTypes.length > 0
    ) {
      // When the user is answering a "which <media>?" question, their new
      // answer is the useful subject/constraint and should replace the earlier
      // broad wording.
      subject = extractedSubject;
    }
  }

  const nextContext = {
    subject: subject ?? null,
    mediaTypes,
  };

  if (mediaTypes.length === 0) {
    const clarification = mediaClarification(subject);

    return {
      ok: true,
      result: {
        status: 'clarification',
        ...clarification,
        context: nextContext,
      },
    };
  }

  if (
    previousContext.subject &&
    previousContext.mediaTypes.length === 0 &&
    detectedMediaTypes.length === 1 &&
    detectedMediaTypes[0] === 'book' &&
    !extractedSubject
  ) {
    return {
      ok: true,
      result: {
        status: 'clarification',
        reason: 'ambiguous-book-target',
        question: `Do you want individual ${previousContext.subject} books, or ${previousContext.subject} book series?`,
        examples: [
          `${previousContext.subject} individual books`,
          `${previousContext.subject} book series`,
        ],
        context: nextContext,
      },
    };
  }

  if (!subject) {
    const clarification = subjectClarification(mediaTypes);

    return {
      ok: true,
      result: {
        status: 'clarification',
        ...clarification,
        context: nextContext,
      },
    };
  }

  return {
    ok: true,
    result: {
      status: 'ready-for-planning',
      requestText,
      subject,
      mediaTypes,
      context: nextContext,
    },
  };
}
