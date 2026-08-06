/**
 * server.js — Servidor Express de NEXUS.
 *
 * Sirve el frontend estático y expone la API. Funciona igual en local
 * (`npm start`) y en Azure App Service. En Vercel NO se usa este servidor:
 * allí las funciones de /api se ejecutan como serverless y el estático se
 * sirve directamente (ver vercel.json). Este server.js es el que usará Azure.
 *
 * Diseño intencionado: las rutas de /api delegan en los mismos handlers que
 * ya usa Vercel (api/*.js exportan `module.exports = (req,res) => ...`), de
 * modo que la lógica es única y no se duplica entre plataformas.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));

// ── Adaptar los handlers estilo Vercel (req,res) a Express ──
// Los archivos de /api exportan una función (req, res). Express es compatible,
// pero añadimos helpers que Vercel provee y Express no (res.status().json()).
function vercelAdapter(handler) {
  return async (req, res) => {
    // Vercel añade estos helpers; Express ya los tiene, pero garantizamos compat.
    if (!res.status) res.status = (c) => { res.statusCode = c; return res; };
    try {
      await handler(req, res);
    } catch (err) {
      console.error('[api error]', err);
      if (!res.headersSent) res.status(500).json({ error: 'server_error', message: err.message });
    }
  };
}

// ── Cargar dinámicamente las rutas de /api ──
const apiDir = path.join(__dirname, 'api');
if (fs.existsSync(apiDir)) {
  fs.readdirSync(apiDir).filter(f => f.endsWith('.js')).forEach(file => {
    const name = file.replace(/\.js$/, '');
    try {
      const handler = require(path.join(apiDir, file));
      if (typeof handler === 'function') {
        app.all(`/api/${name}`, vercelAdapter(handler));
        console.log(`  /api/${name} → api/${file}`);
      }
    } catch (e) {
      console.warn(`  ⚠ no se pudo cargar api/${file}:`, e.message);
    }
  });
}

// ── Rutas de autenticación y usuarios (esqueleto, se activan con config) ──
try {
  const authRoutes = require('./src/routes/auth');
  const userRoutes = require('./src/routes/users');
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  console.log('  /api/auth y /api/users cargadas');
} catch (e) {
  console.log('  (auth/users aún no configurados — se activarán con Entra ID)');
}

// ── Servir el frontend estático ──
app.use(express.static(__dirname, {
  index: 'index.html',
  extensions: ['html'],
}));

// Fallback a index.html para navegación de una sola página
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'not_found' });
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  NEXUS escuchando en http://localhost:${PORT}\n`);
});
