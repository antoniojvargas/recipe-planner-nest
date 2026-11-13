import { Logger, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { databaseConfig, type DatabaseConfig } from '../config/index.js';

/** Tiempo máximo que Mongo tiene para aceptar una conexión antes de que el ping falle. */
const MONGO_SERVER_SELECTION_TIMEOUT_MS = 2_000;

const logger = new Logger('MongoDB');

/**
 * Conexión única a MongoDB, compartida por todos los repositorios.
 *
 * `lazyConnection` deja que la API arranque aunque Mongo todavía no esté: el health check
 * responde 503 y el orquestador reinicia el contenedor si sigue caído. Si se esperara la
 * conexión, la app no llegaría a escuchar y no habría forma de consultar su estado.
 */
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [databaseConfig.KEY],
      useFactory: (config: DatabaseConfig) => ({
        uri: config.mongoUrl,
        lazyConnection: true,
        serverSelectionTimeoutMS: MONGO_SERVER_SELECTION_TIMEOUT_MS,
        onConnectionCreate: (connection) => {
          // Sin listener, un fallo de conexión emite `error` en el EventEmitter y tumba el proceso.
          connection.on('error', (error: Error) => {
            logger.error(`Error de conexión con MongoDB: ${error.message}`);
          });
        },
      }),
    }),
  ],
})
export class DatabaseModule {}
