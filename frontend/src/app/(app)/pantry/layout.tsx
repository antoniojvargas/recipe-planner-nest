import { QueryProvider } from '@/lib/query-client';

/**
 * La despensa es interactiva (alta rápida, edición en línea y borrado optimista), así que solo
 * este segmento monta TanStack Query en el cliente.
 */
export default function PantryLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <QueryProvider>{children}</QueryProvider>;
}
