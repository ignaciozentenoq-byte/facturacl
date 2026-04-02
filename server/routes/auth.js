// server/routes/auth.js
// ═══════════════════════════════════════════════════════════════
// Autenticación para QuickPOS.
// Valida email+password contra tabla users (bcrypt hash).
// Genera JWT propio para sesión del POS.
// ═══════════════════════════════════════════════════════════════

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../services/db.js';
import { config } from '../config/index.js';
import logger from '../middleware/logger.js';

export const authRouter = Router();

function signTokens(payload) {
  const access_token = jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
  const refresh_token = jwt.sign(
    { sub: payload.sub, type: 'refresh' },
    config.jwt.secret,
    { expiresIn: config.jwt.refreshExpiresIn },
  );
  const decoded = jwt.decode(access_token);
  return { access_token, refresh_token, expires_at: decoded.exp };
}

// POST /api/auth/login
authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      ok: false,
      error: 'MISSING_FIELDS',
      message: 'Se requiere email y password.',
    });
  }

  if (!supabase) {
    return res.status(503).json({
      ok: false,
      error: 'DB_UNAVAILABLE',
      message: 'Servicio de autenticación no disponible.',
    });
  }

  try {
    // Buscar usuario por email
    const { data: user, error } = await supabase
      .from('users')
      .select('id, tenant_id, email, password_hash, name, role, pin, active, tenants(id, name, rut)')
      .eq('email', email.trim().toLowerCase())
      .eq('active', true)
      .single();

    if (error || !user) {
      logger.warn({ email }, 'Login fallido — usuario no encontrado');
      return res.status(401).json({
        ok: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Credenciales incorrectas.',
      });
    }

    // Validar password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      logger.warn({ email }, 'Login fallido — password incorrecto');
      return res.status(401).json({
        ok: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Credenciales incorrectas.',
      });
    }

    // Generar JWT
    const tokenPayload = {
      sub: user.id,
      tenant_id: user.tenant_id,
      email: user.email,
      role: user.role,
    };
    const tokens = signTokens(tokenPayload);

    // Actualizar last_login_at (no bloquea)
    supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id)
      .then(() => {})
      .catch(err => logger.error({ err }, 'Error actualizando last_login'));

    // Generar iniciales del nombre
    const initials = user.name
      .split(' ')
      .map(w => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    logger.info({ email, tenant_id: user.tenant_id, role: user.role }, 'Login POS exitoso');

    res.json({
      ok: true,
      ...tokens,
      user: {
        id: user.id,
        tenant_id: user.tenant_id,
        email: user.email,
        name: user.name,
        initials,
        role: user.role,
        color: roleColor(user.role),
        tenant: user.tenants,
      },
    });
  } catch (err) {
    logger.error({ err, email }, 'Error inesperado en login');
    res.status(500).json({ ok: false, error: 'INTERNAL_ERROR', message: 'Error interno.' });
  }
});

// POST /api/auth/refresh
authRouter.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({
      ok: false,
      error: 'MISSING_TOKEN',
      message: 'Se requiere refresh_token.',
    });
  }

  try {
    const payload = jwt.verify(refresh_token, config.jwt.secret);
    if (payload.type !== 'refresh') {
      throw new Error('Not a refresh token');
    }

    // Verificar que el usuario sigue activo
    const { data: user, error } = await supabase
      .from('users')
      .select('id, tenant_id, email, role, active')
      .eq('id', payload.sub)
      .eq('active', true)
      .single();

    if (error || !user) {
      return res.status(401).json({
        ok: false,
        error: 'USER_INACTIVE',
        message: 'Usuario desactivado. Contacta al administrador.',
      });
    }

    const tokens = signTokens({
      sub: user.id,
      tenant_id: user.tenant_id,
      email: user.email,
      role: user.role,
    });

    res.json({ ok: true, ...tokens });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({
        ok: false,
        error: 'INVALID_TOKEN',
        message: 'Token expirado o inválido. Inicia sesión nuevamente.',
      });
    }
    logger.error({ err }, 'Error inesperado en refresh');
    res.status(500).json({ ok: false, error: 'INTERNAL_ERROR', message: 'Error interno.' });
  }
});

function roleColor(role) {
  const colors = {
    admin: '#9b6ef7',
    cajero: '#4f8ef7',
    vendedor: '#22c97a',
    supervisor: '#9b6ef7',
  };
  return colors[role] || '#4f8ef7';
}
