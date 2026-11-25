import 'server-only';

import { redirect } from 'next/navigation';
import { unwrapApiResult } from '@/lib/api-result';
import { apiFetch } from './api';

/** Miembro del hogar tal como lo necesita la app para mostrar la autoría. */
export interface HouseholdMemberSummary {
  userId: string;
  displayName: string;
}

/** Hogar tal como lo necesita la app para elegir el contexto activo. */
export interface HouseholdSummary {
  id: string;
  name: string;
  /** Zona IANA del hogar: decide qué semana es "esta semana" en el plan y la compra. */
  timeZone: string;
  members: HouseholdMemberSummary[];
}

/**
 * Hogar activo de la app.
 *
 * Todavía no hay selector de hogar, así que se usa el primero al que pertenece la persona.
 * Cuando no hay ninguno se manda a crear uno: el plan no se puede pintar sin hogar.
 */
export async function requireHousehold(): Promise<HouseholdSummary> {
  const result = await apiFetch.GET('/api/households');

  if (result.response.status === 401) {
    // La sesión ya no vale: el middleware no pudo renovarla y la API la rechaza.
    redirect('/login');
  }

  const households = await unwrapApiResult<HouseholdSummary[]>(
    result,
    'No se pudieron cargar los hogares de la sesión',
  );

  if (households.length === 0) {
    redirect('/create-household');
  }

  // @ts-ignore
  return households[0];
}
