import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/shared/components/Button/Button';
import { Modal } from '@/shared/components/Modal/Modal';
import {
  DEFAULT_RESULTS_CONTENT_OPTIONS,
  copyText,
  createItemsCsv,
  createJsonExport,
  createRankedFilename,
  createShareText,
  createSharedResultsLink,
  downloadBlob,
  downloadTextFile,
  type ResultsContentOptions,
  type SharedResultsSnapshot,
} from '../../share/resultsShare';
import {
  createResultsShareImage,
  DEFAULT_RESULTS_IMAGE_OPTIONS,
  getResultsImageLayout,
  type ResultsImageOptions,
} from '../../share/shareImage';
import { SharedLinkPreview } from './SharedLinkPreview';
import styles from './ResultsShareExportModal.module.css';

type Format = 'image' | 'text' | 'csv' | 'json' | 'link';
type Props = {
  open: boolean;
  snapshot: SharedResultsSnapshot;
  onClose: () => void;
};

const FORMATS: Array<{ id: Format; title: string; sub: string; icon: string }> = [
  { id: 'image', title: 'Image (PNG)', sub: 'Full ranking as an image', icon: '▧' },
  { id: 'text', title: 'Text (.txt)', sub: 'Readable and copyable list', icon: '≡' },
  { id: 'csv', title: 'CSV (.csv)', sub: 'Ranked items for spreadsheets', icon: '▤' },
  { id: 'json', title: 'JSON (.json)', sub: 'Clean results data', icon: '{ }' },
  { id: 'link', title: 'Share Link', sub: 'Public read-only ranking', icon: '↗' },
];

function contentOptions(
  mode: Format,
  options: ResultsContentOptions,
  toggle: (key: keyof ResultsContentOptions) => void,
) {
  const fields: Array<[keyof ResultsContentOptions, string]> = [
    ['preferenceScores', 'Ranking scores'],
    ['personalRatings', 'Personal ratings'],
  ];
  if (mode === 'text') {
    fields.push(['summaryStats', 'Summary statistics'], ['distributions', 'Distributions']);
  } else if (mode === 'image') {
    fields.push(['summaryStats', 'Summary statistics']);
  }
  return (
    <div className={styles.optionList}>
      <p className={styles.fixedNote}>
        {
          (
            {
              image:
                'Create a styled PNG of your ranked results, with optional posters and score columns.',
              text: 'Copy or download a readable, selectable text ranking with optional summary details.',
              csv: 'Download the ranked items in spreadsheet-ready columns.',
              json: 'Download your ranked results as structured JSON data.',
              link: 'Create a permanent, read-only snapshot of the ranking.',
            } as Record<Format, string>
          )[mode]
        }
      </p>
      {fields.map(([key, label]) => (
        <label
          className={styles.toggleRow}
          key={key}
        >
          <input
            type="checkbox"
            checked={options[key]}
            onChange={() => toggle(key)}
          />
          <span>{label}</span>
        </label>
      ))}
    </div>
  );
}

/** An async result is kept with its options key so an old render is never shown as current. */
type ImagePreview = { key: string; url: string; blob: Blob };

