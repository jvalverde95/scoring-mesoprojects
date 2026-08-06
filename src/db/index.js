/**
 * src/db/index.js — Capa de base de datos con ADAPTADOR INTERCAMBIABLE.
 *
 * El adaptador se elige por la variable de entorno DB_PROVIDER:
 *   - 'memory'    → en memoria (por defecto; útil en local sin BD)
 *   - 'github'    → almacén actual en GitHub (compatibilidad con lo que ya funciona)
 *   - 'azure-sql' → Azure SQL Database (producción)
 *
 * Para migrar de Vercel/GitHub a Azure SQL, basta con cambiar DB_PROVIDER y
 * las variables de conexión. El resto de la app usa siempre la misma interfaz:
 *   db.getPortfolio(key) / db.savePortfolio(key, data)
 *   db.listUsers() / db.setUserAccess(email, allowed) / db.getUser(email)
 */
const provider = (process.env.DB_PROVIDER || 'memory').toLowerCase();

let adapter;
switch (provider) {
  case 'azure-sql':
    adapter = require('./adapters/azure-sql');
    break;
  case 'github':
    adapter = require('./adapters/github');
    break;
  case 'memory':
  default:
    adapter = require('./adapters/memory');
    break;
}

console.log(`  [db] proveedor activo: ${provider}`);

module.exports = adapter;
