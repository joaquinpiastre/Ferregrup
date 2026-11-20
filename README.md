# Ferregrup

Sistema de gestión de reparto para ferretería (React + TypeScript + Vite + backend propio en Express/Postgres). Todo vive en el backend porque necesita sincronizar datos entre el celular del repartidor y la PC del mostrador.

## Roles y login

Toda la app está detrás de un login único (PIN de 4 dígitos, tabla `staff` en el backend). Hay tres roles:

- **`admin`** — el panel del administrador/mostrador, con todo el negocio: Pedidos en calle (activos + historial), Rutas del día (asignar clientes a un repartidor, ver progreso, reordenar), Planificación (listas semanales recurrentes con repartidor fijo), Mapa en vivo, Historial (turnos cerrados, con el detalle de cada parada), Clientes, Catálogo, **Cuentas de clientes** (saldo y detalle de movimientos de cada cliente), **Cobros** (con filtro semanal y recibo imprimible/PDF), **Ventas** (cargar ventas a cuenta de un cliente, asignadas a un repartidor), **Atrasados** (clientes con cuotas vencidas sin cobrar), **Objetivos** (cuotas a cobrar por semana de cada repartidor, con historial), **Proveedores** (deudas con proveedores, fechas, factura y pago por ECHEQ), Equipo (alta/baja de usuarios), **Actividad** (log de auditoría de qué hizo cada usuario), **Asistente IA** e **Inteligencia artificial** (configuración y gastos de la IA; ver más abajo).
- **`repartidor`** — panel del repartidor: inicio con turno (iniciar/terminar) y sus barras de objetivo semanal/mensual, mi ruta del día (navegar por Google Maps, marcar visitado/problema), pedido en la calle, clientes, catálogo, cobros (ve el saldo del cliente antes de cobrar y puede imprimir/descargar el recibo).
- **`vendedor`** — panel del vendedor: vende y cobra pero no reparte (no tiene ruta, turno con GPS ni pedido en calle). Ve inicio con su objetivo semanal y accesos rápidos, asistente IA, ventas y cobros a su nombre, **cotizaciones** (las suyas), cuentas corrientes, atrasados de sus ventas, catálogo y **stock con precios** (solo para mirar; no ve el costo ni puede ajustar). A las ventas y cobros que carga el admin se les puede asignar un repartidor o un vendedor, y los vendedores aparecen en Objetivos como cualquier repartidor.

El seed inicial (`npm run seed` dentro de `server/`) crea dos usuarios de ejemplo — `admin` y `repartidor` — ambos con PIN `1234`. **Cambiá esos PIN antes de usarlo en producción**. El login es por usuario + PIN (sin listas desplegables); un `admin` puede crear, editar o desactivar cuentas de cualquiera de los tres roles desde **Equipo** — esto se valida también del lado del servidor, no solo ocultando el botón.

### Cuentas, ventas y objetivos

El saldo de un cliente es simplemente `ventas cargadas - cobros registrados`. El admin carga una venta (panel **Ventas**) a nombre de un cliente y asignada a un repartidor; eso sube el saldo del cliente y cuenta como "vendido" para el objetivo de ese repartidor. Cuando el repartidor cobra (o el admin lo carga desde **Cobros**), el saldo baja y ese monto cuenta como "recaudado". Las ventas pueden ser en cuotas **semanales** (la 1ª en la fecha elegida, las demás cada 7 días). El **objetivo** de cada repartidor ya no se carga a mano: en cada semana (lunes a domingo) es la suma de las cuotas de sus ventas que vencen esa semana **más lo que quedó sin cobrar de semanas anteriores**. Lo cobrado es lo aplicado a esas cuotas durante la semana (en Cobros hay que elegir a qué cuota corresponde el pago; un "pago general" no baja ningún atraso). El panel **Objetivos** guarda el historial semana a semana (cuotas, arrastre, objetivo, cobrado y cuánto faltó) y muestra las próximas 4 semanas. El panel **Atrasados** lista solo lo vencido en semanas anteriores y todavía no cobrado, por cliente, con cuántas cuotas se atrasó y hace cuántas semanas.

### Cuentas corrientes: próximo pago, atrasos y clientes por vendedor

