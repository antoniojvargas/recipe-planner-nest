import { Expose, Type } from 'class-transformer';

/** Datos públicos del usuario que devuelven `register` y `login`. */
export class AuthUser {
  @Expose()
  id: string;

  @Expose()
  email: string;

  @Expose()
  displayName: string;
}

/** Entrada de dominio de los endpoints de sesión; los DTOs la validan y la cumplen. */
export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

/** Respuesta de los endpoints de sesión: las cookies viajan aparte, en `Set-Cookie`. */
export class AuthResponse {
  @Expose()
  @Type(() => AuthUser)
  user: AuthUser;
}

/** Par de credenciales emitidas; es lo único que devuelve el refresh. */
export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

/** Resultado interno del registro y el login: usuario más las dos credenciales. */
export interface AuthSession extends IssuedSession {
  user: AuthUser;
}
