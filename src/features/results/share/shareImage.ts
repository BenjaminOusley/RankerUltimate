import { formatPersonalRating } from '@/features/ratings/personalRating';
import { formatPreferenceScore } from '../model/results';
import type {
  ResultsContentOptions,
  SharedResultItem,
  SharedResultsSnapshot,
} from './resultsShare';

export type ResultsImageOptions = ResultsContentOptions & {
  posters: boolean;
  layout: 'one' | 'two';
  theme: 'dark' | 'light';
  resolution: 'standard' | 'high' | 'ultra';
};

export const DEFAULT_RESULTS_IMAGE_OPTIONS: ResultsImageOptions = {
  posters: true,
  preferenceScores: true,
  personalRatings: true,
  summaryStats: false,
  distributions: false,
  layout: 'two',
  theme: 'dark',
  resolution: 'high',
};

const GAP = 14;
const MARGIN = 34;
const MAX_CANVAS_SIDE = 16_000;
const MAX_CANVAS_PIXELS = 44_000_000;
const RESOLUTION_SCALE = { standard: 1, high: 1.5, ultra: 2 } as const;

/** Physical pixel dimensions; scale is capped to keep very long rankings browser-safe. */
export function getResultsImageLayout(
  itemCount: number,
  options: Pick<ResultsImageOptions, 'layout' | 'resolution' | 'summaryStats'>,
) {
  const columns = itemCount > 180 ? 4 : itemCount > 90 ? 3 : options.layout === 'one' ? 1 : 2;
  const baseWidth = columns === 1 ? 930 : columns === 2 ? 1640 : columns === 3 ? 1820 : 1980;
  const rowHeight = columns >= 4 ? 88 : columns === 3 ? 104 : columns === 2 ? 126 : 108;
  const rows = Math.ceil(itemCount / columns);
  const baseHeight = 156 + rows * (rowHeight + GAP) + (options.summaryStats ? 43 : 0) + 36;
  const desiredScale = RESOLUTION_SCALE[options.resolution];
  const scale = Math.min(
    desiredScale,
    MAX_CANVAS_SIDE / baseWidth,
    MAX_CANVAS_SIDE / baseHeight,
    Math.sqrt(MAX_CANVAS_PIXELS / (baseWidth * baseHeight)),
  );
  return {
    width: Math.floor(baseWidth * scale),
    height: Math.floor(baseHeight * scale),
    baseWidth,
    baseHeight,
    columns,
    rowHeight,
    rows,
    scale,
    limited: scale < desiredScale - 0.01,
  };
}

function rounded(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function truncate(ctx: CanvasRenderingContext2D, text: string, width: number) {
  if (ctx.measureText(text).width <= width) return text;
  let result = text;
  while (result.length > 1 && ctx.measureText(`${result}…`).width > width)
    result = result.slice(0, -1);
  return `${result}…`;
}

async function loadPoster(source: string | undefined) {
  if (!source) return null;
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    let completed = false;
    const finish = (result: HTMLImageElement | null) => {
      if (completed) return;
      completed = true;
      window.clearTimeout(timeout);
      resolve(result);
    };
    const timeout = window.setTimeout(() => finish(null), 6000);
    image.crossOrigin = 'anonymous';
    image.onload = () => finish(image);
    image.onerror = () => finish(null);
    image.src = source;
  });
}

async function loadPosters(items: SharedResultItem[], enabled: boolean) {
  const images: Array<HTMLImageElement | null> = new Array(items.length).fill(null);
  if (!enabled) return images;
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(6, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        images[index] = await loadPoster(items[index]?.image);
      }
    }),
  );
  return images;
}

function poster(
  ctx: CanvasRenderingContext2D,
  item: SharedResultItem,
  image: HTMLImageElement | null,
  x: number,
  y: number,
  w: number,
  h: number,
  light: boolean,
) {
  ctx.save();
  rounded(ctx, x, y, w, h, 7);
  ctx.clip();
  if (image) {
    const target = w / h;
    const source = image.naturalWidth / image.naturalHeight;
    let sx = 0;
    let sy = 0;
    let sw = image.naturalWidth;
    let sh = image.naturalHeight;
    if (source > target) {
      sw = image.naturalHeight * target;
      sx = (image.naturalWidth - sw) / 2;
    } else {
      sh = image.naturalWidth / target;
      sy = (image.naturalHeight - sh) / 2;
    }
    ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
  } else {
    ctx.fillStyle = light ? '#d7ddec' : '#333b4e';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = light ? '#526078' : '#bac0d0';
    ctx.font = '700 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(item.name.slice(0, 1).toUpperCase(), x + w / 2, y + h / 2 + 7);
  }
  ctx.restore();
}

