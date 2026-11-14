import 'reflect-metadata';
import mongoose, { Types } from 'mongoose';
import {
  ShoppingList,
  ShoppingListItemSchema,
  ShoppingListSchema,
} from './shopping-list.schema.js';

describe('ShoppingListSchema', () => {
  const connection = mongoose.createConnection();
  const ShoppingListModel = connection.model(ShoppingList.name, ShoppingListSchema);
  const householdId = new Types.ObjectId();
  const userId = new Types.ObjectId();
  const weekStart = new Date('2026-11-09T00:00:00.000Z');

  afterAll(async () => {
    await connection.close();
  });

  it('valida una lista con ítems del plan y manuales', async () => {
    const list = new ShoppingListModel({
      householdId,
      weekStart,
      items: [
        { name: 'Arroz', quantity: 400, unit: 'g', source: 'plan' },
        { name: 'Servilletas', quantity: 1, unit: 'unit' },
      ],
    });

    await expect(list.validate()).resolves.toBeUndefined();
    expect(list.items).toHaveLength(2);
    expect(list.items[0]).toMatchObject({ name: 'Arroz', quantity: 400, unit: 'g' });
    expect(list.items[1]).toMatchObject({ name: 'Servilletas', source: 'manual', checked: false });
    expect(list.items[0]._id).toBeInstanceOf(Types.ObjectId);
  });

  it('guarda quién marcó el ítem', async () => {
    const list = new ShoppingListModel({
      householdId,
      weekStart,
      items: [{ name: 'Arroz', quantity: 400, unit: 'g', checked: true, checkedBy: userId }],
    });

    await expect(list.validate()).resolves.toBeUndefined();
    expect(list.items[0]).toMatchObject({ checked: true, checkedBy: userId });
  });

  it('exige hogar, semana y los datos de cada ítem', async () => {
    const error = await new ShoppingListModel({ items: [{}] })
      .validate()
      .catch((caught: unknown) => caught as mongoose.Error.ValidationError);

    expect(Object.keys(error?.errors ?? {})).toEqual(
      expect.arrayContaining([
        'householdId',
        'weekStart',
        'items.0.name',
        'items.0.quantity',
        'items.0.unit',
      ]),
    );
  });

  it('rechaza cantidades negativas y unidades o procedencias inválidas', async () => {
    const error = await new ShoppingListModel({
      householdId,
      weekStart,
      items: [{ name: 'Harina', quantity: -1, unit: 'oz', source: 'ticket' }],
    })
      .validate()
      .catch((caught: unknown) => caught as mongoose.Error.ValidationError);

    expect(error?.errors['items.0.quantity']).toBeDefined();
    expect(error?.errors['items.0.unit']).toBeDefined();
    expect(error?.errors['items.0.source']).toBeDefined();
  });

  it('solo acepta el catálogo de procedencias', () => {
    expect(ShoppingListItemSchema.path('source').options.enum).toEqual(['plan', 'manual']);
  });

  it('rechaza una semana que no empieza en lunes a las 00:00 UTC', async () => {
    const error = await new ShoppingListModel({
      householdId,
      weekStart: new Date('2026-11-10T00:00:00.000Z'),
    })
      .validate()
      .catch((caught: unknown) => caught as mongoose.Error.ValidationError);

    expect(error?.errors.weekStart).toBeDefined();
  });

  it('referencia el hogar y el usuario que marca', () => {
    expect(ShoppingListSchema.path('householdId').options.ref).toBe('Household');
    expect(ShoppingListItemSchema.path('checkedBy').options.ref).toBe('User');
  });

  it('usa version como clave de concurrencia optimista', () => {
    expect(ShoppingListSchema.options.optimisticConcurrency).toBe(true);
    expect(ShoppingListSchema.options.versionKey).toBe('version');
    expect(ShoppingListSchema.path('version')).toBeDefined();
  });

  it('declara el índice único por hogar y semana', () => {
    expect(ShoppingListSchema.indexes()).toContainEqual([
      { householdId: 1, weekStart: 1 },
      expect.objectContaining({ unique: true }),
    ]);
  });
});
