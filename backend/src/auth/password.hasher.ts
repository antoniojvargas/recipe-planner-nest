import { randomBytes } from 'node:crypto';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import argon2, { type HashOptions } from 'argon2';

/**
 * Parámetros de argon2id. Son explícitos, no los valores por defecto de la librería, para
 * que un cambio de versión no altere en silencio el coste del hash ni el del login fallido.
 * 19 MiB, 2 pasadas y 1 hilo es la recomendación de OWASP para argon2id.
 */
export const ARGON2_OPTIONS: HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
};

/**
 * Hash y verificación de contraseñas con argon2id.
 *
 * El login de un email inexistente verifica contra `dummyHash` en lugar de saltarse la
 * verificación. Así el tiempo y el trabajo de CPU son los mismos que con un usuario real y
 * una contraseña incorrecta; el hash de relleno se genera al arrancar con los mismos
 * parámetros que los reales.
 */
@Injectable()
export class PasswordHasher implements OnModuleInit {
  private dummyHash: Promise<string> | undefined;

  async onModuleInit(): Promise<void> {
    await this.getDummyHash();
  }

  hash(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(passwordHash, password);
    } catch {
      // Un hash con formato inválido no autentica: se trata como contraseña incorrecta.
      return false;
    }
  }

  /** Consume el mismo tiempo que una verificación real y siempre devuelve `false`. */
  async verifyDummy(password: string): Promise<false> {
    await this.verify(await this.getDummyHash(), password);

    return false;
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= argon2.hash(randomBytes(32).toString('hex'), ARGON2_OPTIONS);

    return this.dummyHash;
  }
}
