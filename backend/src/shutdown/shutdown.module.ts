import { Global, Module } from '@nestjs/common';
import { ShutdownService } from './shutdown.service.js';

/** Global para que cualquier módulo registre su tarea de cierre desde `onModuleInit`. */
@Global()
@Module({
  providers: [ShutdownService],
  exports: [ShutdownService],
})
export class ShutdownModule {}
