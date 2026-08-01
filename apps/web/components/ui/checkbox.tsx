import * as React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className, ...props }, ref) => {
    return (
      <label className="inline-flex cursor-pointer items-center gap-2">
        <input
          ref={ref}
          type="checkbox"
          className={cn(
            'h-4 w-4 rounded border-[var(--pm-line)] bg-[var(--pm-paper-inset)] text-[var(--pm-coral)] accent-[var(--pm-coral)] focus-visible:outline-none focus-visible:shadow-[var(--pm-focus)]',
            className
          )}
          {...props}
        />
        {label ? <span className="text-sm text-[var(--pm-ink)]">{label}</span> : null}
      </label>
    );
  }
);
Checkbox.displayName = 'Checkbox';
