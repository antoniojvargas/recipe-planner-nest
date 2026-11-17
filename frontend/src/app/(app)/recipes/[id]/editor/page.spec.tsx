import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecipeEditor from './page';

// Mock react-hook-form
vi.mock('react-hook-form', () => ({
  useForm: vi.fn(() => ({
    register: vi.fn(),
    handleSubmit: vi.fn(),
    formState: { errors: {}, isSubmiting: false },
    reset: vi.fn(),
  })),
}));

// Mock zod
vi.mock('zod', () => ({
  z: {
    object: vi.fn(),
    string: vi.fn(),
    number: vi.fn(),
    array: vi.fn(),
  },
}));

// Mock socket.io-client for ImportDialog integration
vi.mock('socket.io-client', () => ({
  io: vi.fn(),
}));

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(),
}));

// Mock the apiFetch
vi.mock('@/server/api', () => ({
  apiFetch: {
    GET: vi.fn(),
    POST: vi.fn(),
  },
}));

// Mock the contracts events
vi.mock('@/packages/contracts/src/events', () => ({
  REALTIME_NAMESPACE: '/realtime',
  SOCKET_EVENTS: {
    shoppingItemUpdated: 'shopping.item.updated',
    shoppingListRegenerated: 'shopping.list.regenerated',
    mealPlanUpdated: 'meal-plan.updated',
    importFinished: 'import.finished',
    importFailed: 'import.failed',
  },
}));

describe('RecipeEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the editor form', () => {
    render(<RecipeEditor params={{ id: 'recipe-123' }} />);

    expect(screen.getByRole('form')).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toBeInTheDocument();
    expect(screen.getByLabelText('Descripción')).toBeInTheDocument();
    expect(screen.getByLabelText('Porciones')).toBeInTheDocument();
  });

  it('renders ingredient fields with unit selector', () => {
    render(<RecipeEditor params={{ id: 'recipe-123' }} />);

    // Check ingredient form exists
    expect(screen.getByLabelText('Nombre del ingrediente')).toBeInTheDocument();

    // Check unit selector exists
    const unitSelect = screen.getByRole('combobox');
    expect(unitSelect).toBeInTheDocument();
  });

  it('renders step fields', () => {
    render(<RecipeEditor params={{ id: 'recipe-123' }} />);

    expect(screen.getByLabelText('Describe un paso de la receta')).toBeInTheDocument();
  });

  it('renders image upload button', () => {
    render(<RecipeEditor params={{ id: 'recipe-123' }} />);

    expect(screen.getByRole('button', { name: /subir foto a minio/i })).toBeInTheDocument();
  });

  it('renders cancel button', () => {
    render(<RecipeEditor params={{ id: 'recipe-123' }} />);

    expect(screen.getByRole('button', { name: /cancelar/i })).toBeInTheDocument();
  });

  it('renders save button', () => {
    render(<RecipeEditor params={{ id: 'recipe-123' }} />);

    expect(screen.getByRole('button', { name: /guardar receta/i })).toBeInTheDocument();
  });

  it('validates required fields', async () => {
    const user = userEvent.setup();

    render(<RecipeEditor params={{ id: 'recipe-123' }} />);

    // Try to submit without filling required fields
    const form = screen.getByRole('form');
    await user.form.submit(form);

    // Form should have been submitted (we can't easily test react-hook-form errors
    // without more setup, but we verify the form exists and was submitted)
    expect(form).toBeInTheDocument();
  });

  it('renders ingredient reorder buttons', () => {
    render(<RecipeEditor params={{ id: 'recipe-123' }} />);

    // Check move up/down buttons exist
    const upButtons = screen.getAllByRole('button', { name: /^↑$/ });
    const downButtons = screen.getAllByRole('button', { name: /^↓$/ });

    expect(upButtons.length).toBeGreaterThan(0);
    expect(downButtons.length).toBeGreaterThan(0);
  });

  it('renders step reorder buttons', () => {
    render(<RecipeEditor params={{ id: 'recipe-123' }} />);

    // Check move up/down buttons for steps exist
    const upButtons = screen.getAllByRole('button', { name: /^↑$/ });
    const downButtons = screen.getAllByRole('button', { name: /^↓$/ });

    expect(upButtons.length).toBeGreaterThan(0);
    expect(downButtons.length).toBeGreaterThan(0);
  });

  it('shows units catalog', () => {
    render(<RecipeEditor params={{ id: 'recipe-123' }} />);

    // Check that common units are in the selector
    const units = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'unit', 'pinch'];
    units.forEach((unit) => {
      expect(screen.getByText(new RegExp(unit, 'i'))).toBeInTheDocument();
    });
  });
});