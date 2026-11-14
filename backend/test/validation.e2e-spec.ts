import 'reflect-metadata';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test, type TestingModule } from '@nestjs/testing';
import { Type } from 'class-transformer';
import { IsInt, IsString, Min, MinLength } from 'class-validator';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { ErrorResponse } from '@recipe-planner/contracts';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';
import { ParseObjectIdPipe } from './../src/common/pipes/parse-object-id.pipe.js';
import { Public } from './../src/auth/decorators/public.decorator.js';
import { withFakeInfra } from './support/fake-infra.js';

class CreateRecipeDto {
  @IsString()
  @MinLength(3)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  servings!: number;
}

/** Controlador de prueba: comprueba que los pipes globales llegan a las rutas reales. */
@Public()
@Controller('probe')
class ProbeController {
  @Post()
  create(@Body() body: CreateRecipeDto): CreateRecipeDto {
    return body;
  }

  @Get(':recipeId')
  findOne(@Param('recipeId', ParseObjectIdPipe) recipeId: string): { recipeId: string } {
    return { recipeId };
  }
}

describe('Validación (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await withFakeInfra(
      Test.createTestingModule({
        imports: [AppModule],
        controllers: [ProbeController],
      }),
    ).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('devuelve el cuerpo transformado cuando es válido', async () => {
    const response = await request(app.getHttpServer() as App)
      .post('/api/probe')
      .send({ name: 'Paella', servings: '4' })
      .expect(201);

    expect(response.body).toEqual({ name: 'Paella', servings: 4 });
  });

  it('responde 400 VALIDATION_ERROR con un detalle por propiedad', async () => {
    const response = await request(app.getHttpServer() as App)
      .post('/api/probe')
      .send({ name: 'Pa', servings: 0, sobra: true })
      .expect(400);

    const body = response.body as ErrorResponse;

    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Hay errores de validación en la petición');
    // El orden depende de `class-validator` y de la comprobación de propiedades sobrantes.
    expect(body.error.details.map((detail) => detail.field).sort()).toEqual(
      ['name', 'servings', 'sobra'].sort(),
    );
  });

  it('responde 400 cuando el parámetro de ruta no es un ObjectId', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/api/probe/no-es-un-id')
      .expect(400);

    const body = response.body as ErrorResponse;

    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toEqual([
      { field: 'recipeId', message: 'Debe ser un ObjectId de 24 caracteres hexadecimales' },
    ]);
  });

  it('deja pasar un ObjectId válido', async () => {
    await request(app.getHttpServer() as App)
      .get('/api/probe/507f1f77bcf86cd799439011')
      .expect(200)
      .expect({ recipeId: '507f1f77bcf86cd799439011' });
  });
});
