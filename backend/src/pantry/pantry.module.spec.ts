import 'reflect-metadata';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { PantryController } from './pantry.controller.js';
import { PantryModule } from './pantry.module.js';

describe('PantryModule', () => {
  it('registra el controlador para que la API exponga las rutas de la despensa', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, PantryModule) as unknown[];

    expect(controllers).toContain(PantryController);
  });
});
