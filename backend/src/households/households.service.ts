import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ERROR_CODES } from '@recipe-planner/contracts';
import { Types } from 'mongoose';
import { AppException } from '../common/exceptions/app.exception.js';
import { toResponseDto } from '../common/response.js';
import { AUTH_CLOCK, type AuthClock } from '../auth/auth.clock.js';
import { RealtimeRoomsService } from '../realtime/realtime-rooms.service.js';
import { UsersRepository } from '../users/users.repository.js';
import type { Household } from './household.schema.js';
import { HouseholdsRepository } from './households.repository.js';
import {
  generateInviteCode,
  hashInviteCode,
  INVITE_CODE_TTL_MS,
  normalizeInviteCode,
} from './invite-code.js';
import { HouseholdInviteResponse, HouseholdResponse } from './households.types.js';

/**
 * Casos de uso de hogares. No conoce HTTP: devuelve datos de dominio o lanza `AppException`.
 */
@Injectable()
export class HouseholdsService {
  constructor(
    private readonly households: HouseholdsRepository,
    private readonly users: UsersRepository,
    private readonly rooms: RealtimeRoomsService,
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

    // Crear también es entrar: los sockets abiertos del usuario pasan a escuchar el hogar.
    this.rooms.onJoined(userId, household._id.toString());

    return this.toResponse(household);
  }

  async findMine(userId: string): Promise<HouseholdResponse[]> {
    const households = await this.households.findByMember(userId);

    return Promise.all(households.map((household) => this.toResponse(household)));
  }

  /** Ids de los hogares del usuario; las salas de Socket.IO se construyen con ellos. */
  findIdsForMember(userId: string): Promise<string[]> {
    return this.households.findIdsByMember(userId);
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

    return this.toResponse(household);
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

    return toResponseDto(HouseholdInviteResponse, { code, expiresAt });
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

    this.rooms.onJoined(userId, updated._id.toString());

    return this.toResponse(updated);
  }

  /**
   * Saca al usuario de un hogar. Si era el propietario y quedan miembros, el más antiguo pasa a
   * serlo: un hogar sin propietario no podría emitir invitaciones. El último miembro no puede
   * salir porque el hogar quedaría huérfano y borrarlo arrastraría recetas, planes y listas.
   */
  async leave(householdId: string, userId: string): Promise<void> {
    const household = await this.households.findById(householdId);
    const member = household?.members.find((item) => item.userId.toString() === userId);

    if (household === null || member === undefined) {
      throw new AppException({
        status: HttpStatus.NOT_FOUND,
        code: ERROR_CODES.NOT_FOUND,
        message: 'Hogar no encontrado',
      });
    }

    if (household.members.length === 1) {
      throw new AppException({
        status: HttpStatus.CONFLICT,
        code: ERROR_CODES.CONFLICT,
        message: 'El último miembro no puede salir del hogar',
      });
    }

    const updated = await this.households.removeMember(householdId, userId);

    if (updated === null) {
      throw new AppException({
        status: HttpStatus.NOT_FOUND,
        code: ERROR_CODES.NOT_FOUND,
        message: 'Hogar no encontrado',
      });
    }

    if (member.role === 'owner') {
      const [nextOwner] = [...updated.members].sort(
        (a, b) => a.joinedAt.getTime() - b.joinedAt.getTime(),
      );

      await this.households.setMemberRole(householdId, nextOwner.userId.toString(), 'owner');
    }

    this.rooms.onLeft(userId, householdId);
  }

  /**
   * Respuesta pública del hogar con el nombre de cada miembro.
   *
   * Los nombres se resuelven en una sola consulta: la lista de la compra muestra quién marcó
   * cada ítem y necesita el nombre sin pedir el perfil de cada miembro por separado.
   */
  private async toResponse(household: Household): Promise<HouseholdResponse> {
    const users = await this.users.findByIds(
      household.members.map((member) => member.userId.toString()),
    );
    const displayNames = new Map(users.map((user) => [user._id.toString(), user.displayName]));

    return toResponseDto(HouseholdResponse, {
      id: household._id.toString(),
      name: household.name,
      members: household.members.map((member) => {
        const userId = member.userId.toString();

        return {
          userId,
          displayName: displayNames.get(userId) ?? '',
          role: member.role,
          joinedAt: member.joinedAt,
        };
      }),
      createdAt: household.createdAt,
      updatedAt: household.updatedAt,
    });
  }
}
