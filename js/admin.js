/* ══════════════════════════════════════════════════════════════════
   ADMINISTRACIÓN DE USUARIOS (frontend)
   - Directorio de Entra ID: ver, buscar, seleccionar e importar
   - Usuarios de la app: conceder/revocar acceso
   Solo visible para administradores.
   ══════════════════════════════════════════════════════════════════ */

var _adminUsers = [];      // usuarios dados de alta en la app
var _dirUsers = [];        // usuarios del directorio de Entra ID
var _dirSelected = {};     // email → true (selección para importar)

// ── Sesión ──
async function adminCheckSession() {
  var navAdmin = document.getElementById('nav-admin');
  var msBtn = document.getElementById('ms-login-btn');
  try {
    var r = await fetch('/api/auth/me', { credentials: 'include' });
    var s = await r.json();
    if (navAdmin) navAdmin.style.display = (s.user && s.user.role === 'admin') ? '' : 'none';
    // El botón de Microsoft es el único acceso, siempre visible
    if (s.ssoConfigured && s.authenticated && typeof enterApp === 'function') {
      var landing = document.getElementById('landing');
      if (landing && landing.style.display !== 'none') enterApp();
    }
    return s;
  } catch (e) {
    if (navAdmin) navAdmin.style.display = 'none';
    
    return { authenticated: false, ssoConfigured: false };
  }
}

async function adminRenderStatus() {
  var el = document.getElementById('admin-status');
  if (!el) return;
  var s = await adminCheckSession();
  if (!s.ssoConfigured) {
    el.innerHTML = '⚠ <b>SSO de Entra ID no configurado.</b> Define las variables AZURE_* en Vercel.';
    el.style.background = '#FDF6E3'; el.style.borderColor = '#E8D9A0'; el.style.color = '#8A6D3B';
  } else if (!s.authenticated) {
    el.innerHTML = 'No has iniciado sesión. <a href="/api/auth/login" style="color:#2E5B9A;font-weight:700">Entrar con Microsoft</a>';
  } else {
    el.innerHTML = '✓ Sesión activa: <b>' + (s.user.name || s.user.email) + '</b> · rol <b>' + s.user.role + '</b>';
    el.style.background = '#EAF6F0'; el.style.borderColor = '#B8E0CC'; el.style.color = '#087B50';
  }
}