function drawPill(
  ctx: CanvasRenderingContext2D,
  center: number,
  y: number,
  label: string,
  personal: boolean,
  light: boolean,
  width: number,
) {
  const x = center - width / 2;
  rounded(ctx, x, y, width, 33, 17);
  ctx.fillStyle = personal
    ? light
      ? '#fff5d5'
      : 'rgba(242,201,76,0.1)'
    : light
      ? '#efe8ff'
      : 'rgba(123,66,246,0.18)';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = personal ? 'rgba(224,169,55,0.4)' : 'rgba(154,107,255,0.36)';
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = personal ? (light ? '#855c12' : '#f7d96e') : light ? '#5f35bb' : '#c8b3ff';
  ctx.font = '750 15px system-ui, sans-serif';
  ctx.fillText(label, center, y + 22);
}

function rankColor(index: number, length: number) {
  if (index === 0) return '#d7a51c';
  if (index === 1) return '#aeb7c6';
  if (index === 2) return '#b87845';
  if (index === length - 1) return '#d14b66';
  if (index === length - 2) return '#9f4d71';
  if (index === length - 3) return '#c1794b';
  return '#757e94';
}

/** Draws the same rank adornments and separate diamond/star score pills as the Results table. */
export async function createResultsShareImage(
  snapshot: SharedResultsSnapshot,
  options: ResultsImageOptions = DEFAULT_RESULTS_IMAGE_OPTIONS,
): Promise<Blob> {
  const d = getResultsImageLayout(snapshot.items.length, options);
  const canvas = document.createElement('canvas');
  canvas.width = d.width;
  canvas.height = d.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot create PNG results.');
  ctx.scale(d.scale, d.scale);
  const light = options.theme === 'light';
  const background = light ? '#f0f3fa' : '#090e19';
  const panel = light ? '#ffffff' : '#121928';
  const header = light ? '#e9ecf5' : '#111726';
  const outline = light ? '#d4d9e6' : '#293347';
  const primary = light ? '#172237' : '#f2f2f9';
  const muted = light ? '#647086' : '#a2aabd';

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, d.baseWidth, d.baseHeight);
  const glow = ctx.createRadialGradient(
    d.baseWidth - 150,
    20,
    15,
    d.baseWidth - 150,
    20,
    d.baseWidth * 0.8,
  );
  glow.addColorStop(0, light ? 'rgba(164,139,232,.12)' : 'rgba(104,58,201,.24)');
  glow.addColorStop(1, 'rgba(104,58,201,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, d.baseWidth, 250);

  ctx.textAlign = 'left';
  ctx.fillStyle = primary;
  ctx.font = '800 36px system-ui, sans-serif';
  ctx.fillText(truncate(ctx, snapshot.collection.name, d.baseWidth - 310), MARGIN, 61);
  ctx.fillStyle = muted;
  ctx.font = '500 17px system-ui, sans-serif';
  ctx.fillText(`${snapshot.items.length} items · ${snapshot.comparisons} comparisons`, MARGIN, 93);
  ctx.textAlign = 'right';
  ctx.font = '800 22px system-ui, sans-serif';
  ctx.fillStyle = light ? '#6c3ed4' : '#c2aaff';
  ctx.fillText('RankerUltimate', d.baseWidth - MARGIN, 59);

  const cardWidth = (d.baseWidth - MARGIN * 2 - GAP * (d.columns - 1)) / d.columns;
  const pillWidth = d.columns >= 3 ? 71 : 96;
  const pillGap = d.columns >= 3 ? 7 : 13;
  const scoreArea =
    (options.preferenceScores ? pillWidth : 0) +
    (options.personalRatings ? pillWidth : 0) +
    (options.preferenceScores && options.personalRatings ? pillGap : 0);
  const scoreStart = cardWidth - scoreArea - 14;
  const headerHeight = 28;
  const startY = 132;
  const posters = await loadPosters(snapshot.items, options.posters);

  snapshot.items.forEach((item, index) => {
    const col = Math.floor(index / d.rows); // column-major, matching reading order down each column
    const row = index % d.rows;
    const x = MARGIN + col * (cardWidth + GAP);
    const y = startY + headerHeight + row * (d.rowHeight + GAP);
    const rank = index + 1;
    const accent = rankColor(index, snapshot.items.length);
    rounded(ctx, x, y, cardWidth, d.rowHeight, 9);
    ctx.fillStyle = panel;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = outline;
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.fillRect(x, y + 7, 3, d.rowHeight - 14);

    const rankX = x + 12;
    ctx.textAlign = 'left';
    ctx.font = '800 20px system-ui, sans-serif';
    ctx.fillStyle = accent;
    const rankDecoration = index === 0 ? '♛' : index === 1 ? '◆' : index === 2 ? '●' : '';
    if (rankDecoration) {
      ctx.font = '800 18px system-ui, sans-serif';
      ctx.fillText(rankDecoration, rankX, y + d.rowHeight / 2 - 4);
    }
    ctx.font = '800 18px system-ui, sans-serif';
    ctx.fillText(String(rank), rankX, y + d.rowHeight / 2 + (rankDecoration ? 19 : 7));

    const posterH = d.rowHeight - 16;
    const posterW = Math.floor(posterH * 0.7);
    const posterX = x + (d.columns >= 3 ? 40 : 53);
    if (options.posters)
      poster(ctx, item, posters[index] ?? null, posterX, y + 8, posterW, posterH, light);
    const copyX = posterX + (options.posters ? posterW + 12 : 0);
    const copyW = Math.max(65, x + scoreStart - copyX - 8);
    ctx.textAlign = 'left';
    ctx.fillStyle = primary;
    ctx.font = `740 ${d.columns >= 3 ? 16 : 18}px system-ui, sans-serif`;
    ctx.fillText(
      truncate(ctx, item.name, copyW),
      copyX,
      y + d.rowHeight / 2 + (item.subtitle ? -1 : 7),
    );
    if (item.subtitle) {
      ctx.fillStyle = muted;
      ctx.font = '500 14px system-ui, sans-serif';
      ctx.fillText(truncate(ctx, item.subtitle, copyW), copyX, y + d.rowHeight / 2 + 23);
    }
    let pillCenter = x + scoreStart + pillWidth / 2;
    if (options.preferenceScores) {
      drawPill(
        ctx,
        pillCenter,
        y + (d.rowHeight - 33) / 2,
        `◆ ${formatPreferenceScore(item.preferenceScore)}`,
        false,
        light,
        pillWidth,
      );
      pillCenter += pillWidth + pillGap;
    }
    if (options.personalRatings) {
      const value = item.personalRating === null ? '—' : formatPersonalRating(item.personalRating);
      drawPill(ctx, pillCenter, y + (d.rowHeight - 33) / 2, `★ ${value}`, true, light, pillWidth);
    }
  });

  // Header labels are placed above each column, matching the actual ranking table.
  for (let col = 0; col < d.columns; col++) {
    const x = MARGIN + col * (cardWidth + GAP);
    rounded(ctx, x, startY, cardWidth, headerHeight, 5);
    ctx.fillStyle = header;
    ctx.fill();
    ctx.fillStyle = muted;
    ctx.font = '650 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('RANK  ·  ITEM', x + 14, startY + 19);
    let cx = x + scoreStart + pillWidth / 2;
    ctx.textAlign = 'center';
    if (options.preferenceScores) {
      ctx.fillText('Ranking Score', cx, startY + 19);
      cx += pillWidth + pillGap;
    }
    if (options.personalRatings) ctx.fillText('Personal Rating', cx, startY + 19);
  }

  const footer = startY + headerHeight + d.rows * (d.rowHeight + GAP) + 6;
  if (options.summaryStats) {
    ctx.textAlign = 'left';
    ctx.font = '500 15px system-ui, sans-serif';
    ctx.fillStyle = muted;
    const rated = snapshot.items.filter((item) => item.personalRating !== null).length;
    ctx.fillText(
      `${snapshot.items.length} items ranked  ·  ${snapshot.comparisons} comparisons  ·  ${rated} personally rated`,
      MARGIN,
      footer + 19,
    );
  }
  ctx.textAlign = 'right';
  ctx.font = '500 12px system-ui, sans-serif';
  ctx.fillStyle = muted;
  ctx.fillText('ranker-ultimate.vercel.app', d.baseWidth - MARGIN, d.baseHeight - 14);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG image encoding failed.'))),
      'image/png',
    );
  });
}
