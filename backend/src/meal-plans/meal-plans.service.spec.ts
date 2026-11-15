import { Types } from 'mongoose';
import type { RecipesRepository } from '../recipes/recipes.repository.js';
import type { MealPlan } from './meal-plan.schema.js';
import type { MealPlansRepository } from './meal-plans.repository.js';
import { MealPlansService } from './meal-plans.service.js';

const householdId = new Types.ObjectId().toString();
const weekStart = new Date('2026-11-16T00:00:00.000Z');

interface Harness {
  service: MealPlansService;
  mealPlans: { findByWeek: ReturnType<typeof vi.fn>; replaceSlots: ReturnType<typeof vi.fn> };
  recipes: { findById: ReturnType<typeof vi.fn> };
  publisher: { publish: ReturnType<typeof vi.fn> };
}

function createService(plan: MealPlan | null): Harness {
  const mealPlans = {
    findByWeek: vi.fn().mockResolvedValue(plan),
    replaceSlots: vi.fn().mockResolvedValue(plan),
  };
  const recipes = { findById: vi.fn() };
  const publisher = { publish: vi.fn() };
  const service = new MealPlansService(
    mealPlans as unknown as MealPlansRepository,
    recipes as unknown as RecipesRepository,
    publisher,
  );

  return { service, mealPlans, recipes, publisher };
}

describe('MealPlansService', () => {
  it('publica el hueco quitado con recipeId null', async () => {
    const plan = {
      _id: new Types.ObjectId(),
      householdId: new Types.ObjectId(householdId),
      weekStart,
      slots: [
        { day: 0, meal: 'lunch', recipeId: new Types.ObjectId(), servings: 4 },
        { day: 1, meal: 'dinner', recipeId: new Types.ObjectId(), servings: 2 },
      ],
    } as unknown as MealPlan;
    const { service, publisher } = createService(plan);

    await service.updateSlots(householdId, weekStart, { day: 0, meal: 'lunch' });

    expect(publisher.publish).toHaveBeenCalledWith('meal-plan.updated', {
      householdId,
      weekStart: '2026-11-16',
      slots: [{ day: 0, meal: 'lunch', recipeId: null, servings: 4 }],
    });
  });

  it('publica el hueco asignado con la receta y las raciones resultantes', async () => {
    const plan = {
      _id: new Types.ObjectId(),
      householdId: new Types.ObjectId(householdId),
      weekStart,
      slots: [],
    } as unknown as MealPlan;
    const { service, recipes, publisher } = createService(plan);
    const recipeId = new Types.ObjectId().toString();

    recipes.findById.mockResolvedValue({ _id: recipeId, servings: 4 });

    await service.updateSlots(householdId, weekStart, {
      day: 2,
      meal: 'breakfast',
      recipeId,
      servings: 6,
    });

    expect(publisher.publish).toHaveBeenCalledWith('meal-plan.updated', {
      householdId,
      weekStart: '2026-11-16',
      slots: [{ day: 2, meal: 'breakfast', recipeId, servings: 6 }],
    });
  });
});
