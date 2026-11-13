import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';

export interface ShutdownTask {
  /** Nombre que aparece en el log del apagado. */
  name: string;
  /** Posición en la secuencia; menor se cierra antes (`SHUTDOWN_ORDER`). */
  order: number;
  close: () => Promise<void> | void;
}

/**
 * Cierre ordenado de los recursos de la API.
 *
 * Nest cierra el servidor HTTP antes de `onApplicationShutdown`, así que cuando corren estas
 * tareas ya no entran peticiones nuevas y las que estaban en curso han terminado. Después se
 * cierran los recursos en orden: primero lo que deja de aceptar trabajo (sockets, colas) y al
 * final Redis y Mongo.
 *
 * Un recurso que falle al cerrarse no impide cerrar los demás: el error se registra y la
 * secuencia continúa, para no dejar conexiones abiertas por un fallo puntual.
 */
@Injectable()
export class ShutdownService implements OnApplicationShutdown {
  private readonly logger = new Logger(ShutdownService.name);
  private readonly tasks: ShutdownTask[] = [];
  private isShuttingDown = false;

  register(task: ShutdownTask): void {
    this.tasks.push(task);
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    // Una segunda señal durante el apagado no debe repetir el cierre.
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    this.logger.log(signal ? `Apagado ordenado (${signal})` : 'Apagado ordenado');

    const ordered = [...this.tasks].sort((a, b) => a.order - b.order);

    for (const task of ordered) {
      const startedAt = Date.now();

      try {
        await task.close();
        this.logger.log(`${task.name} cerrado en ${String(Date.now() - startedAt)} ms`);
      } catch (error) {
        this.logger.error(
          `No se pudo cerrar ${task.name}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}
