#!/usr/bin/env node
/**
 * build.js — Ensambla las vistas parciales de views/ en un único index.html.
 *
 * Flujo de trabajo:
 *   1. Editas las vistas en views/ (cada pantalla en su archivo).
 *   2. Ejecutas `npm run build` (o `node build.js`).
 *   3. Se regenera index.html, que es lo que sirve Vercel/Azure.
 *
 * El index.html resultante es funcionalmente idéntico al original: mismos IDs,
 * mismos handlers, mismo orden de scripts. No añade dependencias en runtime.
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const VIEWS = path.join(ROOT, 'views');
const OUT = path.join(ROOT, 'index.html');

function read(f) { return fs.readFileSync(path.join(VIEWS, f), 'utf8'); }

// Orden de los steps tal como aparecían en el original
const order = JSON.parse(read('_order.json'));

// Ensamblado en el mismo orden que el index.html original:
// head → loader → landing → shell-open → [steps...] → shell-close → scripts
const parts = [];
parts.push(read('_head.html'));
parts.push(read('_loader.html'));
parts.push(read('landing.html'));
parts.push(read('_shell-open.html'));
order.forEach(k => parts.push(read(`step-${k}.html`)));
parts.push(read('_shell-close.html'));
parts.push(read('_scripts.html'));

const html = parts.join('\n');
fs.writeFileSync(OUT, html);

// Verificación rápida de integridad
const ids = (html.match(/id="([^"]+)"/g) || []).length;
const steps = (html.match(/class="step" id="step-/g) || []).length;
const scripts = (html.match(/<script src="js\//g) || []).length;
console.log('✓ index.html generado');
console.log(`  ${(html.length/1024).toFixed(0)} KB · ${ids} ids · ${steps} steps · ${scripts} scripts JS`);
