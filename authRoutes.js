const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const supabase = require('./supabase');

// POST /auth/login  (mounted at /auth in server.js, so just /login here)
router.post('/login', async (req, res) => {
  const { password } = req.body;
  console.log('[Auth] Login attempt received');

  if (!password) return res.status(400).json({ error: 'Missing password' });

  const hash = crypto.createHash('sha256').update(password).digest('hex');
  console.log('[Auth] Password hash:', hash);

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('password_hash', hash)
    .eq('active', true)
    .single();

  console.log('[Auth] User found:', !!user, '| Error:', error?.message || 'none');

  if (error || !user) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error: sessionError } = await supabase.from('sessions').insert({
    user_id: user.id,
    token,
    expires_at: expiresAt,
  });

  console.log('[Auth] Session created:', !sessionError, sessionError?.message || '');
  console.log('[Auth] Login successful for tenant:', user.tenant_id);

  return res.json({ token, tenant_id: user.tenant_id });
});

// GET /auth/verify
router.get('/verify', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });

  const token = auth.slice(7);

  const { data: session, error } = await supabase
    .from('sessions')
    .select('*, users(*)')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !session) return res.status(401).json({ error: 'Invalid or expired token' });

  return res.json({ valid: true, tenant_id: session.users.tenant_id });
});

// POST /auth/logout
router.post('/logout', async (req, res) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7);
    await supabase.from('sessions').delete().eq('token', token);
  }
  return res.json({ ok: true });
});

module.exports = router;
