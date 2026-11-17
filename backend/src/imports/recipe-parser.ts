import { isUnit, UNITS_LIST, type Unit } from '@recipe-planner/contracts';

/** Fracciones simples que el parser reconoce. */
const FRACTION_VALUES: Record<string, number> = {
  '1/2': 0.5,
  '1/3': 1 / 3,
  '2/3': 2 / 3,
  '1/4': 0.25,
  '3/4': 0.75,
  '1/8': 0.125,
};

/** Mapa de referencias simbólicas a unidades del catálogo. */
const SYMBOLIC_UNITS: Record<string, Unit> = {
  'pizca': 'pinch',
  'dash': 'pinch',
  'cd': 'tbsp',
  'cda': 'tbsp',
  'cucharadita': 'tsp',
  'cucharada': 'tbsp',
  'taza': 'cup',
  'tazas': 'cup',
  'vaso': 'cup',
  'vasos': 'cup',
};

/** Convierte un string a número, manejando fracciones y decimales. */
function parseNumber(value: string): number {
  const trimmed = value.trim();

  // Caso: "1 1/2" → 1.5
  const fractionMatch = /^(\d+)\s+(\d+\/\d+)$/.exec(trimmed);
  if (fractionMatch) {
    const whole = parseInt(fractionMatch[1], 10);
    const [num, den] = fractionMatch[2].split('/').map(Number);
    return whole + num / den;
  }

  // Caso: "1/2" → 0.5
  const simpleFraction = /^(\d+)\/(\d+)$/.exec(trimmed);
  if (simpleFraction) {
    return parseInt(simpleFraction[1], 10) / parseInt(simpleFraction[2], 10);
  }

  // Caso: decimal puro
  const decimal = parseFloat(trimmed);
  if (!isNaN(decimal)) {
    return decimal;
  }

  // Retorno por defecto
  return 1;
}

/** Normaliza una unidad: símbolos → catálogo, minúsculas, trim. */
function normalizeUnit(raw: string): { unit: Unit; original: string; note?: string } {
  const trimmed = raw.trim().toLowerCase();

  // 1. Símbolos del catálogo (g, kg, ml, l, tsp, tbsp, cup, unit, pinch)
  if ((UNITS_LIST as readonly string[]).includes(trimmed)) {
    return { unit: trimmed as Unit, original: raw };
  }

  // 2. Símbolos alternativos o abreviaturas
  const symbolMap: Record<string, Unit> = {
    'g': 'g',
    'kg': 'kg',
    'ml': 'ml',
    'l': 'l',
    'tsp': 'tsp',
    'tbsp': 'tbsp',
    'cup': 'cup',
    'units': 'unit',
    'pin': 'pinch',
    'pinch': 'pinch',
  };
  if (trimmed in symbolMap) {
    return { unit: symbolMap[trimmed], original: raw };
  }

  // 3. Unidades simbólicas mapeadas (pizca, taza, etc.)
  if (trimmed in SYMBOLIC_UNITS) {
    return { unit: SYMBOLIC_UNITS[trimmed], original: raw };
  }

  // 4. Si no coincide con nada del catálogo, devolver el original y poner note
  return { unit: 'unit', original: raw, note: `Unidad no reconocida: "${raw}"` };
}

/** Escape de expresiones regulares para usar en replace. */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&');
}

/** Parsea una string de ingrediente con soporte de fracciones y unidades del catálogo. */
export interface ParsedIngredient {
  /** Cantidad numérica (ya aplicado el parseo de fracciones). */
  quantity: number;
  /** Unidad del catálogo (siempre está en el catálogo UNITS_LIST). */
  unit: Unit;
  /** Nombre del ingrediente. */
  name: string;
  /** Texto original de la unidad, si no se reconoció totalmente. */
  note?: string;
}

