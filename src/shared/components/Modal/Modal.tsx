import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import styles from './Modal.module.css';

type ModalProps = Omit<ComponentPropsWithoutRef<'section'>, 'children'> & {
  children: ReactNode;
  open?: boolean;
};

export function Modal({ open = true, className = '', children, ...props }: ModalProps) {
  if (!open) {
    return null;
  }

  const classes = [styles.card, className].filter(Boolean).join(' ');

  return (
    <div
      className={styles.backdrop}
      role="presentation"
    >
      <section
        className={classes}
        role="dialog"
        aria-modal="true"
        {...props}
      >
        {children}
      </section>
    </div>
  );
}
