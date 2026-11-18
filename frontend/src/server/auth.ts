import 'server-only';

import { redirect } from 'next/navigation';
import { unwrapApiResult } from '@/lib/api-result';
import { apiFetch } from './api';
import type { components } from './openapi';

/** Perfil público del usuario autenticado (`GET /api/auth/me`). */
export type CurrentUser = components['schemas']['AuthUser'];

/**
 * Usuario de la sesión para el render del servidor.
 *
 * La autoría de la lista de la compra se compara con este id para distinguir «lo marcaste
 * tú» de los cambios de los demás miembros.
 */
export async function requireCurrentUser(): Promise<CurrentUser> {
  const result = await apiFetch.GET('/api/auth/me');

  if (result.response.status === 401) {
    // La sesión ya no vale: el middleware no pudo renovarla y la API la rechaza.
    redirect('/login');
  }

  return unwrapApiResult<CurrentUser>(result, 'No se pudo cargar el perfil de la sesión');
}
