import { describe, expect, it } from 'vitest';

import type { RankCollection, RankItem } from '@/domain/models';
import {
  getPickerCategory,
  getPickerCollectionGroupId,
  getPickerSearchText,
} from './collectionPickerModel';

function makeItem(provider: string, type: string, id: string): RankItem {
  return { id, name: id, source: { provider, type, id } };
}

function custom(items: RankItem[], groupId: RankCollection['groupId'] = 'various'): RankCollection {
  return {
    id: 'custom:test',
    name: 'Test',
    items,
    groupId,
    candidateSource: { kind: 'custom' },
  };
}

describe('collection picker categories and search', () => {
  it('recognizes a custom Pixar film collection from item sources', () => {
    const collection = custom([
      makeItem('tmdb', 'movie', 'up'),
      makeItem('tmdb', 'movie', 'toy-story'),
      makeItem('tmdb', 'movie', 'coco'),
      makeItem('tmdb', 'movie', 'soul'),
      makeItem('tmdb', 'movie', 'wall-e'),
    ]);

    expect(getPickerCollectionGroupId(collection)).toBe('movies-tv');
    expect(getPickerCategory(getPickerCollectionGroupId(collection))).toBe('movies-tv');
    expect(getPickerSearchText(collection)).toContain('movies & tv');
  });

  it('groups movie/TV combinations together and keeps unrelated mixes in Other', () => {
    const moviesAndTv = custom([
      makeItem('tmdb', 'movie', 'a'),
      makeItem('tmdb', 'tv', 'b'),
    ]);
    const mixed = custom([
      makeItem('tmdb', 'movie', 'a'),
      makeItem('igdb', 'game', 'b'),
    ]);

    expect(getPickerCollectionGroupId(moviesAndTv)).toBe('movies-tv');
    expect(getPickerCollectionGroupId(mixed)).toBe('various');
    expect(getPickerCategory(getPickerCollectionGroupId(mixed))).toBe('other');
    expect(getPickerSearchText(mixed)).toContain('other');
    expect(getPickerSearchText(mixed)).toContain('various');
  });

  it('recognizes games and books without inspecting collection titles', () => {
    expect(getPickerCollectionGroupId(custom([makeItem('igdb', 'game', 'a')]))).toBe('games');
    expect(getPickerCollectionGroupId(custom([makeItem('hardcover', 'book', 'a')]))).toBe('books');
    expect(getPickerCollectionGroupId(custom([makeItem('stephenking.com', 'book', 'a')]))).toBe('books');
  });

  it('does not guess when items are unknown or absent', () => {
    expect(getPickerCollectionGroupId(custom([]))).toBe('various');
    expect(getPickerCollectionGroupId(custom([{ id: 'local', name: 'Local' }]))).toBe('various');
    expect(getPickerCollectionGroupId(custom([
      makeItem('tmdb', 'movie', 'a'),
      { id: 'local', name: 'Local' },
    ]))).toBe('various');
  });

  it('respects an explicitly assigned non-Various category', () => {
    expect(getPickerCollectionGroupId(custom([
      makeItem('tmdb', 'movie', 'a'),
    ], 'books'))).toBe('books');
  });

  it('searches by group and by the Other filter label', () => {
    const other = custom([makeItem('tmdb', 'movie', 'a'), makeItem('igdb', 'game', 'b')]);
    expect(getPickerSearchText(other)).toContain('other');
    expect(getPickerSearchText(other)).toContain('various');
    expect(getPickerSearchText({ ...other, description: 'Movie night' })).toContain('movie night');
  });
});
