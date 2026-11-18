import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator.js';
import { TestingService } from './testing.service.js';

/**
 * Endpoints de apoyo para el entorno de pruebas e2e.
 *
 * Este controlador solo se registra cuando `APP_ENV=test`; no existe en desarrollo
 * ni en producción.
 */
@Public()
@Controller('testing')
export class TestingController {
  constructor(private readonly testing: TestingService) {}

  @Post('reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reset(): Promise<void> {
    await this.testing.reset();
  }
}
