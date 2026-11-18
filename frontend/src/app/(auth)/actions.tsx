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

  const response = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
    credentials: 'include',
  });

  const data = await response.json();

  if (!response.ok) {
    return {
      status: 'error',
      email: email || '',
      fieldErrors: data.error?.details || {
        email: data.error?.message || 'Credenciales inválidas',
      },
    };
  }

  const cookieStore = await cookies();
  const setCookieHeader = response.headers.get('set-cookie');
  if (setCookieHeader) {
    const cookiesArray = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];

    for (const cookie of cookiesArray) {
      cookieStore.set(cookie.split(';')[0].split('=')[0], cookie.split('=').slice(1).join('='));
    }
  }

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
      fieldErrors: data.error?.details || {
        name: data.error?.message || 'Error de registro',
        email: data.error?.message || 'Error de registro',
      },
    };
  }

  const cookieStore = await cookies();
  const setCookieHeader = response.headers.get('set-cookie');
  if (setCookieHeader) {
    const cookiesArray = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];

    for (const cookie of cookiesArray) {
      cookieStore.set(cookie.split(';')[0].split('=')[0], cookie.split('=').slice(1).join('='));
    }
  }

  redirect('/');
}

export async function logoutAction(
  prevState: {
    status: 'idle' | 'pending' | 'success' | 'error';
  },
  formData: FormData,
) {
  const response = await fetch(`${API_BASE}/logout`, {
    method: 'POST',
    credentials: 'include',
  });

  const data = await response.json();

  if (!response.ok) {
    return {
      status: 'error',
      message: data.error?.message || 'Error al cerrar sesión',
    };
  }

  // Cerrar sesión: borrar las cookies de sesión
  const cookieStore = await cookies();
  cookieStore.set('access_token', '', { path: '/', maxAge: 0 });
  cookieStore.set('refresh_token', '', { path: '/', maxAge: 0 });
  cookieStore.set('csrf_token', '', { path: '/', maxAge: 0 });

  redirect('/auth/login');
}

export async function logoutAllAction(
  prevState: {
    status: 'idle' | 'pending' | 'success' | 'error';
  },
  formData: FormData,
) {
  const response = await fetch(`${API_BASE}/logout-all`, {
    method: 'POST',
    credentials: 'include',
  });

  const data = await response.json();

  if (!response.ok) {
    return {
      status: 'error',
      message: data.error?.message || 'Error al cerrar todas las sesiones',
    };
  }

  // Cerrar todas las sesiones: borrar las cookies de sesión
  const cookieStore = await cookies();
  cookieStore.set('access_token', '', { path: '/', maxAge: 0 });
  cookieStore.set('refresh_token', '', { path: '/', maxAge: 0 });
  cookieStore.set('csrf_token', '', { path: '/', maxAge: 0 });

  redirect('/auth/login');
}
