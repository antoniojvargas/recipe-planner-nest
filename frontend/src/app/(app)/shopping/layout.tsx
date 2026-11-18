import { QueryProvider } from '@/lib/query-client';

/**
 * La lista de la compra es interactiva (marcado optimista y, más adelante, eventos en vivo),
 * así que este segmento monta TanStack Query en el cliente.
 */
export default function ShoppingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <QueryProvider>{children}</QueryProvider>;
}
