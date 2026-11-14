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

/** Resultado interno: lo que el controlador convierte en cuerpo y cookies. */
export interface AuthSession extends AuthResponse {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}
