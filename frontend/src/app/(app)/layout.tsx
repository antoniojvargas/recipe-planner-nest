/**
 * Layout común de las vistas autenticadas.
 *
 * Aporta el landmark `main` del que carecían recetas, editor, plan y lista: sin él, los
 * lectores de pantalla no pueden saltar al contenido principal y todo queda fuera de un
 * landmark (reglas `landmark-one-main` y `region` de axe).
 */
export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <main>{children}</main>;
}
