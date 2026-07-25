// Service-to-service auth for the GleeWorld → TSB integration.
//
// GleeWorld provisions and reads its tenants' group stores by calling
// TSB with a shared secret in the `x-gleeworld-service-key` header. The
// key lives in the TSB server env (GLEEWORLD_SERVICE_KEY) and in the
// GleeWorld edge-function secret store. Rotate by setting a new value
// on both sides simultaneously.
//
// This is distinct from:
//   • storeApiKey — per-store secret for the franchise/admin API
//   • storeAdminSession — bearer session for logged-in group admins
//   • authenticate + adminOnly — staff JWT for TSB internal tools
//
// Endpoints protected by this middleware are TSB → GleeWorld only;
// they never surface to browsers.

export function gleeworldServiceKey(req, res, next) {
  const expected = process.env.GLEEWORLD_SERVICE_KEY;
  if (!expected) {
    // Fail closed rather than silently letting anything through when the
    // key isn't configured on the server.
    console.error('[gleeworldService] GLEEWORLD_SERVICE_KEY is not set');
    return res.status(503).json({ error: 'Integration not configured' });
  }
  const key = req.headers['x-gleeworld-service-key'];
  if (!key || key !== expected) {
    return res.status(401).json({ error: 'Invalid or missing x-gleeworld-service-key' });
  }
  next();
}
