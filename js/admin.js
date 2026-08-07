/* ══════════════════════════════════════════════════════════════════
   ADMINISTRACIÓN DE USUARIOS (frontend)
   Consume las rutas /api/users y /api/auth del backend.
   El apartado Admin solo es visible para usuarios con rol 'admin'.
   ══════════════════════════════════════════════════════════════════ */

var _adminUsers = [];

// Comprueba la sesión y muestra/oculta la entrada de menú "Admin"
async function adminCheckSession() {
  var navAdmin = document.getElementById('nav-admin');
  var msBtn = document.getElementById('ms-login-btn');
  try {
    var r = await fetch('/api/auth/me', { credentials: 'include' });
    var s = await r.json();
    // Mostrar el menú Admin solo si el usuario autenticado es administrador
    if (navAdmin) navAdmin.style.display = (s.user && s.user.role === 'admin') ? '' : 'none';
    // Si el SSO está configurado, mostrar el botón de Microsoft en la portada
    if (msBtn) msBtn.style.display = s.ssoConfigured ? 'block' : 'none';
    // Guardián de acceso: con SSO activo y sesión válida, entrar directo a la app
    if (s.ssoConfigured && s.authenticated && typeof enterApp === 'function') {
      var landing = document.getElementById('landing');
      if (landing && landing.style.display !== 'none') enterApp();
    }
    return s;
  } catch (e) {
    // Sin backend (p. ej. Vercel sin server): ocultar Admin y botón MS
    if (navAdmin) navAdmin.style.display = 'none';
    if (msBtn) msBtn.style.display = 'none';
    return { authenticated: false, ssoConfigured: false };
  }
}

// Render del estado en la pantalla Admin
async function adminRenderStatus() {
  var el = document.getElementById('admin-status');
  if (!el) return;
  var s = await adminCheckSession();
  if (!s.ssoConfigured) {
    el.innerHTML = '⚠ <b>SSO de Entra ID aún no configurado.</b> Define las variables AZURE_TENANT_ID, AZURE_CLIENT_ID, '
      + 'AZURE_CLIENT_SECRET y AZURE_REDIRECT_URI en el servidor. Ver la guía de configuración.';
    el.style.background = '#FDF6E3'; el.style.borderColor = '#E8D9A0'; el.style.color = '#8A6D3B';
  } else if (!s.authenticated) {
    el.innerHTML = 'No has iniciado sesión. <a href="/api/auth/login" style="color:#2E5B9A;font-weight:700">Entrar con Microsoft</a>';
  } else {
    el.innerHTML = '✓ Sesión activa: <b>' + (s.user.name || s.user.email) + '</b> · rol <b>' + s.user.role + '</b>';
    el.style.background = '#EAF6F0'; el.style.borderColor = '#B8E0CC'; el.style.color = '#087B50';
  }
}

// Cargar la lista de usuarios registrados
async function adminLoadUsers() {
  try {
    var r = await fetch('/api/users', { credentials: 'include' });
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) { toast('Acceso solo para administradores.'); return; }
      throw new Error('HTTP ' + r.status);
    }
    var j = await r.json();
    _adminUsers = j.users || [];
    adminRenderUsers();
  } catch (e) {
    toast('No se pudieron cargar los usuarios: ' + e.message);
  }
}

