import 'reflect-metadata';
import mongoose, { Types } from 'mongoose';
import { PantryItem, PantryItemSchema } from './pantry-item.schema.js';

describe('PantryItemSchema', () => {
  const connection = mongoose.createConnection();
  const PantryItemModel = connection.model(PantryItem.name, PantryItemSchema);
  const householdId = new Types.ObjectId();

  afterAll(async () => {
    await connection.close();
  });

  it('normaliza el nombre y valida una unidad del catálogo', async () => {
    const item = new PantryItemModel({
      householdId,
      name: '  Leche Entera ',
      quantity: 1,
      unit: 'l',
    });

    await expect(item.validate()).resolves.toBeUndefined();
    expect(item.name).toBe('leche entera');
    expect(item).toMatchObject({ householdId, quantity: 1, unit: 'l' });
  });

  it('exige hogar, nombre, cantidad y unidad', async () => {
    const error = await new PantryItemModel({})
      .validate()
      .catch((caught: unknown) => caught as mongoose.Error.ValidationError);

    expect(Object.keys(error?.errors ?? {})).toEqual(
      expect.arrayContaining(['householdId', 'name', 'quantity', 'unit']),
    );
  });

  it('rechaza cantidades negativas y unidades fuera del catálogo', async () => {
    const error = await new PantryItemModel({
      householdId,
      name: 'harina',
      quantity: -1,
      unit: 'oz',
    })
      .validate()
      .catch((caught: unknown) => caught as mongoose.Error.ValidationError);

    expect(error?.errors.quantity).toBeDefined();
    expect(error?.errors.unit).toBeDefined();
  });

  it('referencia el hogar', () => {
    expect(PantryItemSchema.path('householdId').options.ref).toBe('Household');
  });

  it('declara el índice de la despensa por hogar y nombre', () => {
    expect(PantryItemSchema.indexes()).toContainEqual([
      { householdId: 1, name: 1 },
      expect.anything(),
    ]);
  });
});
