import type { Unit } from '@recipe-planner/contracts';

/**
 * Tipos y utilidades de la lista de la compra.
 *
 * La API no tiene un `GET` de la lista: abrir la semana la regenera desde el plan y la
 * despensa (`POST …/generate`), conservando los ítems manuales y lo ya marcado. El cuerpo que
 * devuelve ese endpoint es el que modelan estos tipos.
 */

export type ShoppingItemSource = 'plan' | 'manual';

export interface ShoppingItem {
  _id: string;
  name: string;
  quantity: number;
  unit: Unit;
  checked: boolean;
  /** Usuario que marcó el ítem; la API lo devuelve como id. */
  checkedBy?: string | null;
  /** Nombre de quien marcó, tal como venía en el evento en vivo. */
  checkedByName?: string | null;
  source: ShoppingItemSource;
}

export interface ShoppingListResponse {
  _id?: string;
  householdId: string;
  weekStart: string;
  items: ShoppingItem[];
  version: number;
}

export type AisleId =
  | 'produce'
  | 'butcher'
  | 'dairy'
  | 'bakery'
  | 'pantry'
  | 'frozen'
  | 'drinks'
  | 'household'
  | 'other';

export interface Aisle {
  id: AisleId;
  label: string;
  keywords: readonly string[];
}

/**
 * Pasillos en el orden en que se recorre una tienda. Las palabras clave van sin acentos y en
 * minúsculas: el nombre del ítem se normaliza antes de comparar.
 *
 * La categoría no se guarda: es una heurística de presentación derivada del nombre. Si cambia
 * el diccionario, la lista se reagrupa sin migrar datos.
 */
export const AISLES: readonly Aisle[] = [
  {
    id: 'produce',
    label: 'Frutería y verduras',
    keywords: [
      'fruta',
      'verdura',
      'tomate',
      'cebolla',
      'ajo',
      'patata',
      'lechuga',
      'zanahoria',
      'limon',
      'manzana',
      'platano',
      'pimiento',
      'calabacin',
      'berenjena',
      'brocoli',
      'espinaca',
      'champinon',
      'seta',
      'aguacate',
      'pepino',
      'puerro',
      'apio',
      'perejil',
      'cilantro',
      'albahaca',
      'naranja',
      'pera',
      'fresa',
      'uva',
    ],
  },
  {
    id: 'butcher',
    label: 'Carnicería y pescadería',
    keywords: [
      'pollo',
      'pavo',
      'carne',
      'ternera',
      'cerdo',
      'cordero',
      'chorizo',
      'jamon',
      'bacon',
      'salchicha',
      'pescado',
      'salmon',
      'atun',
      'merluza',
      'gamba',
      'langostino',
      'marisco',
      'calamar',
    ],
  },
  {
    id: 'dairy',
    label: 'Lácteos y huevos',
    keywords: ['leche', 'queso', 'yogur', 'mantequilla', 'nata', 'huevo', 'kefir', 'requeson'],
  },
  {
    id: 'bakery',
    label: 'Panadería',
    keywords: ['pan', 'harina', 'masa', 'baguette', 'bollo', 'tortilla', 'levadura'],
  },
  {
    id: 'pantry',
    label: 'Despensa',
    keywords: [
      'arroz',
      'pasta',
      'espagueti',
      'macarron',
      'aceite',
      'vinagre',
      'sal',
      'azucar',
      'lenteja',
      'garbanzo',
      'judia',
      'alubia',
      'conserva',
      'tomate frito',
      'caldo',
      'especia',
      'pimienta',
      'oregano',
      'comino',
      'canela',
      'miel',
      'mermelada',
      'cafe',
      'te',
      'cacao',
      'chocolate',
      'avena',
      'cereal',
      'nuez',
      'almendra',
      'aceituna',
    ],
  },
  {
    id: 'frozen',
    label: 'Congelados',
    keywords: ['congelado', 'helado', 'pizza', 'croqueta', 'verduras congeladas'],
  },
  {
    id: 'drinks',
    label: 'Bebidas',
    keywords: ['agua', 'zumo', 'refresco', 'cerveza', 'vino', 'sidra', 'bebida'],
  },
  {
    id: 'household',
    label: 'Limpieza y hogar',
    keywords: [
      'limpieza',
      'detergente',
      'jabon',
      'papel',
      'servilleta',
      'basura',
      'fregasuelos',
      'lavavajillas',
      'suavizante',
      'estropajo',
    ],
  },
  {
    id: 'other',
    label: 'Otros',
    keywords: [],
  },
];

const UNIT_LABELS: Record<Unit, string> = {
  g: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
  tsp: 'cdta',
  tbsp: 'cda',
  cup: 'taza',
  unit: 'ud',
  pinch: 'pizca',
};

const ACCENTS = /[\u0300-\u036f]/gu;

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(ACCENTS, '').trim();
}

/**
 * Pasillo de un ítem a partir de su nombre.
 *
 * Gana la palabra clave más específica (la más larga), no el primer pasillo de la tabla: así
 * «tomate frito» cae en despensa aunque «tomate» sea de frutería.
 */
export function aisleForItem(name: string): AisleId {
  const normalized = normalize(name);
  let best: { id: AisleId; length: number } | null = null;

  for (const aisle of AISLES) {
    for (const keyword of aisle.keywords) {
      if (normalized.includes(keyword) && (best === null || keyword.length > best.length)) {
        best = { id: aisle.id, length: keyword.length };
      }
    }
  }

  return best?.id ?? 'other';
}

export interface AisleGroup {
  id: AisleId;
  label: string;
  items: ShoppingItem[];
}

/** Agrupa por pasillo en el orden de la tienda y ordena alfabéticamente dentro de cada uno. */
export function groupByAisle(items: readonly ShoppingItem[]): AisleGroup[] {
  const byAisle = new Map<AisleId, ShoppingItem[]>();

  for (const item of items) {
    const aisle = aisleForItem(item.name);
    const group = byAisle.get(aisle);

    if (group === undefined) {
      byAisle.set(aisle, [item]);
    } else {
      group.push(item);
    }
  }

  return AISLES.flatMap((aisle) => {
    const group = byAisle.get(aisle.id);

    if (group === undefined) {
      return [];
    }

    return [
      {
        id: aisle.id,
        label: aisle.label,
        items: [...group].sort((left, right) => left.name.localeCompare(right.name, 'es')),
      },
    ];
  });
}

/** Cantidad legible: `1,5 kg`, `3 ud`, `2 cda`. */
export function formatQuantity(quantity: number, unit: Unit): string {
  const amount = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(quantity);

  return `${amount} ${UNIT_LABELS[unit]}`;
}

export type MemberNames = Readonly<Record<string, string>>;

/**
 * Nombre visible de quien marcó el ítem.
 *
 * Los ítems cargados de la API solo traen el id; el nombre sale del mapa de miembros. Los
 * eventos en vivo traen el nombre en la carga útil, que sirve de respaldo si el miembro ya no
 * está en el hogar. Devuelve `null` cuando no hay forma de saberlo y la interfaz lo omite.
 */
export function checkerName(item: ShoppingItem, memberNames: MemberNames): string | null {
  if (!item.checked) {
    return null;
  }

  const userId = item.checkedBy ?? undefined;
  const knownName = userId === undefined ? undefined : memberNames[userId];
  const eventName = item.checkedByName ?? undefined;

  if (knownName !== undefined && knownName !== '') {
    return knownName;
  }

  return eventName !== undefined && eventName !== '' ? eventName : null;
}
