'use strict';
const jwt = require('jsonwebtoken');
const db  = require('../db');

async function requireAuth(req, res, next) {
  try {
    // Admin API key bypass (for Claude Code / programmatic access)
    const adminKey = req.headers['x-admin-key'];
    if (adminKey && adminKey === process.env.ADMIN_API_KEY) {
      req.user = { role: 'super_admin', id: 'admin-key', is_active: true };
      return next();
    }

    const header = req.headers.authorization || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await db.query('SELECT * FROM users WHERE id=$1 AND is_active=true', [payload.sub]);
    if (!rows[0]) return res.status(401).json({ error: 'User not found' });

    req.user = rows[0];
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  // Allow X-Admin-Key header as alternative (for Claude Code / CLI access)
  const adminKey = req.headers['x-admin-key'];
  if (adminKey && adminKey === process.env.ADMIN_API_KEY) {
    req.user = req.user || { role: 'super_admin', id: 'admin-key' };
    return next();
  }
  if (!['admin', 'super_admin'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function requireSuperAdmin(req, res, next) {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, requireSuperAdmin };
