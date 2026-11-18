import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './page';

// Mock fetch globally
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Mock the fetch API for the action
vi.mock('@/app/(auth)/actions', () => ({
  logoutAction: async () => {
    // Mock logout action
  },
  loginAction: async (_prevState: unknown, formData: FormData) => {
    const email = formData.get('email') as string;
    // Simulate successful login
    return {
      status: 'success' as const,
      email,
      fieldErrors: {},
    };
  },
  registerAction: async (_prevState: unknown, formData: FormData) => {
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    return {
      status: 'success' as const,
      name,
      email,
      fieldErrors: {},
    };
  },
}));

// Mock next/navigation redirect
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  redirect: vi.fn(),
}));

// Mock next/headers cookies
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: () => ({ name: 'access_token', value: 'mocked-token' }),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

// Mock the apiFetch
vi.mock('@/server/api', () => ({
  apiFetch: {
    GET: vi.fn(),
    POST: vi.fn(),
  },
}));

describe('LoginPage', () => {
  it('renders the login form', () => {
    render(<LoginPage />);

    expect(screen.getByRole('form')).toBeTruthy();
    expect(screen.getByLabelText('Correo electrónico')).toBeTruthy();
    expect(screen.getByRole('button', { name: /entrar/i })).toBeTruthy();
  });

  it('shows email field and submit button', async () => {
    render(<LoginPage />);

    const emailInput = screen.getByLabelText('Correo electrónico');
    expect(emailInput).toBeTruthy();

    const submitButton = screen.getByRole('button', { name: /entrar/i });
    expect(submitButton).toBeTruthy();
  });

  it('calls loginAction on submit', async () => {
    render(<LoginPage />);

    const user = userEvent.setup();
    const emailInput = screen.getByLabelText('Correo electrónico');
    await user.type(emailInput, 'test@example.com');
    await user.click(screen.getByRole('button', { name: /entrar/i }));

    // Verify the action was called (mocked)
    const { loginAction } = await import('@/app/(auth)/actions');
    expect(loginAction).toHaveBeenCalled();
  });
});
