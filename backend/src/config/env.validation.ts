import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
  type ValidationError,
} from 'class-validator';

/** Sufijo de las variables que apuntan a un fichero con el secreto (Docker secrets). */
export const FILE_SUFFIX = '_FILE';

export const APP_ENVIRONMENTS = ['development', 'test', 'production'] as const;
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export class EnvironmentVariables {
  @Matches(/^mongodb(\+srv)?:\/\/\S+$/, {
    message: 'MONGO_URL debe ser una URL mongodb:// o mongodb+srv://',
  })
  MONGO_URL!: string;

  @Matches(/^rediss?:\/\/\S+$/, { message: 'REDIS_URL debe ser una URL redis:// o rediss://' })
  REDIS_URL!: string;

  @IsUrl({ require_tld: false, require_protocol: true })
  S3_ENDPOINT!: string;

  @IsUrl({ require_tld: false, require_protocol: true })
  S3_PUBLIC_ENDPOINT!: string;

  @IsString()
  @IsNotEmpty()
  S3_BUCKET!: string;

  @IsString()
  @IsNotEmpty()
  S3_ACCESS_KEY!: string;

  @IsString()
  @IsNotEmpty()
  S3_SECRET_KEY!: string;

  @IsString()
  @MinLength(32, {
    message: 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres',
  })
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(32, {
    message: 'JWT_REFRESH_SECRET debe tener al menos 32 caracteres',
  })
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  SMTP_HOST!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65_535)
  SMTP_PORT!: number;

  @IsString()
  @IsNotEmpty()
  MAIL_FROM!: string;

  @IsIn(APP_ENVIRONMENTS)
  APP_ENV!: (typeof APP_ENVIRONMENTS)[number];

  @IsIn(LOG_LEVELS)
  LOG_LEVEL!: (typeof LOG_LEVELS)[number];

  @IsUrl({ require_tld: false, require_protocol: true })
  FRONTEND_URL!: string;

  @IsUrl({ require_tld: false, require_protocol: true })
  API_INTERNAL_URL!: string;
}

/**
 * Sustituye cada `*_FILE` por el contenido del fichero en la variable sin sufijo.
 * El valor plano siempre gana: si `JWT_ACCESS_SECRET` ya tiene valor, su `_FILE` se ignora.
 */
export function resolveFileSecrets(env: Record<string, unknown>): Record<string, string> {
  const resolved: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') {
      resolved[key] = value;
    }
  }

  for (const [key, filePath] of Object.entries(env)) {
    if (!key.endsWith(FILE_SUFFIX) || key.length === FILE_SUFFIX.length) {
      continue;
    }

    const target = key.slice(0, -FILE_SUFFIX.length);
    // El valor plano siempre gana.
    if (Object.hasOwn(resolved, target) && resolved[target] !== '') {
      continue;
    }

    if (typeof filePath !== 'string' || filePath === '') {
      throw new Error(`${key} debe apuntar a la ruta de un fichero con el secreto`);
    }

    const secret = readSecretFile(key, filePath);

    resolved[target] = secret;
    // Las fábricas de `registerAs` leen `process.env`, igual que los paquetes de terceros.
    process.env[target] = secret;
  }

  return resolved;
}

function readSecretFile(variable: string, filePath: string): string {
  let contents: string;

  try {
    contents = readFileSync(filePath, 'utf8');
  } catch {
    throw new Error(`${variable}: no se pudo leer el fichero "${filePath}"`);
  }

  const secret = contents.trim();

  if (secret === '') {
    throw new Error(`${variable}: el fichero "${filePath}" está vacío`);
  }

  return secret;
}

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const resolved = resolveFileSecrets(config);
  const instance = plainToInstance(EnvironmentVariables, resolved, {
    enableImplicitConversion: false,
  });

  const errors = validateSync(instance, {
    whitelist: true,
    forbidUnknownValues: true,
    skipMissingProperties: false,
    stopAtFirstError: true,
  });

  if (errors.length > 0) {
    throw new Error(`Configuración inválida:\n${formatErrors(errors).join('\n')}`);
  }

  return instance;
}

function formatErrors(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => {
    const messages = Object.values(error.constraints ?? {});

    return messages.length > 0 ? messages.map((message) => `  - ${message}`) : [];
  });
}
