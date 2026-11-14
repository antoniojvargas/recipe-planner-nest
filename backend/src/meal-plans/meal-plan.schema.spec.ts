import 'reflect-metadata';
import mongoose, { Types } from 'mongoose';
import { MealPlan, MealPlanSchema, MealPlanSlotSchema } from './meal-plan.schema.js';

describe('MealPlanSchema', () => {
  const connection = mongoose.createConnection();
  const MealPlanModel = connection.model(MealPlan.name, MealPlanSchema);
  const householdId = new Types.ObjectId();
  const recipeId = new Types.ObjectId();
  const weekStart = new Date('2026-11-09T00:00:00.000Z');

  afterAll(async () => {
    await connection.close();
  });

  it('valida un plan con huecos de varios días y comidas', async () => {
    const plan = new MealPlanModel({
      householdId,
      weekStart,
      slots: [
        { day: 0, meal: 'breakfast', recipeId, servings: 2 },
        { day: 3, meal: 'dinner', recipeId, servings: 4 },
      ],
    });

    await expect(plan.validate()).resolves.toBeUndefined();
    expect(plan.slots).toHaveLength(2);
    expect(plan.slots[1]).toMatchObject({ day: 3, meal: 'dinner', recipeId, servings: 4 });
    expect(MealPlanSlotSchema.options._id).toBe(false);
  });

  it('empieza sin huecos', async () => {
    const plan = new MealPlanModel({ householdId, weekStart });

    await expect(plan.validate()).resolves.toBeUndefined();
    expect(plan.slots).toEqual([]);
  });

  it('exige hogar, semana y los datos de cada hueco', async () => {
    const error = await new MealPlanModel({ slots: [{}] })
      .validate()
      .catch((caught: unknown) => caught as mongoose.Error.ValidationError);

    expect(Object.keys(error?.errors ?? {})).toEqual(
      expect.arrayContaining([
        'householdId',
        'weekStart',
        'slots.0.day',
        'slots.0.meal',
        'slots.0.recipeId',
        'slots.0.servings',
      ]),
    );
  });

  it('rechaza días fuera de 0–6 o que no sean enteros', async () => {
    const validationErrors = await Promise.all(
      [-1, 7, 1.5].map((day) =>
        new MealPlanModel({
          householdId,
          weekStart,
          slots: [{ day, meal: 'lunch', recipeId, servings: 1 }],
        })
          .validate()
          .catch((caught: unknown) => caught as mongoose.Error.ValidationError),
      ),
    );

    for (const error of validationErrors) {
      expect(error?.errors['slots.0.day']).toBeDefined();
    }
  });

  it('rechaza comidas fuera del catálogo', async () => {
    const error = await new MealPlanModel({
      householdId,
      weekStart,
      slots: [{ day: 1, meal: 'brunch', recipeId, servings: 2 }],
    })
      .validate()
      .catch((caught: unknown) => caught as mongoose.Error.ValidationError);

    expect(error?.errors['slots.0.meal']).toBeDefined();
  });

  it('solo acepta un lunes a las 00:00 UTC como inicio de semana', async () => {
    const invalidDates = [
      new Date('2026-11-10T00:00:00.000Z'),
      new Date('2026-11-09T10:00:00.000Z'),
    ];

    for (const invalid of invalidDates) {
      const error = await new MealPlanModel({ householdId, weekStart: invalid })
        .validate()
        .catch((caught: unknown) => caught as mongoose.Error.ValidationError);

      expect(error?.errors.weekStart).toBeDefined();
    }
  });

  it('referencia el hogar y las recetas', () => {
    expect(MealPlanSchema.path('householdId').options.ref).toBe('Household');
    expect(MealPlanSlotSchema.path('recipeId').options.ref).toBe('Recipe');
  });

  it('declara el índice único por hogar y semana', () => {
    expect(MealPlanSchema.indexes()).toContainEqual([
      { householdId: 1, weekStart: 1 },
      expect.objectContaining({ unique: true }),
    ]);
  });
});