En **Cuentas corrientes** cada cliente muestra, además del saldo, qué le toca pagar: cuánto tiene **atrasado** (cuotas vencidas en semanas anteriores, igual que el panel Atrasados), cuánto le **vence esta semana** y la fecha y el monto de su **próximo pago**. Arriba están los totales (adeudado, atrasado, vence esta semana) y se puede filtrar por vendedor y por estado (con deuda, atrasados, vencen esta semana, sin deuda) y ordenar por deuda, próximo vencimiento, atraso o nombre. El vendedor de un cliente es el de su venta más reciente. Repartidores y vendedores arrancan viendo **"Mis clientes"** (también en Clientes) y pueden pasar a ver todos. Las listas largas se muestran de a 100.

El panel **Objetivos** muestra el historial de las últimas 12 semanas y las próximas 4; Objetivos y Atrasados se calculan solo con las cuotas que todavía importan para esas semanas y el resultado se guarda unos segundos (se descarta apenas se carga, corrige o borra una venta o un cobro), porque esas pantallas se refrescan solas.

### Cuentas corrientes históricas (importadas de Excel)

El 19/11/2026 se cargaron las cuentas corrientes que los repartidores llevaban en planillas de Excel (una por cliente): 918 clientes con sus compras, planes de cuotas y cobros. Todo lo importado tiene ids que empiezan con `imp-` (clientes `imp-<repartidor>-NNN`, ventas `…-vN`, cuotas `…-cN`, cobros `…-pN`) y quedó asignado al repartidor dueño de la planilla. Criterios usados:

- El saldo de cada cliente es el que surge de su planilla, calculado como lo hacía esa planilla ("cuotas − pagado" en la mayoría, "productos − pagado" en las de entregas variables).
- Los cobros se aplicaron en orden a las cuotas de su compra (si alguien pagó de más en una cuota, el excedente cubre la siguiente). Restos menores a $1.000 quedan en el saldo pero no como cuota atrasada.
- La próxima cuota impaga vence un período después del último pago de esa compra (7 días; 14 o 30 si la planilla decía quincenal/mensual o así venía pagando) y las siguientes, una por período.
- Los ítems importados no tienen código de catálogo (va en el texto), así que no tocaron ni tocan el stock.

Las planillas originales y el informe de la importación no están en el repo (carpeta `CUENTA_CORRIENTE/`, ignorada por git porque son datos de clientes).

### Mapa en vivo y trackers GPS

El **mapa en vivo** (panel admin) funciona hoy por navegador: mientras el repartidor tiene un turno activo, la app le pide permiso de ubicación al celular y manda su posición cada 20s. No requiere ningún hardware — funciona apenas el repartidor abre la app en su teléfono y arranca el turno.

El soporte para **trackers GPS físicos (protocolo GT06)** está en el código (`server/src/gpsTracker/gt06.ts`, pantalla admin → Trackers) pero el servidor TCP que habla ese protocolo **está deshabilitado en producción por ahora**: al ponerlo en el mismo servicio de Railway que sirve la API HTTP, el proxy TCP que Railway arma para exponerlo entró en conflicto con el puerto de la propia API y tumbó todo el backend un rato. Para reactivarlo correctamente hay que correr ese listener en un servicio de Railway aparte (con su propio proxy TCP), no en `ferregrup-api`. Mientras tanto, la sección Trackers del panel admin sigue funcionando para registrar IMEIs, pero ningún dispositivo real puede conectarse todavía.

### Catálogo: costo, IVA, precio de venta y proveedor

Cada producto tiene **precio de venta** (final, con IVA: es lo que ven y cobran repartidores y vendedores), **IVA**, **costo sin IVA** y **proveedor** (de qué lista sale). Costo y proveedor solo los ve el admin: la API no los manda a otros roles y el asistente de IA tampoco los muestra. En Catálogo el admin ve además el **costo con IVA** (costo × (1 + IVA)) y la **ganancia** en %, medida contra el costo con IVA, y puede filtrar por proveedor.

El catálogo se arma con las listas de precios de cada proveedor. Cada proveedor tiene su propia regla para sacar de su lista el costo y el precio de venta (descuentos, envío, IVA, ganancia). Esas reglas son datos del negocio y no se guardan en el repo. Al actualizar una lista hay que aplicar la regla de ese proveedor y tocar solo sus productos; en cada carga conviene controlar que los códigos no choquen con los de otra lista.

