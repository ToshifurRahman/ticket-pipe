import { Stub } from './stub';
import { brand } from '@/config/brand';

export function HomePage() {
  return (
    <Stub title={brand.name}>
      <p className="text-muted-foreground">{brand.tagline}</p>
    </Stub>
  );
}
