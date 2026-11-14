import 'reflect-metadata';
import { HttpStatus, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { Types } from 'mongoose';
import { AppException } from '../../common/exceptions/app.exception.js';
import type { Household } from '../household.schema.js';
import type { HouseholdsRepository } from '../households.repository.js';
import { HOUSEHOLD_ROLE_KEY, HouseholdRole } from '../decorators/household-role.decorator.js';
import { HouseholdMemberGuard } from './household-member.guard.js';

function createContext(
  params: Record<string, string | undefined>,
  userId = '507f1f77bcf86cd799439011',
) {
  const request = {
    params,
    user: { id: userId, familyId: 'family' },
  } as {
    params: Record<string, string | undefined>;
    user: { id: string; familyId: string };
    householdId?: string;
    householdRole?: string;
  };

  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;

  return { context, request };
}

async function captureError(promise: Promise<unknown>): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppException);
    return error as AppException;
  }

  throw new Error('Se esperaba un AppException');
}

describe('HouseholdMemberGuard', () => {
  const householdId = new Types.ObjectId().toString();
  const memberId = new Types.ObjectId().toString();
  const ownerId = new Types.ObjectId().toString();

  function buildGuard(household: Household | null, requiredRole?: 'owner' | 'member') {
    const households = { findById: vi.fn().mockResolvedValue(household) };
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(requiredRole),
    };
    const guard = new HouseholdMemberGuard(
      reflector as unknown as Reflector,
      households as unknown as HouseholdsRepository,
    );

    return { guard, households, reflector };
  }

  it('deja el rol y el householdId en la petición cuando el usuario es miembro', async () => {
    const household = {
      _id: new Types.ObjectId(householdId),
      members: [{ userId: new Types.ObjectId(memberId), role: 'member', joinedAt: new Date() }],
    } as unknown as Household;
    const { guard } = buildGuard(household);
    const { context, request } = createContext({ householdId }, memberId);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.householdId).toBe(householdId);
    expect(request.householdRole).toBe('member');
  });

  it('acepta el parámetro :id cuando no hay :householdId', async () => {
    const household = {
      _id: new Types.ObjectId(householdId),
      members: [{ userId: new Types.ObjectId(ownerId), role: 'owner', joinedAt: new Date() }],
    } as unknown as Household;
    const { guard } = buildGuard(household);
    const { context, request } = createContext({ id: householdId }, ownerId);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.householdRole).toBe('owner');
  });

  it('responde 404 si el hogar no existe o el usuario no es miembro', async () => {
    const existing = {
      _id: new Types.ObjectId(householdId),
      members: [{ userId: new Types.ObjectId(ownerId), role: 'owner', joinedAt: new Date() }],
    } as unknown as Household;

    for (const household of [null, existing]) {
      const { guard } = buildGuard(household);
      const { context } = createContext({ householdId }, memberId);
      const error = await captureError(guard.canActivate(context));

      expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('Hogar no encontrado');
    }
  });

  it('responde 404 si falta el parámetro de hogar en la ruta', async () => {
    const { guard, households } = buildGuard(null);
    const { context } = createContext({}, memberId);
    const error = await captureError(guard.canActivate(context));

    expect(error.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(households.findById).not.toHaveBeenCalled();
  });

  it('con @HouseholdRole("owner") permite al owner y rechaza a un miembro con 403', async () => {
    const household = {
      _id: new Types.ObjectId(householdId),
      members: [
        { userId: new Types.ObjectId(ownerId), role: 'owner', joinedAt: new Date() },
        { userId: new Types.ObjectId(memberId), role: 'member', joinedAt: new Date() },
      ],
    } as unknown as Household;

    const ownerCase = buildGuard(household, 'owner');
    await expect(
      ownerCase.guard.canActivate(createContext({ householdId }, ownerId).context),
    ).resolves.toBe(true);

    const memberCase = buildGuard(household, 'owner');
    const error = await captureError(
      memberCase.guard.canActivate(createContext({ householdId }, memberId).context),
    );

    expect(error.getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(error.code).toBe('FORBIDDEN');
  });

  it('el decorador HouseholdRole registra el rol requerido', () => {
    class TestController {
      @HouseholdRole('owner')
      handler(): string {
        return 'ok';
      }
    }

    const handler = Object.getOwnPropertyDescriptor(TestController.prototype, 'handler')?.value as
      object | undefined;
    const metadata = Reflect.getMetadata(HOUSEHOLD_ROLE_KEY, handler ?? {}) as unknown;

    expect(metadata).toBe('owner');
  });
});
