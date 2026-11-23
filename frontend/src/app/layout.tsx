import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { apiFetch } from '@/server/api';

// Un título por defecto para todas las rutas: sin él, los lectores de pantalla y el
// historial del navegador no pueden distinguir unas páginas de otras (axe: document-title).
export const metadata: Metadata = {
  title: {
    default: 'Recipe Planner',
    template: '%s · Recipe Planner',
  },
  description: 'Planifica las comidas y comparte recetas con tu hogar.',
};

export function generateStaticParams() {
  // Los parámetros se generan dinámicamente; no hay parámetros estáticos.
  return [];
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Comprobar sesión en el servidor: leer la cookie access_token y validarla.
  const cookieStore = await cookies();
  const accessToken = cookieStore.get('access_token')?.value;

  if (!accessToken) {
    // Si no hay token, continuamos sin usuario; las rutas interactivas
    // decidirán si redirigen a login.
  } else {
    try {
      await apiFetch.GET('/api/auth/me');
    } catch {
      // Si el token es inválido, limpiamos las cookies.
      cookieStore.delete('access_token');
      cookieStore.delete('refresh_token');
      cookieStore.delete('csrf_token');
    }
  }

  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
