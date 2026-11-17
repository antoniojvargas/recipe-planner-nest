import { QueryProvider } from '@/lib/query-client';

/**
 * Solo las rutas interactivas montan TanStack Query. El layout raíz y el resto de la app
 * siguen siendo server-only y no cargan el cliente de datos en el bundle.
 *
 * La lista de la compra es el caso canónico: estado compartido en vivo, mutaciones optimistas
 * y eventos de Socket.IO sobre la misma caché.
 */
export default function ShoppingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <QueryProvider>{children}</QueryProvider>;
}
