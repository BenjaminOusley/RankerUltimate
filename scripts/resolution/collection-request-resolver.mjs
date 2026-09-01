const SUPPORTED_MEDIA_TYPES = ['movie', 'tv', 'game'];

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
];

const LEADING_FILLER_PATTERN = new RegExp(
  String.raw`^(?:please\s+)?(?:i\s+(?:want|would\s+like|wanna)\s+(?:to\s+)?(?:rank\s+)?|rank\s+|give\s+me\s+|make\s+(?:me\s+)?(?:a\s+)?(?:collection\s+(?:of\s+)?)?|create\s+(?:me\s+)?(?:a\s+)?(?:collection\s+(?:of\s+)?)?)+`,
  'iu',
);

function normalizeWhitespace(value) {
  return value.replace(/\s+/gu, ' ').trim();
}

const RELATION_ONLY_PATTERN = /^(?:the\s+)?(?:genre|franchise|series|platform|console|company|developer|publisher|studio|director|actor|actress)$/iu;

function isRelationOnlyClarification(value) {
  return RELATION_ONLY_PATTERN.test(normalizeWhitespace(value));
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

    return 'games';
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
        'Which games do you want to rank? You can answer however you want — for example, shooters, a specific game series, games from a platform or company, or the most popular games.',
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

  return {
    question: `What ${mediaLabel(mediaTypes)} do you want to rank? Give me the subject, franchise, genre, company, person, platform, or other constraint you have in mind.`,
    examples: ['Star Wars', 'horror', 'Halo', 'Nintendo'],
  };
}

function mediaClarification(subject) {
  const subjectPhrase = subject ? ` from “${subject}”` : '';

  return {
    question: `What kind of things do you want to rank${subjectPhrase}? For example: movies, TV shows, games, or a combination.`,
    examples: ['movies', 'TV shows', 'games', 'movies and TV shows'],
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

  if (
    extractedSubject &&
    previousContext.subject &&
    detectedMediaTypes.length === 0 &&
    previousContext.mediaTypes.length > 0
  ) {
    if (isRelationOnlyClarification(extractedSubject)) {
      // Planner clarifications such as "the company" or "franchise" describe
      // the relationship of the existing subject rather than replacing it.
      subject = previousContext.subject;
      requestText = `${previousContext.subject} ${normalizedText}`;
    } else {
      // When the user is answering a "which <media>?" question, their new answer is the
      // useful subject/constraint and should replace the earlier broad wording.
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