// ── Directorio de Entra ID ──
async function adminLoadDirectory() {
  var btn = document.getElementById('dir-load-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Cargando…'; }
  try {
    var r = await fetch('/api/users/directory', { credentials: 'include' });
    var j = await r.json();
    if (!r.ok) {
      // Mensaje de error claro (permisos de Graph, token, etc.)
      var msg = j.message || j.graphMessage || j.error || ('HTTP ' + r.status);
      toast('No se pudo cargar el directorio: ' + msg);
      var tb = document.getElementById('dir-tbody');
      if (tb) tb.innerHTML = '<tr><td colspan="5" style="padding:20px;color:#B03A2E;font-size:11px;line-height:1.6">'
        + '<b>Error de Microsoft Graph:</b><br>' + msg
        + (j.graphCode ? '<br><span style="color:#999">Código: ' + j.graphCode + '</span>' : '') + '</td></tr>';
      return;
    }
    _dirUsers = j.users || [];
    _dirSelected = {};
    adminRenderDirectory();
    toast('✓ ' + _dirUsers.length + ' usuarios en el directorio');
  } catch (e) {
    toast('Error: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '⟳ Cargar directorio'; }
  }
}

function adminSelectAllDir(on) {
  var q = (document.getElementById('dir-search') || {}).value || '';
  q = q.toLowerCase().trim();
  _dirUsers.forEach(function (u) {
    var match = !q || (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || (u.department || '').toLowerCase().includes(q);
    if (match && !u.imported) _dirSelected[u.email] = on;
  });
  adminRenderDirectory();
}

function adminToggleDirSelect(email, on) { _dirSelected[email] = on; }

function adminRenderDirectory() {
  var q = (document.getElementById('dir-search') || {}).value || '';
  q = q.toLowerCase().trim();
  var rows = _dirUsers.filter(function (u) {
    return !q || (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || (u.department || '').toLowerCase().includes(q);
  });
  var tb = document.getElementById('dir-tbody');
  if (!tb) return;
  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--ink4)">'
      + (_dirUsers.length ? 'Sin resultados.' : 'Pulsa "Cargar directorio".') + '</td></tr>';
    return;
  }
  tb.innerHTML = rows.map(function (u, i) {
    var bg = i % 2 ? '#FAFAF8' : '#fff';
    var estado = u.imported
      ? (u.allowed ? '<span style="font-size:9px;padding:2px 7px;border-radius:20px;background:#EAF6F0;color:#087B50">con acceso</span>'
                   : '<span style="font-size:9px;padding:2px 7px;border-radius:20px;background:#FDF3E3;color:#8A6D3B">importado</span>')
      : '<span style="font-size:9px;padding:2px 7px;border-radius:20px;background:#EEE;color:#777">nuevo</span>';
    var chk = u.imported
      ? '<span style="color:#ccc">✓</span>'
      : '<input type="checkbox" ' + (_dirSelected[u.email] ? 'checked' : '') + ' onchange="adminToggleDirSelect(\'' + u.email.replace(/'/g, "\\'") + '\', this.checked)">';
    return '<tr style="background:' + bg + ';border-top:1px solid #EEE">'
      + '<td style="padding:8px 10px;text-align:center">' + chk + '</td>'
      + '<td style="padding:8px 10px;color:#1A1A1A;font-weight:600">' + (u.name || '—') + '</td>'
      + '<td style="padding:8px 10px;color:var(--ink3)">' + u.email + '</td>'
      + '<td style="padding:8px 10px;color:var(--ink3)">' + (u.department || '—') + '</td>'
      + '<td style="padding:8px 10px;text-align:center">' + estado + '</td>'
      + '</tr>';
  }).join('');
}

async function adminImportSelected() {
  var seleccion = _dirUsers.filter(function (u) { return _dirSelected[u.email] && !u.imported; })
    .map(function (u) { return { email: u.email, name: u.name }; });
  if (!seleccion.length) { toast('Selecciona al menos un usuario nuevo.'); return; }
  var btn = document.getElementById('dir-import-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Importando…'; }
  try {
    var r = await fetch('/api/users/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ users: seleccion }),
    });
    var j = await r.json();
    if (!r.ok) throw new Error(j.message || j.error || ('HTTP ' + r.status));
    toast('✓ ' + (j.imported || 0) + ' usuarios importados');
    _dirSelected = {};
    await adminLoadDirectory();
    await adminLoadUsers();
  } catch (e) {
    toast('Error al importar: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '↓ Importar seleccionados'; }
  }
}

// ── Usuarios de la app ──
async function adminLoadUsers() {
  try {
    var r = await fetch('/api/users', { credentials: 'include' });
    if (!r.ok) { if (r.status === 401 || r.status === 403) toast('Solo administradores.'); return; }
    var j = await r.json();
    _adminUsers = j.users || [];
    adminRenderUsers();
  } catch (e) { toast('No se pudieron cargar los usuarios: ' + e.message); }
}

async function adminToggleAccess(email, allowed) {
  try {
    var r = await fetch('/api/users/access', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ email: email, allowed: allowed }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var u = _adminUsers.find(function (x) { return x.email === email; });
    if (u) u.allowed = allowed;
    adminRenderUsers();
    // Reflejar en el directorio si está cargado
    var d = _dirUsers.find(function (x) { return x.email === email; });
    if (d) d.allowed = allowed;
    adminRenderDirectory();
    toast(allowed ? '✓ Acceso concedido' : 'Acceso revocado');
  } catch (e) { toast('No se pudo cambiar el acceso: ' + e.message); }
}

function adminRenderUsers() {
  var q = (document.getElementById('admin-search') || {}).value || '';
  q = q.toLowerCase().trim();
  var rows = _adminUsers.filter(function (u) {
    return !q || (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
  });

  var kp = document.getElementById('admin-kpis');
  if (kp) {
    var conAcceso = _adminUsers.filter(function (u) { return u.allowed; }).length;
    var admins = _adminUsers.filter(function (u) { return u.role === 'admin'; }).length;
    var kpi = function (v, l) {
      return '<div style="flex:1;min-width:110px;background:var(--w);border:1px solid var(--b);border-left:3px solid #1A1A1A;border-radius:10px;padding:12px 14px">'
        + '<div style="font-size:22px;font-weight:800;color:#1A1A1A;line-height:1">' + v + '</div>'
        + '<div style="font-size:10px;color:var(--ink4);text-transform:uppercase;letter-spacing:.04em;margin-top:3px">' + l + '</div></div>';
    };
    kp.innerHTML = kpi(_adminUsers.length, 'En la app') + kpi(conAcceso, 'Con acceso') + kpi(admins, 'Admins') + kpi(_dirUsers.length || '—', 'En Entra ID');
  }

  var tb = document.getElementById('admin-tbody');
  if (!tb) return;
  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="4" style="padding:24px;text-align:center;color:var(--ink4)">'
      + (q ? 'Sin resultados.' : 'Aún no hay usuarios. Impórtalos desde el directorio.') + '</td></tr>';
    return;
  }
  rows.sort(function (a, b) { return (a.name || a.email).localeCompare(b.name || b.email); });
  tb.innerHTML = rows.map(function (u, i) {
    var bg = i % 2 ? '#FAFAF8' : '#fff';
    var isAdmin = u.role === 'admin';
    var toggle = isAdmin
      ? '<span style="font-size:10px;color:var(--ink4)">— (admin)</span>'
      : '<input type="checkbox" ' + (u.allowed ? 'checked' : '') + ' onchange="adminToggleAccess(\'' + u.email.replace(/'/g, "\\'") + '\', this.checked)" style="width:34px;height:18px;cursor:pointer">';
    return '<tr style="background:' + bg + ';border-top:1px solid #EEE">'
      + '<td style="padding:9px 12px;color:#1A1A1A;font-weight:600">' + (u.name || '—') + '</td>'
      + '<td style="padding:9px 12px;color:var(--ink3)">' + u.email + '</td>'
      + '<td style="padding:9px 12px;text-align:center"><span style="font-size:10px;padding:2px 8px;border-radius:20px;background:' + (isAdmin ? '#1A1A1A;color:#fff' : '#EEE;color:#555') + '">' + u.role + '</span></td>'
      + '<td style="padding:9px 12px;text-align:center">' + toggle + '</td>'
      + '</tr>';
  }).join('');
}

function renderAdminScreen() {
  adminRenderStatus();
  adminLoadUsers();
}

document.addEventListener('DOMContentLoaded', function () {
  setTimeout(adminCheckSession, 500);
});
