import { cookies } from 'next/headers';
import { apiFetch } from '@/server/api';

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
