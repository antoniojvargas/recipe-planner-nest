import { Injectable } from '@nestjs/common';
import { argon2id, hash as hashPassword } from 'argon2';
import { Types } from 'mongoose';
import { startOfWeek } from '../common/week.js';
import { HouseholdsRepository } from '../households/households.repository.js';
import type { Household } from '../households/household.schema.js';
import type { MealPlanSlot } from '../meal-plans/meal-plan.schema.js';
import { MealPlansRepository } from '../meal-plans/meal-plans.repository.js';
import type { PantryItemInput } from '../pantry/pantry.repository.js';
import { PantryRepository } from '../pantry/pantry.repository.js';
import type { Recipe } from '../recipes/recipe.schema.js';
import { RecipesRepository } from '../recipes/recipes.repository.js';
import type { User } from '../users/user.schema.js';
import { UsersRepository } from '../users/users.repository.js';
import { SEED_BREAKFAST_TITLES, SEED_MAIN_TITLES, SEED_RECIPES } from './seed-recipes.js';

/** Contraseña común de los dos usuarios de ejemplo; se imprime al terminar el seed. */
export const SEED_PASSWORD = 'Recetas123!';

export const SEED_USERS = [
  { email: 'ana@example.com', displayName: 'Ana' },
  { email: 'luis@example.com', displayName: 'Luis' },
] as const;

const HOUSEHOLD_NAME = 'Casa de Ana y Luis';

const PANTRY_ITEMS: PantryItemInput[] = [
  { name: 'Arroz', quantity: 1, unit: 'kg' },
  { name: 'Pasta', quantity: 500, unit: 'g' },
  { name: 'Harina', quantity: 1, unit: 'kg' },
  { name: 'Aceite de oliva', quantity: 750, unit: 'ml' },
  { name: 'Sal', quantity: 500, unit: 'g' },
  { name: 'Huevos', quantity: 12, unit: 'unit' },
  { name: 'Leche', quantity: 1, unit: 'l' },
  { name: 'Tomate triturado', quantity: 800, unit: 'g' },
  { name: 'Cebolla', quantity: 2, unit: 'unit' },
  { name: 'Ajo', quantity: 1, unit: 'unit' },
  { name: 'Garbanzos', quantity: 400, unit: 'g' },
  { name: 'Atún en lata', quantity: 3, unit: 'unit' },
  { name: 'Café molido', quantity: 250, unit: 'g' },
  { name: 'Papel de cocina', quantity: 2, unit: 'unit' },
];

export interface SeedSummary {
  weekStart: Date;
  recipes: number;
  slots: number;
  pantryItems: number;
}

/**
 * Datos de ejemplo para desarrollo: dos usuarios que comparten un hogar, 25 recetas, el plan de
 * la semana en curso y una despensa básica.
 *
 * Es idempotente: los usuarios se buscan por email, el hogar por nombre y las recetas por título;
 * solo se crea lo que falta. El plan y la despensa se actualizan con los valores del seed.
 */
@Injectable()
export class SeedService {
  constructor(
    private readonly users: UsersRepository,
    private readonly households: HouseholdsRepository,
    private readonly recipes: RecipesRepository,
    private readonly mealPlans: MealPlansRepository,
    private readonly pantry: PantryRepository,
  ) {}

  async run(): Promise<SeedSummary> {
    const [ana, luis] = await Promise.all(SEED_USERS.map((user) => this.ensureUser(user)));

    const household = await this.ensureHousehold(ana, luis);
    const householdId = household._id.toString();
    const recipes = await this.ensureRecipes(householdId, ana._id.toString());
    const slots = await this.seedPlan(householdId, recipes);
    await this.seedPantry(householdId);

    return {
      weekStart: startOfWeek(),
      recipes: recipes.length,
      slots: slots.length,
      pantryItems: PANTRY_ITEMS.length,
    };
  }

  private async ensureUser({ email, displayName }: (typeof SEED_USERS)[number]): Promise<User> {
    const existing = await this.users.findByEmail(email);

    if (existing) {
      return existing;
    }

    const passwordHash = await hashPassword(SEED_PASSWORD, { type: argon2id });

    return this.users.create({ email, passwordHash, displayName });
  }

  private async ensureHousehold(ana: User, luis: User): Promise<Household> {
    const households = await this.households.findByMember(ana._id.toString());
    const existing = households.find((household) => household.name === HOUSEHOLD_NAME);

    if (!existing) {
      return this.households.create({
        name: HOUSEHOLD_NAME,
        members: [
          { userId: ana._id, role: 'owner', joinedAt: new Date() },
          { userId: luis._id, role: 'member', joinedAt: new Date() },
        ],
      });
    }

    if (!existing.members.some((member) => member.userId.equals(luis._id))) {
      const updated = await this.households.addMember(existing._id.toString(), {
        userId: luis._id,
        role: 'member',
        joinedAt: new Date(),
      });

      return updated ?? existing;
    }

    return existing;
  }

  private async ensureRecipes(householdId: string, createdBy: string): Promise<Recipe[]> {
    const existing = await this.recipes.findByHousehold(householdId, { limit: 100 });
    const byTitle = new Map(existing.map((recipe) => [recipe.title, recipe]));
    const recipes: Recipe[] = [];
    const householdObjectId = new Types.ObjectId(householdId);
    const createdByObjectId = new Types.ObjectId(createdBy);

    for (const seedRecipe of SEED_RECIPES) {
      const found = byTitle.get(seedRecipe.title);

      if (found) {
        recipes.push(found);
        continue;
      }

      recipes.push(
        await this.recipes.create({
          ...seedRecipe,
          householdId: householdObjectId,
          createdBy: createdByObjectId,
        }),
      );
    }

    return recipes;
  }

  private async seedPlan(householdId: string, recipes: Recipe[]): Promise<MealPlanSlot[]> {
    const byTitle = new Map(recipes.map((recipe) => [recipe.title, recipe]));
    const slots: MealPlanSlot[] = [];

    for (let day = 0; day < 7; day += 1) {
      const breakfast = this.requireRecipe(
        byTitle,
        SEED_BREAKFAST_TITLES[day % SEED_BREAKFAST_TITLES.length],
      );
      const lunch = this.requireRecipe(
        byTitle,
        SEED_MAIN_TITLES[(day * 2) % SEED_MAIN_TITLES.length],
      );
      const dinner = this.requireRecipe(
        byTitle,
        SEED_MAIN_TITLES[(day * 2 + 1) % SEED_MAIN_TITLES.length],
      );

      slots.push(
        { day, meal: 'breakfast', recipeId: breakfast._id, servings: breakfast.servings },
        { day, meal: 'lunch', recipeId: lunch._id, servings: lunch.servings },
        { day, meal: 'dinner', recipeId: dinner._id, servings: dinner.servings },
      );
    }

    await this.mealPlans.replaceSlots(householdId, startOfWeek(), slots);

    return slots;
  }

  private async seedPantry(householdId: string): Promise<void> {
    for (const item of PANTRY_ITEMS) {
      await this.pantry.upsert(householdId, item);
    }
  }

  private requireRecipe(byTitle: Map<string, Recipe>, title: string): Recipe {
    const recipe = byTitle.get(title);

    if (!recipe) {
      throw new Error(`La receta "${title}" no está en el seed`);
    }

    return recipe;
  }
}
