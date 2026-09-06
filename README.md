# Ferregrup

Sistema de gestión de reparto para ferretería (React + TypeScript + Vite + backend propio en Express/Postgres). Todo vive en el backend porque necesita sincronizar datos entre el celular del repartidor y la PC del mostrador.

## Roles y login

Toda la app está detrás de un login único (PIN de 4 dígitos, tabla `staff` en el backend). Hay solo dos roles:

- **`admin`** — el panel del administrador/mostrador, con todo el negocio: Pedidos en calle (activos + historial), Rutas del día (asignar clientes a un repartidor, ver progreso, reordenar), Planificación (listas semanales recurrentes con repartidor fijo), Mapa en vivo, Historial (turnos cerrados, con el detalle de cada parada), Clientes, Catálogo, **Cuentas de clientes** (saldo y detalle de movimientos de cada cliente), **Cobros** (con filtro semanal y recibo imprimible/PDF), **Ventas** (cargar ventas a cuenta de un cliente, asignadas a un repartidor), **Objetivos** (metas semanales/mensuales por repartidor), **Proveedores** (deudas con proveedores, fechas, factura y pago por ECHEQ), Equipo (alta/baja de usuarios) y **Actividad** (log de auditoría de qué hizo cada usuario).
- **`repartidor`** — panel del repartidor: inicio con turno (iniciar/terminar) y sus barras de objetivo semanal/mensual, mi ruta del día (navegar por Google Maps, marcar visitado/problema), pedido en la calle, clientes, catálogo, cobros (ve el saldo del cliente antes de cobrar y puede imprimir/descargar el recibo).

El seed inicial (`npm run seed` dentro de `server/`) crea dos usuarios de ejemplo — `admin` y `repartidor` — ambos con PIN `1234`. **Cambiá esos PIN antes de usarlo en producción**. El login es por usuario + PIN (sin listas desplegables); un `admin` puede crear, editar o desactivar cuentas de cualquiera de los dos roles desde **Equipo** — esto se valida también del lado del servidor, no solo ocultando el botón.

### Cuentas, ventas y objetivos

El saldo de un cliente es simplemente `ventas cargadas - cobros registrados`. El admin carga una venta (panel **Ventas**) a nombre de un cliente y asignada a un repartidor; eso sube el saldo del cliente y cuenta como "vendido" para el objetivo de ese repartidor. Cuando el repartidor cobra (o el admin lo carga desde **Cobros**), el saldo baja y ese monto cuenta como "recaudado". Los objetivos (panel **Objetivos**) se definen por repartidor, por período (semanal empieza un lunes, mensual el día 1) y por un monto en dinero — el admin elige si cuenta lo recaudado, lo vendido o ambos. El repartidor ve el avance como una barra de progreso en su pantalla de Inicio.

### Mapa en vivo y trackers GPS

El **mapa en vivo** (panel admin) funciona hoy por navegador: mientras el repartidor tiene un turno activo, la app le pide permiso de ubicación al celular y manda su posición cada 20s. No requiere ningún hardware — funciona apenas el repartidor abre la app en su teléfono y arranca el turno.

El soporte para **trackers GPS físicos (protocolo GT06)** está en el código (`server/src/gpsTracker/gt06.ts`, pantalla admin → Trackers) pero el servidor TCP que habla ese protocolo **está deshabilitado en producción por ahora**: al ponerlo en el mismo servicio de Railway que sirve la API HTTP, el proxy TCP que Railway arma para exponerlo entró en conflicto con el puerto de la propia API y tumbó todo el backend un rato. Para reactivarlo correctamente hay que correr ese listener en un servicio de Railway aparte (con su propio proxy TCP), no en `ferregrup-api`. Mientras tanto, la sección Trackers del panel admin sigue funcionando para registrar IMEIs, pero ningún dispositivo real puede conectarse todavía.

### Importación de catálogo desde Excel

Panel admin → Catálogo → **Importar Excel**: sube la "Lista de precio vigente" del proveedor (`.xlsx`), muestra una vista previa (código, descripción, precio) y al confirmar **reemplaza** el catálogo completo — lo que no está en el archivo queda inactivo. El parseo es del lado del servidor (`server/src/routes/catalogImport.ts`, con `exceljs`) y detecta automáticamente la fila de encabezados y las columnas Código/Descripción/Precio Lista, tolerando el formato real del archivo del proveedor (encabezados no están en la fila 1, hay columnas de fórmulas intermedias, etc.). Solo admin puede importar; repartidor solo puede buscar en el catálogo ya cargado.

### Qué se dejó afuera a propósito

Se tomó como referencia la app real de reparto de la pinturería (Expo + Express, carpeta `App Del Centro/delcentro-app` en esta misma compu) pero no se portó todo:

- **Captura de foto/firma en la entrega** — en la app original ese flujo existe pero está desconectado (código huérfano, nunca se llega a usar en la práctica), así que no se portó.
- **Arrastrar y soltar para reordenar la ruta** — se implementó con botones subir/bajar en su lugar (mismo resultado, sin la complejidad del drag-and-drop).

El remito (pedido en calle) y el recibo de cobro sí se pueden imprimir y descargar como PDF (botón "Descargar PDF" junto al de imprimir), generado en el navegador con `jspdf` + `html2canvas` — no requiere ningún servicio externo.

Cualquiera de estos se puede sumar después si hace falta.

## Backend de reparto

- Backend: `server/` — ver `server/package.json` para los scripts (`dev`, `build`, `migrate`, `seed`).
- Frontend: `src/reparto/` (`admin/` y `repartidor/` para las pantallas de cada rol, `shared/` para lo que comparten como Clientes y Catálogo).
- Variable de entorno del frontend: `VITE_API_URL` (ver `.env.example`) apuntando a la URL del backend.

## Despliegue

- **Repo**: [github.com/joaquinpiastre/Ferregrup](https://github.com/joaquinpiastre/Ferregrup) (rama `main`).
- **Backend** (`server/`) — Railway, proyecto `ferregrup`, servicio `ferregrup-api` + Postgres: `https://ferregrup-api-production.up.railway.app`. Se sigue desplegando manualmente desde este repo local (no está conectado a GitHub):
  ```
  railway up server --path-as-root --service ferregrup-api
  ```
  Para desarrollo local: copiar `server/.env.example` a `server/.env` con una base Postgres propia (o un proxy TCP temporal a la de Railway), correr `npm run migrate && npm run seed` y luego `npm run dev`.
- **Frontend** — Vercel, proyecto `ferregrup`: **https://ferregrup.vercel.app** — este es el link para usar desde el celular, tablet o cualquier PC sin depender de tu compu. Conectado al repo de GitHub: **cada push a `main` lo redespliega solo**. La variable `VITE_API_URL` está cargada en Vercel (Project Settings → Environment Variables) apuntando al backend de Railway.
  - Para forzar un deploy manual sin pasar por git: `vercel --prod` desde la raíz del proyecto.
  - Nota: el frontend viejo en Railway (`ferregrup-web`, `https://ferregrup-web-production.up.railway.app`) quedó desactualizado y **ya no funciona** (tiene el login viejo, que dependía de un endpoint que ahora requiere sesión). No se borró automáticamente por las dudas, pero conviene eliminarlo (`railway service remove ferregrup-web` o desde el dashboard) para no confundir a nadie que entre ahí por error.

---

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
#   E l - M a n a  
 