import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { formatPersonalRating } from '../../personalRating';
import { RATING_VALUES } from './ratingOptions';
import { calculateRatingMenuPosition } from './ratingPlacement';
import styles from './RatingPicker.module.css';

const OPTIONS: readonly (number | null)[] = [...RATING_VALUES, null];
type Position = { top: number; left: number; width: number; maxHeight: number };

function getPosition(button: HTMLButtonElement): Position {
  return calculateRatingMenuPosition(button.getBoundingClientRect(), {
    width: window.innerWidth, height: window.innerHeight,
  });
}

export function RatingPicker({ value, onChange, label, disabled = false }: {
  value: number | null;
  onChange: (value: number | null) => void;
  label: string;
  disabled?: boolean;
}) {
  const [position, setPosition] = useState<Position | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = value === null ? 0 : Math.max(0, OPTIONS.indexOf(value));

  function close() {
    setPosition(null);
    buttonRef.current?.focus();
  }

  function open() {
    if (buttonRef.current) setPosition(getPosition(buttonRef.current));
  }

  useEffect(() => {
    if (position) optionRefs.current[selectedIndex]?.focus();
  }, [position, selectedIndex]);

  useEffect(() => {
    if (!position) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node &&
          !menuRef.current?.contains(event.target) &&
          !buttonRef.current?.contains(event.target)) setPosition(null);
    };
    const reposition = (event: Event) => {
      // A scroll *inside* this menu must not reset its scroll position or focus.
      if (event.type === 'scroll' && event.target instanceof Node && menuRef.current?.contains(event.target)) return;
      if (buttonRef.current) setPosition(getPosition(buttonRef.current));
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [position]);

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = optionRefs.current.findIndex((node) => node === document.activeElement);
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? OPTIONS.length - 1 :
        (current + (event.key === 'ArrowDown' ? 1 : -1) + OPTIONS.length) % OPTIONS.length;
      optionRefs.current[next]?.focus();
    }
  }

  return <>
    <button ref={buttonRef} type="button" className={styles.trigger} disabled={disabled}
      aria-haspopup="listbox" aria-expanded={Boolean(position)} aria-label={label}
      onClick={() => position ? close() : open()}>
      <span>{value === null ? '—' : `★ ${formatPersonalRating(value)}`}</span>
      <svg className={styles.chevron} viewBox="0 0 16 16" aria-hidden="true"><path d="m3 6 5 5 5-5" /></svg>
    </button>
    {position && createPortal(
      <div ref={menuRef} className={styles.popover} role="listbox" aria-label={label}
        style={{ position: 'fixed', top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}
        onKeyDown={onMenuKeyDown}>
        {OPTIONS.map((option, index) => <button key={option ?? 'clear'} type="button" role="option"
          aria-selected={option === value} ref={(node) => { optionRefs.current[index] = node; }}
          className={`${styles.option} ${option === value ? styles.selected : ''} ${option === null ? styles.clearOption : ''}`}
          onClick={() => { onChange(option); close(); }}>
          {option === null ? 'No rating' : `★ ${formatPersonalRating(option)}`}
        </button>)}
      </div>, document.body,
    )}
  </>;
}
