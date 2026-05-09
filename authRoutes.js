const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const supabase = require('./supabase');

// Simple token store — tokens are random strings stored in Supabase users table
// Token expires after 7 days

// POST /auth/login
router.post('/auth/login', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Missing password' });

  // Look up user by password hash
  const hash = crypto.createHash('sha256').update(password).digest('hex');

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('password_hash', hash)
    .eq('active', true)
    .single();

  if (error || !user) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  // Generate a session token
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await supabase.from('sessions').insert({
    user_id: user.id,
    token,
    expires_at: expiresAt,
  });

  console.log(`[Auth] Login successful for tenant: ${user.tenant_id}`);
  return res.json({ token, tenant_id: user.tenant_id });
});

// GET /auth/verify — called on every dashboard load to check token
router.get('/auth/verify', async (req, res) => {
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
router.post('/auth/logout', async (req, res) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7);
    await supabase.from('sessions').delete().eq('token', token);
  }
  return res.json({ ok: true });
});

module.exports = router;