/** Parsea una string de ingrediente como "400 g de arroz" o "1 1/2 tazas de harina". */
export function parseIngredient(text: string): ParsedIngredient {
  if (!text || typeof text !== 'string') {
    return { quantity: 0, unit: 'unit', name: '' };
  }

  const trimmed = text.trim();
  if (trimmed === '') {
    return { quantity: 0, unit: 'unit', name: '' };
  }

  // --- Caso A: "<cantidad> <unidad> <nombre>" ---
  // Ejemplos: "400 g de arroz", "1/2 cucharadita de sal", "200 ml de leche",
  // "1 1/2 tazas de harina"
  // La unidad puede ser un símbolo (g, kg, ml, l, tsp, tbsp, cup, unit, pinch)
  // o un nombre completo (tazas, cucharadita, cucharada, pizca, vaso)
  // Opcional: la palabra "de" entre la unidad y el nombre.

  // Patrón para separar la cantidad del resto:
  // - "1" (entero)
  // - "1/2" (fracción simple)
  // - "1 1/2" (número mixto con espacio)
  let quantityMatch;
  // Primero intentamos el número mixto "1 1/2"
  const mixedMatch = /^(\d+\s+\d+\/\d+)/.exec(trimmed);
  if (mixedMatch) {
    quantityMatch = mixedMatch;
  } else {
    // Luego intentamos la fracción simple "1/2"
    const simpleMatch = /^(\d+\/\d+)/.exec(trimmed);
    if (simpleMatch) {
      quantityMatch = simpleMatch;
    } else {
      // Finalmente, el entero "1"
      quantityMatch = /^(\d+)/.exec(trimmed);
    }
  }

  if (quantityMatch) {
    const rawQuantity = quantityMatch[1];
    const remaining = trimmed.slice(rawQuantity.length).trim();
    // Ahora en 'remaining' tenemos lo que sigue: "g de arroz", "tazas de harina", etc.
    // Patrón para desglosar: cantidad unidad [de] nombre
    const caseAPattern = /^(\S+)\s+(de)?\s*(.+)$/i;
    const caseAMatch = caseAPattern.exec(remaining);

    if (caseAMatch) {
      const unitCandidate = caseAMatch[1].trim();   // la posible unidad
      const hasDe = caseAMatch[2] !== undefined;
      const name = caseAMatch[3].trim();          // el nombre después de "de" o directo

      // Parsear la cantidad (puede ser "1", "1/2", "1 1/2")
      const quantity = parseNumber(rawQuantity);

      // Identificar la unidad del "unitCandidate"
      let unit: Unit = 'unit';
      let unitNote: string | undefined;

      // 1. ¿Es un símbolo del catálogo exacto?
      const candidateLower = unitCandidate.toLowerCase();
      if ((UNITS_LIST as readonly string[]).includes(candidateLower)) {
        unit = candidateLower as Unit;
        unitNote = undefined;
      }
      // 2. ¿Es un nombre simbólico (pizca, taza, etc.)?
      else if (candidateLower in SYMBOLIC_UNITS) {
        unit = SYMBOLIC_UNITS[candidateLower];
        unitNote = undefined;
      }
      // 3. ¿normalizeUnit puede identificar la unidad?
      else {
        const normalized = normalizeUnit(candidateLower);
        unit = normalized.unit;
        unitNote = normalized.note ? `Unidad no reconocida: "${unitCandidate}"` : undefined;
      }

      // Si la unidad sigue siendo "unit" y hay un note de "no reconocida",
      // intentar quitando el texto del note del candidate y volver a intentar
      if (unit === 'unit' && unitNote) {
        const unitText = unitNote.replace('Unidad no reconocida: "', '').replace('"', '');
        const cleanedCandidate = unitCandidate.replace(new RegExp(escapeRegExp(unitText), 'i'), '').trim();
        if (cleanedCandidate) {
          const normalized2 = normalizeUnit(cleanedCandidate.toLowerCase());
          unit = normalized2.unit;
          unitNote = normalized2.note ? `Unidad no reconocida: "${cleanedCandidate}"` : undefined;
        }
      }

      // Si la unit sigue siendo "unit" y no hay note, el name capturado es el ingrediente
      // Si hay "de", el name ya es lo que venía después de "de"
      // Si no hay "de", el name es lo que viene después de la unidad

      return { quantity, unit, name, note: unitNote };
    }
  }

  // --- Caso B: "<cantidad> <nombre>" sin unidad explícita ---
  // Ejemplos: "harina sin unidades", "2 tazas" (si tazas va seguida de nada más)
  const caseBMatch = /^(\d+(?:\s+\d+\/\d+)?)\s+(.+)$/.exec(trimmed);

  if (caseBMatch) {
    const rawQuantity = caseBMatch[1];
    const name = caseBMatch[2].trim();
    const quantity = parseNumber(rawQuantity);

    // Intentar detectar si el nombre contiene una unidad reconocida al final
    // Revisamos las últimas palabras en busca de una unidad
    const words = name.split(' ');
    let detectedUnit: Unit = 'unit';
    let noteFromUnit: string | undefined;

    // Revisar desde la última palabra hacia atrás
    for (let i = words.length - 1; i >= 0; i--) {
      const { unit: u, note: n } = normalizeUnit(words[i].toLowerCase());
      if (u && u !== 'unit') {
        detectedUnit = u;
        noteFromUnit = n;
        // Quitar esa palabra y las de después del nombre
        const newName = words.slice(0, i).join(' ').trim();
        return {
          quantity,
          unit: detectedUnit,
          name: newName || name,
          note: noteFromUnit || undefined,
        };
      }
    }

    // Si no se encontró unidad al final, devolver tal como está
    return {
      quantity,
      unit: detectedUnit,
      name,
      note: noteFromUnit || undefined,
    };
  }

  // Fallback: texto sin número reconocible
  const { unit, note: noteFromUnit } = normalizeUnit(trimmed);

  return {
    quantity: unit === 'unit' ? 1 : 0,
    unit,
    name: trimmed,
    note: noteFromUnit,
  };
}

