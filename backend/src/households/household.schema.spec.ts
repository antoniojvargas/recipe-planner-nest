import 'reflect-metadata';
import mongoose, { Types } from 'mongoose';
import {
  HOUSEHOLD_ROLES,
  Household,
  HouseholdMemberSchema,
  HouseholdSchema,
} from './household.schema.js';

describe('HouseholdSchema', () => {
  const connection = mongoose.createConnection();
  const HouseholdModel = connection.model(Household.name, HouseholdSchema);
  const userId = new Types.ObjectId();

  afterAll(async () => {
    await connection.close();
  });

  it('guarda una membresía con rol e ingreso', async () => {
    const joinedAt = new Date('2026-01-15T12:00:00.000Z');
    const household = new HouseholdModel({
      name: 'Casa',
      members: [{ userId, role: 'owner', joinedAt }],
    });

    await expect(household.validate()).resolves.toBeUndefined();
    expect(household.members[0]).toMatchObject({ userId, role: 'owner', joinedAt });
    expect(HouseholdMemberSchema.options._id).toBe(false);
  });

  it('asigna member y la fecha actual por defecto al miembro', async () => {
    const household = new HouseholdModel({ name: 'Casa', members: [{ userId }] });

    await expect(household.validate()).resolves.toBeUndefined();
    expect(household.members[0].role).toBe('member');
    expect(household.members[0].joinedAt).toBeInstanceOf(Date);
  });

  it('rechaza roles fuera del catálogo', async () => {
    const error = await new HouseholdModel({
      name: 'Casa',
      members: [{ userId, role: 'admin' }],
    })
      .validate()
      .catch((caught: unknown) => caught as mongoose.Error.ValidationError);

    expect(HOUSEHOLD_ROLES).toEqual(['owner', 'member']);
    expect(error?.errors['members.0.role']).toBeDefined();
  });

  it('referencia el usuario de cada membresía', () => {
    expect(HouseholdMemberSchema.path('userId').options.ref).toBe('User');
  });

  it('declara el índice por usuario para listar sus hogares', () => {
    expect(HouseholdSchema.indexes()).toContainEqual([{ 'members.userId': 1 }, expect.anything()]);
  });

  it('oculta inviteCodeHash en las consultas por defecto', () => {
    expect(HouseholdSchema.path('inviteCodeHash').options.select).toBe(false);
  });
});