La búsqueda de productos (`src/reparto/shared/catalogSearch.ts`) es la misma en todas las pantallas. Arma una sola vez el texto de búsqueda de cada producto y encuentra las palabras en cualquier orden ("taladro bosch"), porque el catálogo tiene miles de productos.

### Importación de catálogo desde Excel (se sacó)

Hasta noviembre de 2026 Catálogo tenía un botón **Importar Excel** que reemplazaba el catálogo entero con un archivo. Ese botón tomaba el precio de lista del proveedor como precio de venta, no cargaba costos y daba de baja todo lo que no estuviera en el archivo. Con varias listas de proveedores, cada una con su regla de precios, eso pisaba los precios de venta y daba de baja los productos de los otros proveedores, así que se sacaron el botón y la ruta `/catalog/import/*`.

### Asistente de IA

Cada usuario (admin y repartidor) tiene su **Asistente IA** en el menú: un chat propio (nadie más ve sus conversaciones) que consulta los datos reales del negocio y, si tiene permiso, también los modifica. Usa los modelos Claude de Anthropic a través de la API (`server/src/ai/`).

- **Qué puede hacer**: consultar catálogo, stock, clientes, cuentas corrientes, ventas, cobros, atrasados y objetivos; el admin además listas de reparto, proveedores, camioneta, equipo y actividad. Con permiso de cambios: crear/editar/dar de baja productos, ajustar stock, cambiar precios (uno o masivo por porcentaje, monto o precio fijo, con redondeo), clientes, listas de reparto, proveedores y sus deudas, movimientos de la camioneta, ventas y cobros.
- **Qué no puede hacer**: no toca el código ni la configuración del sistema, los usuarios, los PIN ni la configuración de la IA, y no borra ventas ni cobros. Las consultas son de solo lectura y **todos los cambios pasan por las mismas rutas de la API que usa la pantalla**, con un token interno del propio usuario: heredan sus permisos de rol, las validaciones y transacciones, y quedan en **Actividad** marcados con `[IA]`.
- **Confirmación**: antes de aplicar un cambio, el chat muestra un resumen ("TAL-001: stock 0 → 10", "Aumentar 10% a 37 productos", con ejemplos) y el usuario lo confirma o cancela con un botón. Se puede desactivar en la configuración (no recomendado).
- **Administración → Inteligencia artificial** (solo admin): activar/desactivar la IA, elegir el modelo (Opus 5.5 recomendado, Sonnet 5.5, Haiku 5.5 o Fable 5.2, cada uno con para qué sirve, velocidad y costo aproximado por pregunta), cuánto razona, el límite mensual de gasto por usuario y del equipo, y por cada usuario: acceso (sin acceso / solo consultas / consultas y cambios), un modelo distinto y su propio límite. Muestra cuánto gastó cada uno este mes y el anterior, y el consumo por modelo. Por defecto los admin tienen "consultas y cambios" y los repartidores "solo consultas", con US$ 5 por mes cada uno.
- **Configuración**: la API key va en la variable de entorno `ANTHROPIC_API_KEY` del servicio `ferregrup-api` en Railway (nunca llega al navegador). Sin ella el resto del sistema funciona igual y el asistente avisa que falta configurarlo. El botón "Probar conexión" verifica la clave y qué modelos tiene disponibles la cuenta.
- **Costos**: se registra el costo de cada llamada en `ai_usage` (aunque se borre el chat) y el asistente se corta al llegar al límite. El historial se guarda tal cual se manda a la API (columna `json`, no `jsonb`, para no reordenar claves) y solo se le agregan mensajes: así el caché de prompts abarata las conversaciones largas.

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
- **Frontend** — Vercel, proyecto `ferregrup`: **https://distribuidoraelmana.com.ar** — este es el link para usar desde el celular, tablet o cualquier PC sin depender de tu compu. `www.distribuidoraelmana.com.ar` redirige al dominio principal y `https://ferregrup.vercel.app` sigue funcionando. El dominio está registrado en NIC.ar y delegado a los DNS de Vercel (`ns1.vercel-dns.com` / `ns2.vercel-dns.com`), que maneja los registros y el certificado SSL. Conectado al repo de GitHub: **cada push a `main` lo redespliega solo**. La variable `VITE_API_URL` está cargada en Vercel (Project Settings → Environment Variables) apuntando al backend de Railway.
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
#   E l - M a n a 
