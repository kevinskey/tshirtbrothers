import { type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const colorVariants = {
  default: 'bg-brand-gray-100 text-brand-gray-800',
  red: 'bg-red-light text-red-dark',
  green: 'bg-green-50 text-green-700',
  amber: 'bg-amber-50 text-amber-700',
  blue: 'bg-blue-50 text-blue-700',
} as const;

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  color?: keyof typeof colorVariants;
}

function Badge({ className, color = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        colorVariants[color],
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
