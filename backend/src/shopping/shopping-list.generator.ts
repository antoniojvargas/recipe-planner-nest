import { Injectable } from '@nestjs/common';
import {
  UNITS,
  normalize,
  unitsOfDimension,
  type Unit,
  type UnitDimension,
} from '@recipe-planner/contracts';
import { RecipesRepository } from '../recipes/recipes.repository.js';
import type { MealPlan } from '../meal-plans/meal-plan.schema.js';
import type { PantryItem } from '../pantry/pantry-item.schema.js';
import type { ShoppingListItem } from '../shopping/shopping-list.schema.js';

function normalizeName(name: string): string {
  return name.toLowerCase().trim();
}

function dimensionOf(unit: Unit): UnitDimension {
  return UNITS[unit].dimension;
}

function fromBase(qtyBase: number, dimension: UnitDimension): { qty: number; unit: Unit } {
  const candidates = unitsOfDimension(dimension);
  let bestUnit = candidates[0];
  let bestFactor = UNITS[bestUnit].factor;
  let bestQty = qtyBase / bestFactor;

  for (const unit of candidates) {
    const factor = UNITS[unit].factor;
    const q = qtyBase / factor;
    if (q >= 1 && q <= 1000) {
      if (q > bestQty || (q === bestQty && factor > bestFactor)) {
        bestUnit = unit;
        bestFactor = factor;
        bestQty = q;
      }
    } else if (q < 1 && bestQty < 1) {
      if (q > bestQty) {
        bestUnit = unit;
        bestFactor = factor;
        bestQty = q;
      }
    }
  }

  return { qty: Math.round(bestQty * 10) / 10, unit: bestUnit };
}

function addScaled(
  aQty: number,
  aUnit: Unit,
  bQty: number,
  bUnit: Unit,
): { qty: number; unit: Unit } | null {
  if (dimensionOf(aUnit) !== dimensionOf(bUnit)) {
    return null;
  }

  const baseTotal = normalize(aQty, aUnit).quantity + normalize(bQty, bUnit).quantity;
  if (Number.isNaN(baseTotal) || baseTotal <= 0) {
    return null;
  }

  return fromBase(baseTotal, dimensionOf(aUnit));
}

@Injectable()
export class ShoppingListGenerator {
  constructor(private readonly recipesRepository: RecipesRepository) {}

  async generate(
    plan: MealPlan,
    pantryItems: PantryItem[],
    householdId: string,
  ): Promise<{ name: string; quantity: number; unit: Unit }[]> {
    const ingredientCounts = new Map<string, { qty: number; unit: Unit }>();

    for (const slot of plan.slots) {
      if (slot.recipeId == null) continue;

      const recipe = await this.recipesRepository.findById(householdId, String(slot.recipeId));
      if (recipe == null) continue;

      const ratio = (slot.servings || recipe.servings) / recipe.servings;

      for (const ing of recipe.ingredients) {
        const normName = normalizeName(ing.name);
        const scaledQty = ing.quantity * ratio;

        const existing = ingredientCounts.get(normName);
        if (existing != null) {
          const summed = addScaled(existing.qty, existing.unit, scaledQty, ing.unit);
          if (summed != null) {
            ingredientCounts.set(normName, summed);
          }
        } else {
          ingredientCounts.set(normName, { qty: scaledQty, unit: ing.unit });
        }
      }
    }

    const pantryByName = new Map<string, Map<UnitDimension, number>>();
    for (const item of pantryItems) {
      const key = normalizeName(item.name);
      const dimension = dimensionOf(item.unit);
      const byDimension = pantryByName.get(key) ?? new Map<UnitDimension, number>();
      byDimension.set(
        dimension,
        (byDimension.get(dimension) ?? 0) + normalize(item.quantity, item.unit).quantity,
      );
      pantryByName.set(key, byDimension);
    }

    const result: { name: string; quantity: number; unit: Unit }[] = [];
    const seen = new Set<string>();

    for (const [normName, { qty, unit }] of ingredientCounts) {
      if (seen.has(normName)) continue;
      seen.add(normName);

      const dimension = dimensionOf(unit);
      const pantryBase = pantryByName.get(normName)?.get(dimension) ?? 0;
      const remainingBase = normalize(qty, unit).quantity - pantryBase;

      if (remainingBase > 0) {
        const converted = fromBase(remainingBase, dimension);
        const originalName =
          [...ingredientCounts.keys()].find((k) => normalizeName(k) === normName) || normName;

        result.push({ name: originalName, quantity: converted.qty, unit: converted.unit });
      }
    }

    result.sort((a, b) => normalizeName(a.name).localeCompare(normalizeName(b.name)));

    return result;
  }

  /** Genera ítems source: 'plan' para la lista de la compra.
   *
   * @param currentItems Items actuales de la lista (type: ShoppingListItem)
   * @param manualItems Items manuales a preservar
   * @returns Nuevos ítems source: 'plan' listos para combinarse
   */
  async generatePlanItems(
    currentItems: ShoppingListItem[],
    manualItems: ShoppingListItem[],
  ): Promise<ShoppingListItem[]> {
    // Los nombres normalizados de los items manuales
    const manualNames = new Set(manualItems.map((item) => normalizeName(item.name)));

    // Items plan actuales
    const planItems = currentItems.filter((item) => item.source === 'plan');

    // Para cada item plan, verificar si existe un manual con el mismo nombre
    const result: ShoppingListItem[] = [];

    for (const planItem of planItems) {
      const planNameNorm = normalizeName(planItem.name);

      // Buscar si hay un manual con nombre similar
      const matchingManual = manualItems.find((m) => normalizeName(m.name) === planNameNorm);

      if (matchingManual) {
        // Conservar el item plan pero con el checked del manual
        result.push(
          Object.assign({}, planItem, {
            checked: matchingManual.checked,
            checkedBy: matchingManual.checkedBy,
          }),
        );
      } else {
        // Item plan sin coincidencia manual - mantener tal cual
        result.push(planItem);
      }
    }

    // Añadir items manuales que no tengan correspondencia en plan
    for (const manualItem of manualItems) {
      const alreadyExists = result.some(
        (r) => normalizeName(r.name) === normalizeName(manualItem.name),
      );
      if (!alreadyExists) {
        result.push(manualItem);
      }
    }

    return result;
  }
}