// Importar usuarios del tenant de Entra ID
async function adminImportUsers() {
  var btn = document.getElementById('admin-import-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Importando…'; }
  try {
    var r = await fetch('/api/users/import', { method: 'POST', credentials: 'include' });
    var j = await r.json();
    if (!r.ok) throw new Error(j.message || j.error || ('HTTP ' + r.status));
    toast('✓ ' + (j.imported || 0) + ' usuarios importados de Entra ID');
    await adminLoadUsers();
  } catch (e) {
    toast('Error al importar: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '↓ Importar usuarios de Entra ID'; }
  }
}

// Conceder / revocar acceso a un usuario
async function adminToggleAccess(email, allowed) {
  try {
    var r = await fetch('/api/users/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: email, allowed: allowed }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var u = _adminUsers.find(function (x) { return x.email === email; });
    if (u) u.allowed = allowed;
    adminRenderUsers();
    toast(allowed ? '✓ Acceso concedido a ' + email : 'Acceso revocado a ' + email);
  } catch (e) {
    toast('No se pudo cambiar el acceso: ' + e.message);
  }
}

// Render de KPIs + tabla, con búsqueda
function adminRenderUsers() {
  var q = (document.getElementById('admin-search') || {}).value || '';
  q = q.toLowerCase().trim();
  var rows = _adminUsers.filter(function (u) {
    return !q || (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q);
  });

  // KPIs
  var kp = document.getElementById('admin-kpis');
  if (kp) {
    var conAcceso = _adminUsers.filter(function (u) { return u.allowed; }).length;
    var admins = _adminUsers.filter(function (u) { return u.role === 'admin'; }).length;
    var kpi = function (v, l) {
      return '<div style="flex:1;min-width:120px;background:var(--w);border:1px solid var(--b);border-left:3px solid #1A1A1A;border-radius:10px;padding:12px 14px">'
        + '<div style="font-size:22px;font-weight:800;color:#1A1A1A;line-height:1">' + v + '</div>'
        + '<div style="font-size:10px;color:var(--ink4);text-transform:uppercase;letter-spacing:.04em;margin-top:3px">' + l + '</div></div>';
    };
    kp.innerHTML = kpi(_adminUsers.length, 'Usuarios') + kpi(conAcceso, 'Con acceso') + kpi(admins, 'Administradores');
  }

  // Tabla
  var tb = document.getElementById('admin-tbody');
  if (!tb) return;
  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="4" style="padding:24px;text-align:center;color:var(--ink4)">'
      + (q ? 'Sin resultados para "' + q + '".' : 'Sin usuarios. Pulsa "Importar usuarios de Entra ID".') + '</td></tr>';
    return;
  }
  rows.sort(function (a, b) { return (a.name || a.email).localeCompare(b.name || b.email); });
  tb.innerHTML = rows.map(function (u, i) {
    var bg = i % 2 ? '#FAFAF8' : '#fff';
    var isAdmin = u.role === 'admin';
    var toggle = isAdmin
      ? '<span style="font-size:10px;color:var(--ink4)">— (admin)</span>'
      : '<label style="display:inline-flex;align-items:center;cursor:pointer">'
        + '<input type="checkbox" ' + (u.allowed ? 'checked' : '') + ' '
        + 'onchange="adminToggleAccess(\'' + u.email.replace(/'/g, "\\'") + '\', this.checked)" '
        + 'style="width:34px;height:18px;cursor:pointer"></label>';
    return '<tr style="background:' + bg + ';border-top:1px solid #EEE">'
      + '<td style="padding:9px 12px;color:#1A1A1A;font-weight:600">' + (u.name || '—') + '</td>'
      + '<td style="padding:9px 12px;color:var(--ink3)">' + u.email + '</td>'
      + '<td style="padding:9px 12px;text-align:center">'
        + '<span style="font-size:10px;padding:2px 8px;border-radius:20px;background:' + (isAdmin ? '#1A1A1A;color:#fff' : '#EEE;color:#555') + '">' + u.role + '</span></td>'
      + '<td style="padding:9px 12px;text-align:center">' + toggle + '</td>'
      + '</tr>';
  }).join('');
}

// Punto de entrada al abrir la pantalla Admin
function renderAdminScreen() {
  adminRenderStatus();
  adminLoadUsers();
}

// Comprobar sesión al cargar la app (para mostrar/ocultar el menú Admin)
document.addEventListener('DOMContentLoaded', function () {
  setTimeout(adminCheckSession, 500);
});
