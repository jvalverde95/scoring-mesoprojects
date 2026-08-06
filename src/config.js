/**
 * src/config.js — Configuración centralizada.
 * Toda la app lee de aquí; nunca de process.env directamente (salvo el propio config).
 * Así, cambiar de Vercel a Azure o de un proveedor de BD a otro es cuestión de
 * ajustar variables de entorno, sin tocar código.
 */
module.exports = {
  port: process.env.PORT || 3000,
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',

  db: {
    provider: (process.env.DB_PROVIDER || 'memory').toLowerCase(),
    github: {
      token: process.env.GITHUB_TOKEN || '',
      repo: process.env.GITHUB_REPO || '',
      branch: process.env.GITHUB_BRANCH || 'main',
      shareKey: process.env.NEXUS_SHARE_KEY || '',
    },
    azureSql: {
      server: process.env.AZURE_SQL_SERVER || '',
      database: process.env.AZURE_SQL_DATABASE || '',
      user: process.env.AZURE_SQL_USER || '',
      password: process.env.AZURE_SQL_PASSWORD || '',
    },
  },

  entra: {
    tenantId: process.env.AZURE_TENANT_ID || '',
    clientId: process.env.AZURE_CLIENT_ID || '',
    clientSecret: process.env.AZURE_CLIENT_SECRET || '',
    redirectUri: process.env.AZURE_REDIRECT_URI || '',
    configured() {
      return !!(this.tenantId && this.clientId && this.clientSecret && this.redirectUri);
    },
  },

  ado: {
    pat: process.env.ADO_PAT || '',
  },
};