export function ResultsShareExportModal({ open, snapshot, onClose }: Props) {
  const [format, setFormat] = useState<Format>('image');
  const [options, setOptions] = useState<ResultsContentOptions>(DEFAULT_RESULTS_CONTENT_OPTIONS);
  const [imageOptions, setImageOptions] = useState<ResultsImageOptions>(
    DEFAULT_RESULTS_IMAGE_OPTIONS,
  );
  const [preview, setPreview] = useState<ImagePreview | null>(null);
  const [imageError, setImageError] = useState('');
  const [status, setStatus] = useState('');
  const [working, setWorking] = useState(false);
  const [sharedLink, setSharedLink] = useState('');

  // Image and other formats share the scores/ratings toggles; image alone has poster/layout/theme controls.
  const chosenImageOptions = useMemo<ResultsImageOptions>(
    () => ({ ...imageOptions, ...options, distributions: false }),
    [imageOptions, options],
  );
  const imageKey = JSON.stringify({ snapshot, chosenImageOptions });
  const currentImage = preview?.key === imageKey ? preview : null;
  const imageSize = getResultsImageLayout(snapshot.items.length, chosenImageOptions);
  const plainText = useMemo(() => createShareText(snapshot, options), [snapshot, options]);
  const csv = useMemo(() => createItemsCsv(snapshot, options), [snapshot, options]);
  const json = useMemo(() => createJsonExport(snapshot, options), [snapshot, options]);

  useEffect(() => {
    if (!open || format !== 'image') return;
    let canceled = false;
    void createResultsShareImage(snapshot, chosenImageOptions)
      .then((blob) => {
        if (canceled) return;
        const url = URL.createObjectURL(blob);
        setPreview({ key: imageKey, blob, url });
        setImageError('');
      })
      .catch((error: unknown) => {
        if (!canceled)
          setImageError(error instanceof Error ? error.message : 'Could not prepare the image.');
      });
    return () => {
      canceled = true;
    };
  }, [open, format, imageKey, snapshot, chosenImageOptions]);

  // Blob URLs are revoked on close / replacement, without invalidating an open PNG tab.
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview.url);
  }, [preview]);

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !working) onClose();
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [open, working, onClose]);

  function toggle(key: keyof ResultsContentOptions) {
    setOptions((current) => ({ ...current, [key]: !current[key] }));
  }

  function openImageInNewTab() {
    if (!currentImage) return;
    // Give the new tab its own Blob URL. Changing modal options or closing the modal
    // must not revoke the displayed image immediately.
    const independentUrl = URL.createObjectURL(currentImage.blob);
    const link = document.createElement('a');
    link.href = independentUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(independentUrl), 30 * 60 * 1000);
  }

  async function copyImage() {
    if (!currentImage) return;
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
        throw new Error(
          'Your browser does not support PNG clipboard copying. Use Download PNG instead.',
        );
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': currentImage.blob })]);
      setStatus('PNG copied to clipboard. Paste into your image editor.');
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : 'Could not copy PNG; use Download PNG instead.',
      );
    }
  }

  async function copyTextResult(text: string, label: string) {
    try {
      await copyText(text);
      setStatus(`${label} copied to clipboard.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `Could not copy ${label.toLowerCase()}.`);
    }
  }

  async function createLink() {
    setWorking(true);
    setStatus('Creating public snapshot…');
    try {
      const link = sharedLink || (await createSharedResultsLink(snapshot));
      setSharedLink(link);
      setStatus('Public read-only link created.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not create the shared link.');
    } finally {
      setWorking(false);
    }
  }

  function download(formatToDownload: 'image' | 'text' | 'csv' | 'json') {
    if (formatToDownload === 'image') {
      if (currentImage)
        downloadBlob(createRankedFilename(snapshot.collection.name, 'png'), currentImage.blob);
    } else if (formatToDownload === 'text') {
      downloadTextFile(
        createRankedFilename(snapshot.collection.name, 'txt'),
        plainText,
        'text/plain;charset=utf-8',
      );
    } else if (formatToDownload === 'csv') {
      downloadTextFile(
        createRankedFilename(snapshot.collection.name, 'csv'),
        `\uFEFF${csv}`,
        'text/csv;charset=utf-8',
      );
    } else {
      downloadTextFile(
        createRankedFilename(snapshot.collection.name, 'json'),
        json,
        'application/json;charset=utf-8',
      );
    }
    setStatus('File downloaded.');
  }

  return (
    <Modal
      open={open}
      className={styles.modal}
      aria-labelledby="results-share-export-title"
    >
      <header className={styles.header}>
        <div>
          <h2 id="results-share-export-title">Share / Export Results</h2>
          <p>
            {snapshot.collection.name} · {snapshot.items.length} items
          </p>
        </div>
        <button
          type="button"
          className={styles.close}
          disabled={working}
          aria-label="Close Share / Export Results"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className={styles.body}>
        <nav
          className={styles.formats}
          aria-label="Output format"
        >
          <h3>Format</h3>
          {FORMATS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.formatButton} ${format === item.id ? styles.formatActive : ''}`}
              aria-pressed={format === item.id}
              onClick={() => {
                setFormat(item.id);
                setStatus('');
              }}
            >
              <span className={styles.formatIcon}>{item.icon}</span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.sub}</small>
              </span>
            </button>
          ))}
        </nav>

        <main className={styles.previewColumn}>
          <div className={styles.previewTitle}>
            <h3>
              {format === 'image'
                ? 'Image preview'
                : format === 'text'
                  ? 'Text preview'
                  : format === 'csv'
                    ? 'CSV preview'
                    : format === 'json'
                      ? 'JSON preview'
                      : 'Share a public link'}
            </h3>
            <span>
              {format === 'image'
                ? 'Actual generated PNG'
                : format === 'csv'
                  ? `First ${Math.min(8, snapshot.items.length)} of ${snapshot.items.length} results`
                  : format === 'json'
                    ? 'Exact export (scroll to inspect)'
                    : format === 'text'
                      ? 'Selectable complete text'
                      : 'Read-only snapshot'}
            </span>
          </div>
          <div
            className={`${styles.previewSurface} ${format === 'image' ? styles.pngPreview : ''}`}
          >
            {format === 'image' &&
              (currentImage ? (
                <img
                  src={currentImage.url}
                  alt={`PNG preview of all ${snapshot.items.length} ranked results`}
                  className={styles.renderedPng}
                />
              ) : (
                <div className={styles.waiting}>
                  {imageError || 'Rendering your full ranking image…'}
                </div>
              ))}
            {format === 'text' && <pre className={styles.textPreview}>{plainText}</pre>}
            {format === 'csv' && (
              <div className={styles.csvScroll}>
                <table className={styles.csvTable}>
                  <thead>
                    <tr>
                      {csv
                        .split('\r\n')[0]
                        ?.split(',')
                        .map((value, index) => (
                          <th key={index}>{value.replace(/^"|"$/g, '')}</th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.items.slice(0, 8).map((item, index) => (
                      <tr key={item.id}>
                        <td>{index + 1}</td>
                        <td>{item.name}</td>
                        <td>{item.subtitle ?? ''}</td>
                        {options.preferenceScores && <td>{item.preferenceScore.toFixed(1)}</td>}
                        {options.personalRatings && <td>{item.personalRating ?? ''}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className={styles.tableHint}>
                  The downloaded CSV contains all {snapshot.items.length} ranked items.
                </p>
              </div>
            )}
            {format === 'json' && <pre className={styles.codePreview}>{json}</pre>}
            {format === 'link' && <SharedLinkPreview snapshot={snapshot} />}
          </div>
        </main>

        <aside className={styles.optionsColumn}>
          <h3>
            {format === 'image'
              ? 'Image options'
              : format === 'link'
                ? 'Link details'
                : 'Content options'}
          </h3>
          {format !== 'link' && contentOptions(format, options, toggle)}
          {format === 'image' && (
            <>
              <label className={styles.toggleRow}>
                <input
                  type="checkbox"
                  checked={imageOptions.posters}
                  onChange={() =>
                    setImageOptions((value) => ({ ...value, posters: !value.posters }))
                  }
                />
                <span>Include posters</span>
              </label>
              <label
                className={styles.selectLabel}
                htmlFor="results-image-layout"
              >
                Layout
              </label>
              <select
                id="results-image-layout"
                value={imageOptions.layout}
                onChange={(event) =>
                  setImageOptions((current) => ({
                    ...current,
                    layout: event.target.value as 'one' | 'two',
                  }))
                }
              >
                <option value="two">Two columns</option>
                <option value="one">One column</option>
              </select>
              {snapshot.items.length > 90 && (
                <p className={styles.fixedNote}>
                  Very large rankings use more columns to keep the PNG compatible with browsers.
                </p>
              )}
              <label
                className={styles.selectLabel}
                htmlFor="results-image-theme"
              >
                Theme
              </label>
              <select
                id="results-image-theme"
                value={imageOptions.theme}
                onChange={(event) =>
                  setImageOptions((current) => ({
                    ...current,
                    theme: event.target.value as 'dark' | 'light',
                  }))
                }
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
              <label
                className={styles.selectLabel}
                htmlFor="results-image-resolution"
              >
                Image resolution
              </label>
              <select
                id="results-image-resolution"
                value={imageOptions.resolution}
                onChange={(event) =>
                  setImageOptions((current) => ({
                    ...current,
                    resolution: event.target.value as ResultsImageOptions['resolution'],
                  }))
                }
              >
                <option value="standard">Standard (1×)</option>
                <option value="high">High (1.5×)</option>
                <option value="ultra">Ultra (2×)</option>
              </select>
              <p className={styles.hint}>
                PNG dimensions: {imageSize.width} × {imageSize.height} px.
                {imageSize.limited
                  ? ' Resolution automatically capped for this large ranking to keep it browser-compatible.'
                  : ' PNG is lossless.'}
              </p>
            </>
          )}
          {format === 'link' && (
            <p className={styles.fixedNote}>
              Anyone with this link can view your results and personal ratings, but cannot change
              your ranking.
            </p>
          )}
        </aside>
      </div>
      <footer className={`${styles.footer} ${format === 'link' ? styles.linkFooter : ''}`}>
        <div className={styles.footerInfo}>
          {format === 'link' && (
            <input
              className={styles.footerLink}
              readOnly
              aria-label="Public shared results URL"
              placeholder="Create a link to see its address"
              value={sharedLink}
              onFocus={(e) => e.currentTarget.select()}
            />
          )}
          <span
            className={styles.status}
            role="status"
            aria-live="polite"
          >
            {status}
          </span>
        </div>
        <div className={styles.actionButtons}>
          {format === 'image' && (
            <>
              <Button
                disabled={!currentImage}
                onClick={openImageInNewTab}
              >
                Open in New Tab
              </Button>
              <Button
                disabled={!currentImage}
                onClick={() => void copyImage()}
              >
                Copy PNG
              </Button>
              <Button
                variant="primary"
                disabled={!currentImage}
                onClick={() => download('image')}
              >
                Download PNG
              </Button>
            </>
          )}
          {format === 'text' && (
            <>
              <Button onClick={() => void copyTextResult(plainText, 'Text')}>Copy Text</Button>
              <Button
                variant="primary"
                onClick={() => download('text')}
              >
                Download .txt
              </Button>
            </>
          )}
          {format === 'csv' && (
            <Button
              variant="primary"
              onClick={() => download('csv')}
            >
              Download CSV
            </Button>
          )}
          {format === 'json' && (
            <Button
              variant="primary"
              onClick={() => download('json')}
            >
              Download JSON
            </Button>
          )}
          {format === 'link' && (
            <>
              <Button
                variant="primary"
                disabled={working || Boolean(sharedLink)}
                onClick={() => void createLink()}
              >
                {working ? 'Creating…' : sharedLink ? 'Link Created' : 'Create Link'}
              </Button>
              <Button
                disabled={!sharedLink}
                onClick={() => void copyTextResult(sharedLink, 'Link')}
              >
                Copy Link
              </Button>
              <Button
                disabled={!sharedLink}
                onClick={() => window.open(sharedLink, '_blank', 'noopener,noreferrer')}
              >
                Open Link
              </Button>
            </>
          )}
          <Button
            onClick={onClose}
            disabled={working}
          >
            Close
          </Button>
        </div>
      </footer>
    </Modal>
  );
}
