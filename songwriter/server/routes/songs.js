import { Router } from 'express';
import pool from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

const MAX_VERSIONS = 20;
const SNAPSHOT_MIN_INTERVAL_MS = 60 * 1000; // snapshot at most once per 60s per song

// Capture a snapshot of the song's current state — call BEFORE applying an update.
// Throttled: if the last snapshot is less than 60s old, we skip so rapid autosaves
// don't bloat the history. Keeps only the last MAX_VERSIONS per song.
async function maybeSnapshot(songId, currentRow, reason = 'autosave') {
  try {
    const { rows: last } = await pool.query(
      'SELECT created_at FROM song_versions WHERE song_id = $1 ORDER BY created_at DESC LIMIT 1',
      [songId]
    );
    if (last.length > 0) {
      const age = Date.now() - new Date(last[0].created_at).getTime();
      if (age < SNAPSHOT_MIN_INTERVAL_MS) return; // too recent, skip
    }

    const snapshot = {
      title: currentRow.title,
      sections: currentRow.sections,
      notes: currentRow.notes,
      tempo_bpm: currentRow.tempo_bpm,
      key_signature: currentRow.key_signature,
    };

    await pool.query(
      'INSERT INTO song_versions (song_id, snapshot, reason) VALUES ($1, $2::jsonb, $3)',
      [songId, JSON.stringify(snapshot), reason]
    );

    // Prune: keep only the last MAX_VERSIONS snapshots
    await pool.query(
      `DELETE FROM song_versions
        WHERE song_id = $1
          AND id NOT IN (
            SELECT id FROM song_versions
             WHERE song_id = $1
             ORDER BY created_at DESC
             LIMIT $2
          )`,
      [songId, MAX_VERSIONS]
    );
  } catch (err) {
    // Never block a save because versioning failed
    console.error('[songs] snapshot failed:', err.message);
  }
}

// List all songs for the current user
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, title, notes, tempo_bpm, key_signature, created_at, updated_at,
              jsonb_array_length(sections) AS section_count
         FROM songs
        WHERE user_id = $1
        ORDER BY updated_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Get one song
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM songs WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Song not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Create a song
router.post('/', async (req, res, next) => {
  try {
    const { title = 'Untitled', sections = [], notes = '', tempo_bpm, key_signature } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO songs (user_id, title, sections, notes, tempo_bpm, key_signature)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6)
       RETURNING *`,
      [req.user.id, title, JSON.stringify(sections), notes, tempo_bpm || null, key_signature || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// Update a song — snapshots current state before applying
router.put('/:id', async (req, res, next) => {
  try {
    // Fetch current state first (for ownership check + snapshot)
    const { rows: current } = await pool.query(
      'SELECT * FROM songs WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (current.length === 0) return res.status(404).json({ error: 'Song not found' });

    await maybeSnapshot(req.params.id, current[0], req.body._reason || 'autosave');

    const { title, sections, notes, tempo_bpm, key_signature } = req.body;
    const { rows } = await pool.query(
      `UPDATE songs SET
         title = COALESCE($1, title),
         sections = COALESCE($2::jsonb, sections),
         notes = COALESCE($3, notes),
         tempo_bpm = $4,
         key_signature = $5,
         updated_at = NOW()
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [
        title ?? null,
        sections ? JSON.stringify(sections) : null,
        notes ?? null,
        tempo_bpm ?? null,
        key_signature ?? null,
        req.params.id,
        req.user.id,
      ]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// Delete a song
router.delete('/:id', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM songs WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Song not found' });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// ── Version history ──────────────────────────────────────────────────────

// List versions for a song
router.get('/:id/versions', async (req, res, next) => {
  try {
    // Ownership check
    const { rows: owns } = await pool.query(
      'SELECT id FROM songs WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (owns.length === 0) return res.status(404).json({ error: 'Song not found' });

    const { rows } = await pool.query(
      `SELECT id, snapshot, reason, created_at
         FROM song_versions
        WHERE song_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [req.params.id, MAX_VERSIONS]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// Restore a specific version. Before overwriting, we snapshot the CURRENT
// state first so the restore itself is undoable.
router.post('/:id/versions/:versionId/restore', async (req, res, next) => {
  try {
    const songId = req.params.id;
    const versionId = req.params.versionId;

    // Ownership check
    const { rows: current } = await pool.query(
      'SELECT * FROM songs WHERE id = $1 AND user_id = $2',
      [songId, req.user.id]
    );
    if (current.length === 0) return res.status(404).json({ error: 'Song not found' });

    const { rows: versions } = await pool.query(
      'SELECT snapshot FROM song_versions WHERE id = $1 AND song_id = $2',
      [versionId, songId]
    );
    if (versions.length === 0) return res.status(404).json({ error: 'Version not found' });

    // Snapshot current state first (force — no throttle) so the revert itself is undoable
    await pool.query(
      'INSERT INTO song_versions (song_id, snapshot, reason) VALUES ($1, $2::jsonb, $3)',
      [songId, JSON.stringify({
        title: current[0].title,
        sections: current[0].sections,
        notes: current[0].notes,
        tempo_bpm: current[0].tempo_bpm,
        key_signature: current[0].key_signature,
      }), 'pre_restore']
    );

    // Apply the restore
    const snap = versions[0].snapshot;
    const { rows } = await pool.query(
      `UPDATE songs SET
         title = $1,
         sections = $2::jsonb,
         notes = $3,
         tempo_bpm = $4,
         key_signature = $5,
         updated_at = NOW()
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [
        snap.title ?? 'Untitled',
        JSON.stringify(snap.sections ?? []),
        snap.notes ?? '',
        snap.tempo_bpm ?? null,
        snap.key_signature ?? null,
        songId,
        req.user.id,
      ]
    );

    // Prune
    await pool.query(
      `DELETE FROM song_versions
        WHERE song_id = $1
          AND id NOT IN (
            SELECT id FROM song_versions
             WHERE song_id = $1
             ORDER BY created_at DESC
             LIMIT $2
          )`,
      [songId, MAX_VERSIONS]
    );

    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