/** Intenta extraer el Recipe del JSON-LD de un documento HTML. */
export function extractRecipeFromJsonLd(html: string): {
  success: boolean;
  recipe: {
    title: string;
    description?: string;
    yield?: string;
    prepMinutes?: number;
    cookMinutes?: number;
    ingredients: ParsedIngredient[];
    steps: string[];
  } | null;
} {
  try {
    // Buscar el bloque <script type="application/ld+json">
    const ldRegex = /<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i;
    const match = ldRegex.exec(html);

    if (!match?.[1]) {
      return { success: false, recipe: null };
    }

    let json: unknown;
    try {
      json = JSON.parse(match[1].trim());
    } catch {
      return { success: false, recipe: null };
    }

    // Validar que es un objeto Recipe
    if (typeof json !== 'object' || json === null || !('@type' in json)) {
      return { success: false, recipe: null };
    }

    const types = Array.isArray(json['@type']) ? json['@type'] : [json['@type']];
    const isRecipe = types.some((t: string) => t.includes('Recipe'));

    if (!isRecipe) {
      return { success: false, recipe: null };
    }

    const recipe: any = json;

    // Título
    const title = recipe.name || recipe.name?.['@lang'] || 'Receta sin título';

    // Descripción
    const description = recipe.description || undefined;

    // Rendimiento
    const yieldText = recipe.recipeYield || undefined;

    // Tiempos
    let prepMinutes: number | undefined;
    let cookMinutes: number | undefined;

    if (recipe.prepTime) {
      const ptMatch = recipe.prepTime.match(/^PT(\d+)M$/);
      if (ptMatch) prepMinutes = parseInt(ptMatch[1], 10);
    }
    if (recipe.cookTime) {
      const ctMatch = recipe.cookTime.match(/^PT(\d+)M$/);
      if (ctMatch) cookMinutes = parseInt(ctMatch[1], 10);
    }

    // Ingredientes
    const rawIngredients: string[] = [];
    if (Array.isArray(recipe.recipeIngredient)) {
      rawIngredients.push(...recipe.recipeIngredient);
    }

    const parsedIngredients: ParsedIngredient[] = [];
    for (const ing of rawIngredients) {
      if (typeof ing === 'string') {
        parsedIngredients.push(parseIngredient(ing));
      }
    }

    // Instrucciones
    const rawSteps: string[] = [];
    if (Array.isArray(recipe.recipeInstructions)) {
      for (const step of recipe.recipeInstructions) {
        if (typeof step === 'object' && step['@text']) {
          rawSteps.push(step['@text']);
        } else if (typeof step === 'string') {
          rawSteps.push(step);
        }
      }
    }

    return {
      success: true,
      recipe: {
        title,
        description,
        yield: yieldText,
        prepMinutes,
        cookMinutes,
        ingredients: parsedIngredients,
        steps: rawSteps,
      },
    };
  } catch (error) {
    console.error('Error extrayendo recipe de JSON-LD:', error);
    return { success: false, recipe: null };
  }
}

