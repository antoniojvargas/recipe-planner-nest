import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ERROR_CODES } from '@recipe-planner/contracts';
import { Types } from 'mongoose';
import { AppException } from '../common/exceptions/app.exception.js';
import { AUTH_CLOCK, type AuthClock } from '../auth/auth.clock.js';
import type { Household } from './household.schema.js';
import { HouseholdsRepository } from './households.repository.js';
import {
  generateInviteCode,
  hashInviteCode,
  INVITE_CODE_TTL_MS,
  normalizeInviteCode,
} from './invite-code.js';
import type { HouseholdInviteResponse, HouseholdResponse } from './households.types.js';

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

  async createInvite(householdId: string, userId: string): Promise<HouseholdInviteResponse> {
    const household = await this.households.findById(householdId);

    if (household === null) {
      throw new AppException({
        status: HttpStatus.NOT_FOUND,
        code: ERROR_CODES.NOT_FOUND,
        message: 'Hogar no encontrado',
      });
    }

    const isOwner = household.members.some(
      (member) => member.userId.toString() === userId && member.role === 'owner',
    );

    if (!isOwner) {
      throw new AppException({
        status: HttpStatus.FORBIDDEN,
        code: ERROR_CODES.FORBIDDEN,
        message: 'Solo el propietario puede invitar a otros miembros',
      });
    }

    const code = generateInviteCode();
    const expiresAt = new Date(this.clock.now().getTime() + INVITE_CODE_TTL_MS);

    await this.households.setInviteCode(householdId, hashInviteCode(code), expiresAt);

    return { code, expiresAt };
  }

  async joinWithCode(code: string, userId: string): Promise<HouseholdResponse> {
    const normalized = normalizeInviteCode(code);
    const household = await this.households.findByInviteCodeHash(hashInviteCode(normalized));
    const now = this.clock.now();

    if (
      household?.inviteCodeExpiresAt === undefined ||
      household.inviteCodeExpiresAt.getTime() <= now.getTime()
    ) {
      throw new AppException({
        status: HttpStatus.NOT_FOUND,
        code: ERROR_CODES.NOT_FOUND,
        message: 'El código de invitación no es válido o ha caducado',
      });
    }

    if (household.members.some((member) => member.userId.toString() === userId)) {
      throw new AppException({
        status: HttpStatus.CONFLICT,
        code: ERROR_CODES.CONFLICT,
        message: 'Ya eres miembro de este hogar',
      });
    }

    const updated = await this.households.addMember(household._id.toString(), {
      userId: new Types.ObjectId(userId),
      role: 'member',
      joinedAt: now,
    });

    if (updated === null) {
      throw new AppException({
        status: HttpStatus.NOT_FOUND,
        code: ERROR_CODES.NOT_FOUND,
        message: 'Hogar no encontrado',
      });
    }

    return toResponse(updated);
  }
}
