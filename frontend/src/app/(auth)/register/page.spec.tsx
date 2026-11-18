import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterPage from './page';

vi.mock('@/app/(auth)/actions', () => ({
  logoutAction: async () => {
    // Mock logout action
  },
  loginAction: async (_prevState: unknown, formData: FormData) => {
    const email = formData.get('email') as string;
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

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  redirect: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: () => ({
    get: () => ({ name: 'access_token', value: 'mocked-token' }),
    set: vi.fn(),
    delete: vi.fn(),
  }),
}));

vi.mock('@/server/api', () => ({
  apiFetch: {
    GET: vi.fn(),
    POST: vi.fn(),
  },
}));

describe('RegisterPage', () => {
  it('renders the registration form', () => {
    render(<RegisterPage />);

    expect(screen.getByRole('form')).toBeTruthy();
    expect(screen.getByLabelText('Nombre')).toBeTruthy();
    expect(screen.getByLabelText('Correo electrónico')).toBeTruthy();
    expect(screen.getByRole('button', { name: /crear cuenta/i })).toBeTruthy();
  });

  it('shows name and email fields and submit button', async () => {
    render(<RegisterPage />);

    const nameInput = screen.getByLabelText('Nombre');
    const emailInput = screen.getByLabelText('Correo electrónico');
    expect(nameInput).toBeTruthy();
    expect(emailInput).toBeTruthy();

    const submitButton = screen.getByRole('button', { name: /crear cuenta/i });
    expect(submitButton).toBeTruthy();
  });

  it('calls registerAction on submit with valid data', async () => {
    render(<RegisterPage />);

    const user = userEvent.setup();
    const nameInput = screen.getByLabelText('Nombre');
    const emailInput = screen.getByLabelText('Correo electrónico');

    await user.type(nameInput, 'Juan Pérez');
    await user.type(emailInput, 'juan@example.com');
    await user.click(screen.getByRole('button', { name: /crear cuenta/i }));

    // Verify the action was called
    const { registerAction } = await import('@/app/(auth)/actions');
    expect(registerAction).toHaveBeenCalled();
  });
});
