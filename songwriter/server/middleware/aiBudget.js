import pool from '../db.js';

export const DAILY_AI_LIMIT = parseInt(process.env.DAILY_AI_LIMIT || '100', 10);

// Count a user's AI calls in the last 24h. Uses the existing ai_logs table —
// every AI endpoint already logs to it via logAI().
export async function countAIUsage(userId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count
       FROM ai_logs
      WHERE user_id = $1
        AND created_at > NOW() - INTERVAL '24 hours'`,
    [userId]
  );
  return rows[0]?.count || 0;
}

// Middleware: blocks expensive AI endpoints when the user is over their
// daily budget. Returns 429 with a friendly message and reset hint.
// Request handlers can read res.locals.aiBudget for the current count.
export async function checkAIBudget(req, res, next) {
  if (!req.user?.id) return next(); // auth already requires user; defensive
  try {
    const used = await countAIUsage(req.user.id);
    const limit = DAILY_AI_LIMIT;
    const remaining = Math.max(0, limit - used);
    res.locals.aiBudget = { used, limit, remaining };
    res.setHeader('X-AI-Budget-Used', String(used));
    res.setHeader('X-AI-Budget-Limit', String(limit));
    res.setHeader('X-AI-Budget-Remaining', String(remaining));

    if (used >= limit) {
      return res.status(429).json({
        error: `You've hit today's AI limit (${limit} calls). Your budget resets over the next 24 hours — use of free tools (dictionary lookups, reading psalms/poetry, the editor itself) is always unlimited.`,
        budget: { used, limit, remaining: 0 },
      });
    }
    next();
  } catch (err) {
    // Never block requests because of a budget lookup failure
    console.error('[aiBudget] lookup failed:', err.message);
    next();
  }
}
