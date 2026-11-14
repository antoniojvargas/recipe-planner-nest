import { HttpStatus, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ERROR_CODES } from '@recipe-planner/contracts';
import type { FastifyRequest } from 'fastify';
import { AppException } from '../../common/exceptions/app.exception.js';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator.js';
import { HOUSEHOLD_ROLE_KEY } from '../decorators/household-role.decorator.js';
import type { HouseholdRole } from '../household.schema.js';
import { HouseholdsRepository } from '../households.repository.js';

export interface HouseholdRequestContext {
  householdId: string;
  householdRole: HouseholdRole;
}

type RequestWithHousehold = FastifyRequest & {
  user: AuthenticatedUser;
  householdId?: string;
  householdRole?: HouseholdRole;
  params: Record<string, string | undefined>;
};

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

/**
 * Comprueba que el usuario autenticado pertenezca al hogar indicado en la ruta
 * (`:householdId` o `:id`). Si no es miembro responde 404 para no revelar su existencia.
 *
 * Cuando pasa, deja `householdId` y `householdRole` en la petición. Si el handler exige un
 * rol con `@HouseholdRole(...)`, un miembro con otro rol recibe 403.
 */
@Injectable()
export class HouseholdMemberGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly households: HouseholdsRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithHousehold>();
    const paramName = request.params.householdId !== undefined ? 'householdId' : 'id';
    const householdId = request.params.householdId ?? request.params.id;

    if (typeof householdId !== 'string' || householdId.length === 0) {
      throw this.notFound();
    }

    if (!OBJECT_ID_PATTERN.test(householdId)) {
      throw new AppException({
        status: HttpStatus.BAD_REQUEST,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `El parámetro ${paramName} no es un identificador válido`,
        details: [
          { field: paramName, message: 'Debe ser un ObjectId de 24 caracteres hexadecimales' },
        ],
      });
    }

    const household = await this.households.findById(householdId);
    const member = household?.members.find((item) => item.userId.toString() === request.user.id);

    if (household === null || member === undefined) {
      throw this.notFound();
    }

    request.householdId = household._id.toString();
    request.householdRole = member.role;

    const requiredRole = this.reflector.getAllAndOverride<HouseholdRole | undefined>(
      HOUSEHOLD_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredRole !== undefined && member.role !== requiredRole) {
      throw new AppException({
        status: HttpStatus.FORBIDDEN,
        code: ERROR_CODES.FORBIDDEN,
        message: 'No tienes permisos para realizar esta acción en este hogar',
      });
    }

    return true;
  }

  private notFound(): AppException {
    return new AppException({
      status: HttpStatus.NOT_FOUND,
      code: ERROR_CODES.NOT_FOUND,
      message: 'Hogar no encontrado',
    });
  }
}
