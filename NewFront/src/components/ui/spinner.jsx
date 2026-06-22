import { Loader2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';

const sizes = { xs: 'h-3 w-3', sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-6 w-6', xl: 'h-8 w-8' };

export function Spinner({ size = 'md', className }) {
  return <Loader2 className={cn('animate-spin text-muted-foreground', sizes[size], className)} />;
}
