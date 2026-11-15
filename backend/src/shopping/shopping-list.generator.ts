import { Injectable } from '@nestjs/common';
import type { RecipesRepository } from '../recipes/recipes.repository.js';
import type { MealPlan } from '../meal-plans/meal-plan.schema.js';
import type { PantryItem } from '../pantry/pantry-item.schema.js';
import type { Unit } from '@recipe-planner/contracts';

function normalizeName(name: string): string {
  return name.toLowerCase().trim();
}

const UNIT_FACTORS: Record<Unit, number> = {
  g: 1, kg: 1_000, ml: 1, l: 1_000, tsp: 5, tbsp: 15, cup: 240, unit: 1, pinch: 1,
};

function toBase(qty: number, unit: Unit): number {
  const factor = UNIT_FACTORS[unit] ?? 1;
  return qty * factor;
}

function fromBase(qtyBase: number): { qty: number; unit: Unit } {
  let bestUnit: Unit = 'g';
  let bestFactor = 1;
  let bestQty = qtyBase;

  for (const [u, f] of Object.entries(UNIT_FACTORS) as [Unit, number][]) {
    const q = qtyBase / f;
    if (q >= 1 && q <= 1000) {
      if (q > bestQty || (q === bestQty && f > bestFactor)) {
        bestUnit = u;
        bestFactor = f;
        bestQty = q;
      }
    }
    if (q < 1 && bestQty < 1) {
      if (q > bestQty) {
        bestUnit = u;
        bestFactor = f;
        bestQty = q;
      }
    }
  }

  return { qty: Math.round(bestQty * 10) / 10, unit: bestUnit };
}

function addScaled(
  aQty: number, aUnit: Unit,
  bQty: number, bUnit: Unit,
): { qty: number; unit: Unit } | null {
  const baseTotal = toBase(aQty, aUnit) + toBase(bQty, bUnit);
  if (Number.isNaN(baseTotal) || baseTotal <= 0) return null;
  return fromBase(baseTotal);
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

      const recipe = await this.recipesRepository.findById(
        householdId,
        String(slot.recipeId),
      );
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

    const pantryMap = new Map<string, number>();
    for (const item of pantryItems) {
      const base = toBase(item.quantity, item.unit);
      const key = normalizeName(item.name);
      const existing = pantryMap.get(key) ?? 0;
      pantryMap.set(key, existing + base);
    }

    const result: { name: string; quantity: number; unit: Unit }[] = [];
    const seen = new Set<string>();

    for (const [normName, { qty, unit }] of ingredientCounts) {
      if (seen.has(normName)) continue;
      seen.add(normName);

      const pantryBase = pantryMap.get(normName) ?? 0;
      const remainingBase = toBase(qty, unit) - pantryBase;

      if (remainingBase > 0) {
        const converted = fromBase(remainingBase);
        const originalName = [...ingredientCounts.keys()].find(
          (k) => normalizeName(k) === normName,
        ) || normName;

        result.push({ name: originalName, quantity: converted.qty, unit: converted.unit });
      }
    }

    result.sort((a, b) =>
      normalizeName(a.name).localeCompare(normalizeName(b.name)),
    );

    return result;
  }
}
