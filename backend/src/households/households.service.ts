import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ERROR_CODES } from '@recipe-planner/contracts';
import { Types } from 'mongoose';
import { AppException } from '../common/exceptions/app.exception.js';
import { AUTH_CLOCK, type AuthClock } from '../auth/auth.clock.js';
import type { Household } from './household.schema.js';
import { HouseholdsRepository } from './households.repository.js';
import type { HouseholdResponse } from './households.types.js';

function toResponse(household: Household): HouseholdResponse {
  return {
    id: household._id.toString(),
    name: household.name,
    members: household.members.map((member) => ({
      userId: member.userId.toString(),
      role: member.role,
      joinedAt: member.joinedAt,
    })),
    createdAt: household.createdAt,
    updatedAt: household.updatedAt,
  };
}

/**
 * Casos de uso de hogares. No conoce HTTP: devuelve datos de dominio o lanza `AppException`.
 */
@Injectable()
export class HouseholdsService {
  constructor(
    private readonly households: HouseholdsRepository,
    @Inject(AUTH_CLOCK) private readonly clock: AuthClock,
  ) {}

  async create(name: string, userId: string): Promise<HouseholdResponse> {
    const household = await this.households.create({
      name,
      members: [
        {
          userId: new Types.ObjectId(userId),
          role: 'owner',
          joinedAt: this.clock.now(),
        },
      ],
    });

    return toResponse(household);
  }

  async findMine(userId: string): Promise<HouseholdResponse[]> {
    const households = await this.households.findByMember(userId);

    return households.map((household) => toResponse(household));
  }

  async findOneForMember(householdId: string, userId: string): Promise<HouseholdResponse> {
    const household = await this.households.findById(householdId);

    if (household?.members.some((member) => member.userId.toString() === userId) !== true) {
      throw new AppException({
        status: HttpStatus.NOT_FOUND,
        code: ERROR_CODES.NOT_FOUND,
        message: 'Hogar no encontrado',
      });
    }

    return toResponse(household);
  }
}
