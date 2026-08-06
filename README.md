# NEXUS · Project Intelligence Platform

Aplicación de scoring y priorización de la demanda de iniciativas tecnológicas, con sincronización bidireccional con Azure DevOps.

Este documento explica la **estructura del proyecto**, cómo **editar el frontend**, y la **hoja de ruta** para conectar SSO de Entra ID, base de datos en Azure y hospedaje en Azure App Service.

---

## Estructura

```
nexus/
├── index.html          ← Frontend ensamblado (lo que sirve Vercel/Azure). NO editar a mano.
├── views/              ← Vistas parciales: EDITA AQUÍ cada pantalla
│   ├── _head.html          · <head>, estilos, apertura de <body>
│   ├── _loader.html        · pantalla de carga
│   ├── landing.html        · portada / login
│   ├── _shell-open.html    · barra superior + menú lateral
│   ├── step-summary.html   · Resumen (cartera)
│   ├── step-closed.html    · Proyectos cerrados
│   ├── step-charts.html    · Análisis
│   ├── step-pools.html     · Pools
│   ├── step-sprint.html    · En Marcha
│   ├── step-planning.html  · Planificación
│   ├── step-config.html    · Configuración
│   ├── step-*.html         · resto de pantallas
│   ├── _shell-close.html   · barra derecha + cierres
│   ├── _scripts.html       · carga de los módulos JS
│   └── _order.json         · orden de los steps (no tocar salvo reordenar)
├── js/                 ← Lógica de la app (scoring, ADO, planificación...). Sin cambios.
├── css/main.css        ← Estilos
├── api/                ← Funciones serverless (proxy ADO, almacén). Compatibles Vercel y Azure.
├── build.js            ← Ensambla views/ → index.html
├── server.js           ← Servidor Express (para Azure App Service / local)
├── src/                ← Backend preparado (BD, auth, usuarios)
│   ├── config.js
│   ├── db/             · capa de datos con adaptador intercambiable
│   ├── routes/         · auth (SSO) y users (gestión de acceso)
│   └── middleware/
├── vercel.json         ← Configuración de Vercel (actual)
├── package.json
└── .env.example        ← Plantilla de variables de entorno
```

---

## Editar el frontend

1. Edita la pantalla que quieras en `views/` (p. ej. `views/step-sprint.html`).
2. Regenera el `index.html`:
   ```bash
   npm run build
   ```
3. Sube al repositorio. Vercel desplegará automáticamente.

> El `index.html` es un archivo **generado**. No lo edites directamente: tus cambios se perderían en el siguiente build. Edita siempre en `views/`.

La lógica (carpeta `js/`) no depende del build: son los mismos módulos de siempre.

---

## Ejecutar en local

```bash
npm install
npm run build      # genera index.html desde views/
npm start          # servidor en http://localhost:3000
```

En local, el servidor Express (`server.js`) sirve el frontend y expone `/api`. La base de datos por defecto es `memory` (sin persistencia), así que no necesitas configurar nada para probar.

---

## Despliegue en Vercel (actual)

No cambia respecto a como funciona hoy:

1. Sube el repositorio a GitHub.
2. Conéctalo a Vercel.
3. Vercel sirve el estático (`index.html`, `js/`, `css/`) y ejecuta `api/*.js` como funciones serverless.
4. Define las variables de entorno necesarias (ver `.env.example`) en el panel de Vercel.

`server.js` y `src/` no se usan en Vercel; están preparados para Azure.

---

## Hoja de ruta hacia Azure + SSO

Cuando quieras migrar, estos son los pasos. El código ya está preparado para todos.

### 1. App Registration en Entra ID (para el SSO)

En el portal de Azure → Microsoft Entra ID → App registrations → New registration:

- **Name:** NEXUS
- **Supported account types:** Single tenant (solo mesoestetic.com)
- **Redirect URI (Web):** `https://<tu-app>.azurewebsites.net/api/auth/callback`

Tras crearlo, anota:
- **Application (client) ID** → `AZURE_CLIENT_ID`
- **Directory (tenant) ID** → `AZURE_TENANT_ID`

En **Certificates & secrets** → New client secret → copia el valor → `AZURE_CLIENT_SECRET`.

En **API permissions** → Add a permission → Microsoft Graph:
- `openid`, `profile`, `email`, `User.Read` (delegados, para el login)
- `User.Read.All` o `Directory.Read.All` (de aplicación, para importar usuarios) → **Grant admin consent** (lo hace jvalverde@mesoestetic.com).

### 2. Base de datos Azure SQL

1. Crea un Azure SQL Database.
2. Ejecuta `src/db/schema.sql` en la base de datos (crea las tablas y el admin inicial).
3. Define las variables `AZURE_SQL_*` y `DB_PROVIDER=azure-sql`.

### 3. Azure App Service (hospedaje)

1. Crea un App Service (Node 18+).
2. Configura el despliegue desde GitHub.
3. En Configuration → Application settings, define todas las variables de entorno (ver `.env.example`).
4. El comando de arranque es `npm start` (usa `server.js`).

### 4. Activar

Una vez definidas las variables, el SSO y la gestión de usuarios se activan solos:
- `/api/auth/login` redirige a Microsoft.
- El administrador importa usuarios y concede acceso desde la app.

Mientras las variables no existan, la app funciona con el login actual sin romperse.

---

## Adaptador de base de datos

La app accede a los datos siempre por la misma interfaz (`src/db/index.js`), y el proveedor se elige con `DB_PROVIDER`:

| Valor        | Uso                                             |
|--------------|-------------------------------------------------|
| `memory`     | Local/pruebas, sin persistencia                 |
| `github`     | Almacén actual en GitHub (compatibilidad)       |
| `azure-sql`  | Producción en Azure                             |

Cambiar de uno a otro no requiere tocar código, solo variables de entorno.
