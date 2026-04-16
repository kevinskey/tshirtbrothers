import jwt from 'jsonwebtoken';

export function signUserToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
}

export function authenticate(req, res, next) {
  const token = req.cookies?.sw_token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function optionalAuth(req, _res, next) {
  const token = req.cookies?.sw_token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (token) {
    try { req.user = jwt.verify(token, process.env.JWT_SECRET); } catch { /* noop */ }
  }
  next();
}
