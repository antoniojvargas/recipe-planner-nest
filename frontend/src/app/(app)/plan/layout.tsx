import { QueryProvider } from '@/lib/query-client';

/**
 * El plan es interactivo (selector de receta, raciones y mutaciones optimistas), así que solo
 * este segmento monta TanStack Query en el cliente.
 */
export default function PlanLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <QueryProvider>{children}</QueryProvider>;
}
