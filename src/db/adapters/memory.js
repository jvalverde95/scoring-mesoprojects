/**
 * Adaptador en memoria. Funciona sin base de datos real (desarrollo/local).
 * Los datos se pierden al reiniciar. Interfaz común a todos los adaptadores.
 */
const _portfolios = {};   // key → data
const _users = {};        // email → { email, name, allowed, role, importedAt }

module.exports = {
  async getPortfolio(key) {
    return _portfolios[key] || null;
  },
  async savePortfolio(key, data) {
    _portfolios[key] = data;
    return { ok: true };
  },
  async listUsers() {
    return Object.values(_users);
  },
  async getUser(email) {
    return _users[(email || '').toLowerCase()] || null;
  },
  async upsertUser(user) {
    const email = (user.email || '').toLowerCase();
    _users[email] = Object.assign({ allowed: false, role: 'user' }, _users[email], user, { email });
    return _users[email];
  },
  async setUserAccess(email, allowed) {
    const e = (email || '').toLowerCase();
    if (_users[e]) { _users[e].allowed = !!allowed; return _users[e]; }
    return null;
  },
};
