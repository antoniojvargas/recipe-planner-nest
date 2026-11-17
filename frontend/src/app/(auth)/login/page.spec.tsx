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
  loginAction: async (prevState, formData) => {
    const email = formData.get('email') as string;
    // Simulate successful login
    return {
      status: 'success' as const,
      email,
      fieldErrors: {},
    };
  },
  registerAction: async (prevState, formData) => {
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
})));

// Mock next/headers cookies
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: () => ({ name: 'access_token', value: 'mocked-token' }),
    set: vi.fn(),
    delete: vi.fn(),
  }),
})));

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

    expect(screen.getByRole('form')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument();
  });

  it('shows email field and submit button', async () => {
    render(<LoginPage />);

    const emailInput = screen.getByLabelText('Correo electrónico');
    expect(emailInput).toBeInTheDocument();

    const submitButton = screen.getByRole('button', { name: /entrar/i });
    expect(submitButton).toBeInTheDocument();
  });

  it('calls loginAction on submit', async () => {
    render(<LoginPage />);

    const user = userEvent.setup();
    const emailInput = screen.getByLabelText('Correo electrónico');
    await user.type(emailInput, 'test@example.com');
    await user.click(screen.getByRole('button', { name: /entrar/i }));

    // Verify the action was called (mocked)
    // @ts-expect-error - testing internal state
    const { loginAction } = await import('@/app/(auth)/actions');
    expect(loginAction).toHaveBeenCalled();
  });
});

describe('RegisterPage', () => {
  it('renders the registration form', () => {
    render(<RegisterPage />);

    expect(screen.getByRole('form')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /crear cuenta/i })).toBeInTheDocument();
  });

  it('shows name and email fields and submit button', async () => {
    render(<RegisterPage />);

    const nameInput = screen.getByLabelText('Nombre');
    const emailInput = screen.getByLabelText('Correo electrónico');
    expect(nameInput).toBeInTheDocument();
    expect(emailInput).toBeInTheDocument();

    const submitButton = screen.getByRole('button', { name: /crear cuenta/i });
    expect(submitButton).toBeInTheDocument();
  });
});