import { describe, expect, it } from 'vitest';

import {
  detectCollectionRequestMediaTypes,
  extractCollectionRequestSubject,
  resolveCollectionRequestTurn,
} from './collection-request-resolver.mjs';

describe('collection request resolver foundation', () => {
  it('detects one or multiple supported media types', () => {
    expect(detectCollectionRequestMediaTypes('MCU movies')).toEqual(['movie']);
    expect(detectCollectionRequestMediaTypes('MCU movies and TV shows')).toEqual([
      'movie',
      'tv',
    ]);
    expect(detectCollectionRequestMediaTypes('Halo video games')).toEqual(['game']);
  });

  it('extracts the subject independently of media wording', () => {
    expect(extractCollectionRequestSubject('MCU movies')).toBe('MCU');
    expect(extractCollectionRequestSubject('movies and TV shows from Star Wars')).toBe(
      'Star Wars',
    );
    expect(extractCollectionRequestSubject('I want to rank Halo games')).toBe('Halo');
  });

  it('asks for a media clarification when the subject is known but media is not', () => {
    const resolution = resolveCollectionRequestTurn({ text: 'MCU' });

    expect(resolution.ok).toBe(true);
    expect(resolution.result.status).toBe('clarification');
    expect(resolution.result.context).toEqual({
      subject: 'MCU',
      mediaTypes: [],
    });
    expect(resolution.result.question).toContain('movies, TV shows, games');
  });

  it('keeps the original subject when the user clarifies media in a later turn', () => {
    const first = resolveCollectionRequestTurn({ text: 'MCU' });
    const second = resolveCollectionRequestTurn({
      text: 'movies and TV shows',
      context: first.result.context,
    });

    expect(second).toEqual({
      ok: true,
      result: {
        status: 'ready-for-planning',
        requestText: 'movies and TV shows',
        subject: 'MCU',
        mediaTypes: ['movie', 'tv'],
        context: {
          subject: 'MCU',
          mediaTypes: ['movie', 'tv'],
        },
      },
    });
  });

  it('asks for a subject when the request is only a broad media category', () => {
    const resolution = resolveCollectionRequestTurn({ text: 'games' });

    expect(resolution.ok).toBe(true);
    expect(resolution.result.status).toBe('clarification');
    expect(resolution.result.context).toEqual({
      subject: null,
      mediaTypes: ['game'],
    });
    expect(resolution.result.question).toContain('Which games');
  });

  it('uses a free-form clarification answer as the subject', () => {
    const first = resolveCollectionRequestTurn({ text: 'games' });
    const second = resolveCollectionRequestTurn({
      text: 'the most popular shooters',
      context: first.result.context,
    });

    expect(second.ok).toBe(true);
    expect(second.result.status).toBe('ready-for-planning');
    expect(second.result.subject).toBe('the most popular shooters');
    expect(second.result.mediaTypes).toEqual(['game']);
  });

  it('resolves a sufficiently constrained one-turn request without clarification', () => {
    const resolution = resolveCollectionRequestTurn({ text: 'Halo games' });

    expect(resolution).toEqual({
      ok: true,
      result: {
        status: 'ready-for-planning',
        requestText: 'Halo games',
        subject: 'Halo',
        mediaTypes: ['game'],
        context: {
          subject: 'Halo',
          mediaTypes: ['game'],
        },
      },
    });
  });

  it('rejects empty or excessively long turns', () => {
    expect(resolveCollectionRequestTurn({ text: '   ' })).toEqual({
      ok: false,
      error: 'Collection request must contain between 1 and 500 characters.',
    });

    expect(resolveCollectionRequestTurn({ text: 'x'.repeat(501) }).ok).toBe(false);
  });
});
