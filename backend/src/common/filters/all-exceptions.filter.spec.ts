import { BadRequestException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { ArgumentsHost } from '@nestjs/common';
import type { ErrorResponse } from '@recipe-planner/contracts';
import { ERROR_CODES } from '@recipe-planner/contracts';
import type { PinoLogger } from 'nestjs-pino';
import { AppException } from '../exceptions/app.exception.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

interface FilterHarness {
  filter: AllExceptionsFilter;
  reply: ReturnType<typeof vi.fn>;
  logError: ReturnType<typeof vi.fn>;
  host: ArgumentsHost;
}

function createHarness(): FilterHarness {
  const reply = vi.fn();
  const logError = vi.fn();
  const adapterHost = {
    httpAdapter: { reply },
  } as unknown as HttpAdapterHost;
  const logger = {
    setContext: vi.fn(),
    error: logError,
  } as unknown as PinoLogger;

  const filter = new AllExceptionsFilter(adapterHost, logger);
  const host = {
    switchToHttp: () => ({ getResponse: () => ({}) }),
  } as unknown as ArgumentsHost;

  return { filter, reply, logError, host };
}

function bodyOf(reply: ReturnType<typeof vi.fn>): ErrorResponse {
  return reply.mock.calls[0][1] as ErrorResponse;
}

function statusOf(reply: ReturnType<typeof vi.fn>): number {
  return reply.mock.calls[0][2] as number;
}

describe('AllExceptionsFilter', () => {
  it('respeta el estado, código y detalles de una AppException', () => {
    const { filter, reply, host } = createHarness();
    const exception = new AppException({
      status: HttpStatus.CONFLICT,
      code: ERROR_CODES.CONFLICT,
      message: 'La receta ya está en el plan',
      details: [{ field: 'recipeId', message: 'Ya asignada' }],
    });

    filter.catch(exception, host);

    expect(statusOf(reply)).toBe(409);
    expect(bodyOf(reply)).toEqual({
      error: {
        code: 'CONFLICT',
        message: 'La receta ya está en el plan',
        details: [{ field: 'recipeId', message: 'Ya asignada' }],
      },
    });
  });

  it('convierte los 400 del ValidationPipe en un detalle por propiedad', () => {
    const { filter, reply, host } = createHarness();
    const exception = new BadRequestException({
      statusCode: 400,
      message: ['name must be a string', 'servings must not be less than 1'],
      error: 'Bad Request',
    });

    filter.catch(exception, host);

    expect(statusOf(reply)).toBe(400);
    expect(bodyOf(reply).error.code).toBe('VALIDATION_ERROR');
    expect(bodyOf(reply).error.details).toEqual([
      { field: 'name', message: 'name must be a string' },
      { field: 'servings', message: 'servings must not be less than 1' },
    ]);
  });

  it('traduce una HttpException 404 con su código', () => {
    const { filter, reply, host } = createHarness();

    filter.catch(new NotFoundException('No existe el hogar'), host);

    expect(statusOf(reply)).toBe(404);
    expect(bodyOf(reply)).toEqual({
      error: { code: 'NOT_FOUND', message: 'No existe el hogar', details: [] },
    });
  });

  it('traduce una HttpException 401 a UNAUTHORIZED', () => {
    const { filter, reply, host } = createHarness();

    filter.catch(new HttpException('Sin sesión', HttpStatus.UNAUTHORIZED), host);

    expect(statusOf(reply)).toBe(401);
    expect(bodyOf(reply).error.code).toBe('UNAUTHORIZED');
  });

  it('convierte un duplicado de Mongo (11000) en 409 CONFLICT', () => {
    const { filter, reply, host } = createHarness();

    filter.catch(Object.assign(new Error('E11000 duplicate key'), { code: 11_000 }), host);

    expect(statusOf(reply)).toBe(409);
    expect(bodyOf(reply).error).toEqual({
      code: 'CONFLICT',
      message: 'El recurso ya existe',
      details: [],
    });
  });

  it('responde 500 sin stack ni mensaje interno para un error desconocido', () => {
    const { filter, reply, logError, host } = createHarness();
    const exception = new Error('fallo interno con detalles sensibles');

    filter.catch(exception, host);

    expect(statusOf(reply)).toBe(500);
    expect(bodyOf(reply)).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor', details: [] },
    });
    expect(JSON.stringify(bodyOf(reply))).not.toContain('sensible');
    expect(logError).toHaveBeenCalledOnce();
  });

  it('oculta el mensaje de una HttpException 500', () => {
    const { filter, reply, host } = createHarness();

    filter.catch(new HttpException('dato sensible', HttpStatus.INTERNAL_SERVER_ERROR), host);

    expect(statusOf(reply)).toBe(500);
    expect(bodyOf(reply).error.message).toBe('Error interno del servidor');
  });

  it('llena details con una lista vacía cuando no hay detalles', () => {
    const { filter, reply, host } = createHarness();

    filter.catch(new HttpException('No autorizado', HttpStatus.FORBIDDEN), host);

    expect(bodyOf(reply).error.details).toEqual([]);
  });
});
