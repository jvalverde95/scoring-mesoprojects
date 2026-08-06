/**
 * Adaptador Azure SQL Database — para producción.
 *
 * Se activa con DB_PROVIDER=azure-sql y las variables de conexión:
 *   AZURE_SQL_SERVER    (p.ej. miservidor.database.windows.net)
 *   AZURE_SQL_DATABASE
 *   AZURE_SQL_USER
 *   AZURE_SQL_PASSWORD
 *
 * Requiere el paquete 'mssql' (está en optionalDependencies del package.json;
 * se instala con `npm install mssql`). El esquema de tablas está en
 * src/db/schema.sql — créalo en tu base de datos antes de usar este adaptador.
 *
 * Mientras no configures Azure, este adaptador no se carga (DB_PROVIDER por
 * defecto es 'memory'), así que la app sigue funcionando sin él.
 */
let sql = null;
try { sql = require('mssql'); } catch (_) { /* mssql no instalado aún */ }

const config = {
  server:   process.env.AZURE_SQL_SERVER   || '',
  database: process.env.AZURE_SQL_DATABASE || '',
  user:     process.env.AZURE_SQL_USER     || '',
  password: process.env.AZURE_SQL_PASSWORD || '',
  options: { encrypt: true, trustServerCertificate: false },
  pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

let _pool = null;
async function pool() {
  if (!sql) throw new Error("Falta el paquete 'mssql'. Ejecuta: npm install mssql");
  if (!config.server) throw new Error('Azure SQL no configurado (AZURE_SQL_SERVER, etc.)');
  if (!_pool) _pool = await sql.connect(config);
  return _pool;
}

module.exports = {
  async getPortfolio(key) {
    const p = await pool();
    const r = await p.request().input('k', sql.NVarChar, key)
      .query('SELECT data FROM Portfolios WHERE [key] = @k');
    if (!r.recordset.length) return null;
    try { return JSON.parse(r.recordset[0].data); } catch { return null; }
  },
  async savePortfolio(key, data) {
    const p = await pool();
    await p.request()
      .input('k', sql.NVarChar, key)
      .input('d', sql.NVarChar(sql.MAX), JSON.stringify(data))
      .query(`
        MERGE Portfolios AS t
        USING (SELECT @k AS [key]) AS s ON t.[key] = s.[key]
        WHEN MATCHED THEN UPDATE SET data = @d, updatedAt = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT ([key], data, updatedAt) VALUES (@k, @d, SYSUTCDATETIME());
      `);
    return { ok: true };
  },
  async listUsers() {
    const p = await pool();
    const r = await p.request().query('SELECT email, name, allowed, role, importedAt FROM Users ORDER BY name');
    return r.recordset;
  },
  async getUser(email) {
    const p = await pool();
    const r = await p.request().input('e', sql.NVarChar, (email || '').toLowerCase())
      .query('SELECT email, name, allowed, role, importedAt FROM Users WHERE email = @e');
    return r.recordset[0] || null;
  },
  async upsertUser(user) {
    const p = await pool();
    const email = (user.email || '').toLowerCase();
    await p.request()
      .input('e', sql.NVarChar, email)
      .input('n', sql.NVarChar, user.name || '')
      .input('a', sql.Bit, user.allowed ? 1 : 0)
      .input('r', sql.NVarChar, user.role || 'user')
      .query(`
        MERGE Users AS t
        USING (SELECT @e AS email) AS s ON t.email = s.email
        WHEN MATCHED THEN UPDATE SET name = @n, role = @r
        WHEN NOT MATCHED THEN INSERT (email, name, allowed, role, importedAt)
          VALUES (@e, @n, @a, @r, SYSUTCDATETIME());
      `);
    return this.getUser(email);
  },
  async setUserAccess(email, allowed) {
    const p = await pool();
    await p.request()
      .input('e', sql.NVarChar, (email || '').toLowerCase())
      .input('a', sql.Bit, allowed ? 1 : 0)
      .query('UPDATE Users SET allowed = @a WHERE email = @e');
    return this.getUser(email);
  },
};
