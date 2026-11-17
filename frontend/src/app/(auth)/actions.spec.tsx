import { describe, it, expect, vi } from 'vitest';
import { fetch } from 'undici';

// Mock the API endpoints
vi.mock('@/server/api', () => ({
  apiFetch: {
    GET: vi.fn(),
    POST: async (url: string, init: RequestInit) => {
      const body = init.body;

      // Login endpoint
      if (url.includes('/login') && init.method === 'POST') {
        const data = typeof body === 'object' ? body : {};
        // Simulate successful login
        return {
          ok: true,
          json: async () => ({
            success: true,
            user: { id: 'user-1', email: data.email },
          }),
          headers: new Headers({
            'set-cookie': [
              'access_token=new-access; Path=/; HttpOnly; SameSite=Lax; Max-Age=900',
              'refresh_token=new-refresh; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000',
            ],
          }),
        };
      }

      // Register endpoint
      if (url.includes('/register') && init.method === 'POST') {
        const data = typeof body === 'object' ? body : {};
        return {
          ok: true,
          json: async () => ({
            success: true,
            user: { id: 'user-1', name: data.name, email: data.email },
          }),
          headers: new Headers({
            'set-cookie': [
              'access_token=new-access; Path=/; HttpOnly; SameSite=Lax; Max-Age=900',
              'refresh_token=new-refresh; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000',
            ],
          }),
        };
      }

      // Logout endpoint
      if (url.includes('/logout') && init.method === 'POST') {
        return {
          ok: true,
          json: async () => ({ success: true }),
        };
      }

      // Logout-all endpoint
      if (url.includes('/logout-all') && init.method === 'POST') {
        return {
          ok: true,
          json: async () => ({ success: true }),
        };
      }

      // Default error response
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Bad request' } }),
        statusText: 'Bad Request',
      };
    },
  },
}));

// Mock next/headers cookies
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: () => ({ name: 'access_token', value: 'mocked-token' }),
    set: vi.fn(),
    delete: vi.fn(),
  }),
})));

// Mock next/navigation redirect
vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

describe('Server Actions - Auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loginAction', () => {
    it('successfully logs in with valid email', async () => {
      const formData = new FormData();
      formData.append('email', 'test@example.com');

      const result = await import('../actions').then((m) => m.loginAction)(
        { status: 'idle', email: '', fieldErrors: {} } as any,
        formData,
      );

      expect(result).toMatchObject({
        status: 'success',
        email: 'test@example.com',
        fieldErrors: {},
      });
    });

    it('preserves email on validation error', async () => {
      const formData = new FormData();
      // Simulate error by providing invalid setup
      const result = await import('../actions').then((m) => m.loginAction)(
        { status: 'idle', email: '', fieldErrors: {} } as any,
        formData,
      );

      // Should return the email that was passed
      expect(result.email).toBe('test@example.com');
    });
  });

  describe('registerAction', () => {
    it('successfully registers with valid data', async () => {
      const formData = new FormData();
      formData.append('name', 'Juan Pérez');
      formData.append('email', 'juan@example.com');

      const result = await import('../actions').then((m) => m.registerAction)(
        { status: 'idle', name: '', email: '', fieldErrors: {} } as any,
        formData,
      );

      expect(result).toMatchObject({
        status: 'success',
        name: 'Juan Pérez',
        email: 'juan@example.com',
        fieldErrors: {},
      });
    });

    it('preserves name and email on error', async () => {
      const formData = new FormData();
      formData.append('name', 'Juan');
      formData.append('email', 'juan@example.com');

      const result = await import('../actions').then((m) => m.registerAction)(
        { status: 'idle', name: '', email: '', fieldErrors: {} } as any,
        formData,
      );

      expect(result.name).toBe('Juan');
      expect(result.email).toBe('juan@example.com');
    });
  });

  describe('logoutAction', () => {
    it('logs out and redirects', async () => {
      const formData = new FormData();

      const result = await import('../actions').then((m) => m.logoutAction)(
        { status: 'idle' } as any,
        formData,
      );

      expect(result.status).toBe('success');
      // redirect is mocked, just verify it was called
      const { redirect } = await import('next/navigation');
      expect(redirect).toHaveBeenCalled();
    });
  });

  describe('logoutAllAction', () => {
    it('logs out all sessions and redirects', async () => {
      const formData = new FormData();

      const result = await import('../actions').then((m) => m.logoutAllAction)(
        { status: 'idle' } as any,
        formData,
      );

      expect(result.status).toBe('success');
      const { redirect } = await import('next/navigation');
      expect(redirect).toHaveBeenCalled();
    });
  });
});