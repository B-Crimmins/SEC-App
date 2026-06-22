import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/src/lib/utils';

const Checkbox = React.forwardRef(({ className, checked, defaultChecked, onCheckedChange, ...props }, ref) => {
  const [internal, setInternal] = React.useState(defaultChecked ?? false);
  const isControlled = checked !== undefined;
  const value = isControlled ? checked : internal;

  const toggle = () => {
    const next = !value;
    if (!isControlled) setInternal(next);
    onCheckedChange?.(next);
  };

  return (
    <button
      ref={ref}
      type="button"
      role="checkbox"
      aria-checked={value}
      onClick={toggle}
      className={cn(
        'peer h-4 w-4 shrink-0 rounded-sm border border-border bg-input ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 inline-flex items-center justify-center',
        value && 'bg-primary text-primary-foreground border-primary',
        className
      )}
      {...props}
    >
      {value && <Check className="h-3 w-3" strokeWidth={3} />}
    </button>
  );
});
Checkbox.displayName = 'Checkbox';

export { Checkbox };
