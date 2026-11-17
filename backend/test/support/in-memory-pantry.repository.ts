import type { PantryItemInput } from '../src/pantry/pantry.repository.js';

/** Repositorio de despensa en memoria para pruebas de integración. */
export class InMemoryPantryRepository {
  readonly items: { name: string; quantity: number; unit: string; householdId: string }[] = [];

  async findByHousehold(householdId: string): Promise<{ name: string; quantity: number; unit: string }[]> {
    return this.items
      .filter((item) => item.householdId === householdId)
      .map(({ name, quantity, unit }) => ({ name, quantity, unit }));
  }

  async upsert(householdId: string, item: PantryItemInput): Promise<{ name: string; quantity: number; unit: string } | null> {
    const normalizedName = item.name.trim().toLowerCase();

    // Buscar si ya existe con ese nombre normalizado
    const existingIndex = this.items.findIndex(
      (item) => item.householdId === householdId && item.name.trim().toLowerCase() === normalizedName,
    );

    if (existingIndex >= 0) {
      // Actualizar cantidad y unidad
      this.items[existingIndex].quantity = item.quantity;
      this.items[existingIndex].unit = item.unit;
      return { name: this.items[existingIndex].name, quantity: this.items[existingIndex].quantity, unit: this.items[existingIndex].unit };
    } else {
      // Crear nuevo artículo
      const newItem = {
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        householdId,
      };
      this.items.push(newItem);
      return { name: newItem.name, quantity: newItem.quantity, unit: newItem.unit };
    }
  }

  async remove(householdId: string, name: string): Promise<boolean> {
    const normalizedName = name.trim().toLowerCase();
    const initialLength = this.items.length;

    this.items = this.items.filter(
      (item) => item.householdId !== householdId || item.name.trim().toLowerCase() !== normalizedName,
    );

    return this.items.length < initialLength;
  }
}