/** Intenta extraer el Recipe de microdata (itemscope itemtype) en el HTML. */
export function extractRecipeFromMicrodata(html: string): {
  success: boolean;
  recipe: {
    title: string;
    description?: string;
    yield?: string;
    prepMinutes?: number;
    cookMinutes?: number;
    ingredients: ParsedIngredient[];
    steps: string[];
  } | null;
} {
  try {
    // Buscar container con itemtype Recipe (http o https)
    const containerRegex = /<div\s+[^>]*itemtype="https?:\/\/schema\.org\/Recipe"[^>]*>([\s\S]*?)<\/div>/i;
    const containerMatch = containerRegex.exec(html);

    if (!containerMatch) {
      return { success: false, recipe: null };
    }

    const containerContent = containerMatch[1];

    // Extraer nombre (puede estar en span o meta con itemprop="name")
    // Los tags <meta> son auto-cerrados, por lo que hay que capturarlos distinto
    const metaMatch = /<meta[^>]*itemprop="name"[^>]*content="([^"]*)"/i.exec(containerContent);
    const spanMatch = /<span[^>]*itemprop="name"[^>]*>([^<]*)<\/span>/i.exec(containerContent);
    const title = metaMatch ? metaMatch[1] : (spanMatch ? spanMatch[1] : 'Receta de microdata');

    // Extraer ingredientes (pueden estar en spans, divs o text nodes)
    const ingredientRegex = /<span\s+[^>]*itemprop="recipeIngredient"[^>]*>([^<]*)<\/span>/gi;
    const rawIngredients: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = ingredientRegex.exec(containerContent)) !== null) {
      rawIngredients.push(match[1].trim());
    }

    // Si no se encontraron ingredientes en spans, buscar en text nodes con "g", "kg", etc.
    if (rawIngredients.length === 0) {
      const textIngredients = containerContent.match(/((?:\d+(?:\s+)?(?:\d+\/\d+)?\s+(?:g|kg|ml|l|tsp|tbsp|cup|unit|pinch|pizca|taza|tazas|vaso|sal|harina|arroz|pollo|verdura)))/gi);
      if (textIngredients) {
        rawIngredients.push(...textIngredients.filter((t: string) => t.trim().length > 0).map((t: string) => t.trim()));
      }
    }

    // Extraer instrucciones
    const instructionRegex = /<span\s+[^>]*itemprop="recipeInstructions"[^>]*>([^<]*)<\/span>/gi;
    const rawSteps: string[] = [];
    let stepMatch: RegExpExecArray | null;
    while ((stepMatch = instructionRegex.exec(containerContent)) !== null) {
      rawSteps.push(stepMatch[1].trim());
    }

    // Si no hay instrucciones en spans, buscar en parágrafos
    if (rawSteps.length === 0) {
      const paraMatches = containerContent.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
      if (paraMatches) {
        rawSteps.push(...paraMatches.map((p: string) => p.replace(/<[^>]+>/g, '').trim()).filter((s: string) => s.length > 5));
      }
    }

    const parsedIngredients: ParsedIngredient[] = [];
    for (const ing of rawIngredients) {
      if (typeof ing === 'string' && ing.trim().length > 0) {
        parsedIngredients.push(parseIngredient(ing));
      }
    }

    return {
      success: true,
      recipe: {
        title,
        ingredients: parsedIngredients,
        steps: rawSteps.length > 0 ? rawSteps : ['Instrucciones extraídas de microdata'],
      },
    };
  } catch (error) {
    console.error('Error extrayendo recipe de microdata:', error);
    return { success: false, recipe: null };
  }
}

/** Intenta extraer una receta del HTML, probando primero JSON-LD y luego microdata. */
export function extractRecipe(html: string): {
  success: boolean;
  recipe: {
    title: string;
    description?: string;
    yield?: string;
    prepMinutes?: number;
    cookMinutes?: number;
    ingredients: ParsedIngredient[];
    steps: string[];
  } | null;
} {
  // 1. Intentar JSON-LD
  const jsonLdResult = extractRecipeFromJsonLd(html);
  if (jsonLdResult.success && jsonLdResult.recipe) {
    return jsonLdResult;
  }

  // 2. Intentar microdata
  const microdataResult = extractRecipeFromMicrodata(html);
  if (microdataResult.success && microdataResult.recipe) {
    return microdataResult;
  }

  // 3. Fallo total
  return { success: false, recipe: null };
}