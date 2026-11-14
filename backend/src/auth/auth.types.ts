/** Datos públicos del usuario que devuelven `register` y `login`. */
export interface AuthUser {
  id: string;
  email: string;
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
export interface AuthResponse {
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
