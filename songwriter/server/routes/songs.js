import { Router } from 'express';
import pool from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

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

// Update a song
router.put('/:id', async (req, res, next) => {
  try {
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
    if (rows.length === 0) return res.status(404).json({ error: 'Song not found' });
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

export default router;
