'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const API_BASE = '/api/auth';

export async function loginAction(
  prevState: {
    status: 'idle' | 'pending' | 'success' | 'error';
    email: string;
    fieldErrors: Record<string, string>;
  },
  formData: FormData,
) {
  const email = formData.get('email') as string | null;

  // Llamada a la API con reenvío de cookies
  const response = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
    // Next reenvía las cookies httpOnly automáticamente en servidor→servidor,
    // pero como esta es una acción del servidor, necesitamos manualmente si el
    // backend las devuelve en Set-Cookie. Usamos credentials: 'include' para
    // que el navegador envíe las cookies automáticamente.
    credentials: 'include',
  });

  const data = await response.json();

  if (!response.ok) {
    // Preservamos el email y devolvemos errores de campo
    return {
      status: 'error',
      email: email || '',
      fieldErrors: data.error?.details || { email: data.error?.message || 'Credenciales inválidas' },
    };
  }

    // Login exitoso: las cookies nuevas vienen en Set-Cookie, las leemos y las
    // escribimos en la respuesta para que el navegador las guarde.
    const cookieStore = await cookies();

    // Copiar cookies de sesión de la respuesta
    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader) {
      // Next.js cookies().set espera un array o string de Set-Cookie
      const cookiesArray = Array.isArray(setCookieHeader)
        ? setCookieHeader
        : [setCookieHeader];

      for (const cookie of cookiesArray) {
        cookieStore.set(cookie.split(';')[0].split('=')[0], cookie.split('=').slice(1).join('='));
      }
    }

    // Redirigir a la home o al dashboard
    redirect('/');
  }

export async function registerAction(
  prevState: {
    status: 'idle' | 'pending' | 'success' | 'error';
    name: string;
    email: string;
    fieldErrors: Record<string, string>;
  },
  formData: FormData,
) {
  const name = formData.get('name') as string | null;
  const email = formData.get('email') as string | null;

  const response = await fetch(`${API_BASE}/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, email }),
    credentials: 'include',
  });

  const data = await response.json();

  if (!response.ok) {
    return {
      status: 'error',
      name: name || '',
      email: email || '',
      fieldErrors: data.error?.details || { name: data.error?.message || 'Error de registro', email: data.error?.message || 'Error de registro' },
    };
  }

  // Registro exitoso: copiar cookies
  const cookieStore = await cookies();
  const setCookieHeader = response.headers.get('set-cookie');
  if (setCookieHeader) {
    const cookiesArray = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : [setCookieHeader];

    for (const cookie of cookiesArray) {
      cookieStore.set(cookie.split(';')[0].split('=')[0], cookie.split('=').slice(1).join('='));
    }
  }

  redirect('/');
}