import type { ComponentPropsWithoutRef } from 'react';
import styles from './Scene.module.css';

type ElementProps<T extends 'section' | 'div'> = ComponentPropsWithoutRef<T>;

function joinClasses(base: string, extra = '') {
  return [base, extra].filter(Boolean).join(' ');
}

export function ScenePanel({ className = '', ...props }: ElementProps<'section'>) {
  return <section className={joinClasses(styles.panel, className)} {...props} />;
}

export function SceneHeading({ className = '', ...props }: ElementProps<'div'>) {
  return <div className={joinClasses(styles.heading, className)} {...props} />;
}

export function ScrollPanel({ className = '', ...props }: ElementProps<'div'>) {
  return <div className={joinClasses(styles.scroll, className)} {...props} />;
}
