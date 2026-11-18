# Protección de la rama `main`

Este documento describe la configuración de protección recomendada para la rama `main` del repositorio.

## Estado

> **Nota:** en este repositorio (privado, cuenta personal) la API de GitHub devolvió `403` al intentar aplicar la protección de rama (`Upgrade to GitHub Pro or make this repository public to enable this feature`). La configuración debe aplicarse manualmente desde **Settings → Branches → Branch protection rules** (o haciendo el repositorio público / usando un plan que lo permita) con los parámetros indicados abajo.

## Configuración requerida

- **Rama protegida:** `main`
- **Require a pull request before merging:** activado
  - **Require approvals:** recomendado al menos 1 aprobación
  - **Dismiss stale pull request approvals when new commits are pushed:** recomendado
- **Require status checks to pass before merging:** activado
  - **Require branches to be up to date before merging:** recomendado
  - **Checks requeridos (jobs del workflow `CI` en `.github/workflows/ci.yml`):**
    - `lint`
    - `build`
    - `backend-test`
    - `frontend-test`
    - `audit`
    - `e2e`
- **Require conversation resolution before merging:** recomendado
- **Do not allow bypassing the above settings:** recomendado (según política del equipo)
- **Allow force pushes:** desactivado
- **Allow deletions:** desactivado

## Pasos para configurarla en GitHub

1. Ir a **Settings → Branches** del repositorio.
2. En **Branch protection rules**, crear o editar la regla para `main`.
3. Activar las opciones indicadas en la sección anterior.
4. En **Status checks that are required**, buscar y seleccionar los checks `lint`, `build`, `backend-test`, `frontend-test`, `audit` y `e2e` (pueden aparecer tras ejecutar el workflow al menos una vez).
5. Guardar la regla.

## Verificación

- Comprobar que no se permiten pushes directos a `main`.
- Abrir una PR y verificar que no se pueda fusionar hasta que todos los checks requeridos del workflow `CI` estén en verde.
