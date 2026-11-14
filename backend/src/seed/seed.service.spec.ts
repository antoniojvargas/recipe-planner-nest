import 'reflect-metadata';
import { Types } from 'mongoose';
import type {
  CreateHouseholdInput,
  HouseholdsRepository,
} from '../households/households.repository.js';
import type { Household } from '../households/household.schema.js';
import type { MealPlanSlot } from '../meal-plans/meal-plan.schema.js';
import type { MealPlansRepository } from '../meal-plans/meal-plans.repository.js';
import type { PantryItemInput, PantryRepository } from '../pantry/pantry.repository.js';
import type { Recipe } from '../recipes/recipe.schema.js';
import type { CreateRecipeInput, RecipesRepository } from '../recipes/recipes.repository.js';
import type { CreateUserInput, UsersRepository } from '../users/users.repository.js';
import type { User } from '../users/user.schema.js';
import { SEED_RECIPES } from './seed-recipes.js';
import { SeedService } from './seed.service.js';

vi.mock('argon2', () => ({
  argon2id: 2,
  hash: vi.fn().mockResolvedValue('$argon2id$mock'),
}));

const anaId = new Types.ObjectId();
const luisId = new Types.ObjectId();
const householdId = new Types.ObjectId();
const userIds: Record<string, Types.ObjectId> = {
  'ana@example.com': anaId,
  'luis@example.com': luisId,
};

function createService() {
  const users = {
    findByEmail: vi.fn().mockResolvedValue(null),
    create: vi.fn((input: CreateUserInput) =>
      Promise.resolve({ _id: userIds[input.email] ?? new Types.ObjectId(), ...input }),
    ),
  };
  const captured: { household?: CreateHouseholdInput } = {};
  const households = {
    findByMember: vi.fn().mockResolvedValue([]),
    create: vi.fn((input: CreateHouseholdInput) => {
      captured.household = input;
      return Promise.resolve({ _id: householdId, ...input });
    }),
    addMember: vi.fn().mockResolvedValue(null),
  };
  const recipes = {
    findByHousehold: vi.fn().mockResolvedValue([]),
    create: vi.fn((input: CreateRecipeInput) =>
      Promise.resolve({ _id: new Types.ObjectId(), ...input }),
    ),
  };
  const slots: MealPlanSlot[][] = [];
  const mealPlans = {
    replaceSlots: vi.fn((_householdId: string, _weekStart: Date, value: MealPlanSlot[]) => {
      slots.push(value);
      return Promise.resolve(null);
    }),
  };
  const pantryItems: PantryItemInput[] = [];
  const pantry = {
    upsert: vi.fn((_householdId: string, item: PantryItemInput) => {
      pantryItems.push(item);
      return Promise.resolve(null);
    }),
  };

  const service = new SeedService(
    users as unknown as UsersRepository,
    households as unknown as HouseholdsRepository,
    recipes as unknown as RecipesRepository,
    mealPlans as unknown as MealPlansRepository,
    pantry as unknown as PantryRepository,
  );

  return { service, users, households, recipes, mealPlans, pantry, slots, pantryItems, captured };
}

describe('SeedService', () => {
  it('crea usuarios, hogar, 25 recetas, el plan de la semana y la despensa', async () => {
    const { service, users, recipes, mealPlans, pantry, slots, pantryItems, captured } =
      createService();

    const summary = await service.run();

    expect(users.create).toHaveBeenCalledTimes(2);
    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ana@example.com', passwordHash: '$argon2id$mock' }),
    );
    expect(captured.household?.name).toBe('Casa de Ana y Luis');
    expect(captured.household?.members).toHaveLength(2);
    expect(captured.household?.members?.[0]).toMatchObject({ userId: anaId, role: 'owner' });
    expect(captured.household?.members?.[1]).toMatchObject({ userId: luisId, role: 'member' });
    expect(captured.household?.members?.[0]?.joinedAt).toBeInstanceOf(Date);
    expect(recipes.create).toHaveBeenCalledTimes(25);
    expect(mealPlans.replaceSlots).toHaveBeenCalledOnce();
    expect(slots[0]).toHaveLength(21);
    expect(slots[0]?.filter((slot) => slot.meal === 'breakfast')).toHaveLength(7);
    expect(slots[0]?.filter((slot) => slot.meal === 'lunch')).toHaveLength(7);
    expect(slots[0]?.filter((slot) => slot.meal === 'dinner')).toHaveLength(7);
    expect(pantry.upsert).toHaveBeenCalledTimes(14);
    expect(pantryItems).toHaveLength(14);
    expect(summary).toMatchObject({ recipes: 25, slots: 21, pantryItems: 14 });
  });

  it('no duplica nada si los datos de ejemplo ya existen', async () => {
    const { service, users, households, recipes, mealPlans, slots } = createService();
    const existingUsers = [
      { _id: anaId, email: 'ana@example.com', displayName: 'Ana' },
      { _id: luisId, email: 'luis@example.com', displayName: 'Luis' },
    ] as unknown as User[];
    const existingHousehold = {
      _id: householdId,
      name: 'Casa de Ana y Luis',
      members: [
        { userId: anaId, role: 'owner', joinedAt: new Date() },
        { userId: luisId, role: 'member', joinedAt: new Date() },
      ],
    } as unknown as Household;
    const existingRecipes = SEED_RECIPES.map(
      (recipe) =>
        ({
          ...recipe,
          _id: new Types.ObjectId(),
          householdId,
          createdBy: anaId,
        }) as unknown as Recipe,
    );

    users.findByEmail.mockImplementation((email: string) =>
      Promise.resolve(existingUsers.find((user) => user.email === email) ?? null),
    );
    households.findByMember.mockResolvedValue([existingHousehold]);
    recipes.findByHousehold.mockResolvedValue(existingRecipes);

    const summary = await service.run();

    expect(users.create).not.toHaveBeenCalled();
    expect(households.create).not.toHaveBeenCalled();
    expect(households.addMember).not.toHaveBeenCalled();
    expect(recipes.create).not.toHaveBeenCalled();
    expect(mealPlans.replaceSlots).toHaveBeenCalledOnce();
    expect(slots[0]).toHaveLength(21);
    expect(summary.recipes).toBe(25);
  });
});
