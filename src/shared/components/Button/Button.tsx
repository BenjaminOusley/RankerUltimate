import type { ComponentPropsWithoutRef } from 'react';
import styles from './Button.module.css';

type ButtonVariant = 'default' | 'primary' | 'danger' | 'quiet';
type ButtonSize = 'default' | 'small';

type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = 'default',
  size = 'default',
  className = '',
  type,
  ...props
}: ButtonProps) {
  const classes = [
    styles.button,
    variant === 'primary' ? styles.primary : '',
    variant === 'danger' ? styles.danger : '',
    variant === 'quiet' ? styles.quiet : '',
    size === 'small' ? styles.small : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className={classes}
      type={type ?? 'button'}
      {...props}
    />
  );
}
