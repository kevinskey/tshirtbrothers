-- Migration: Create admin_designs table for AI-generated art library
-- Used by generate-art-library.js, GET /api/design/art-library, and admin CRUD at /api/admin/designs-library
-- Run on droplet: sudo -u postgres psql -d tshirtbrothers -f migrations/create_admin_designs_table.sql

CREATE TABLE IF NOT EXISTS admin_designs (
  id SERIAL PRIMARY KEY,
  name VARCHAR(500) NOT NULL,
  description TEXT,
  image_url TEXT NOT NULL,
  thumbnail_url TEXT,
  category VARCHAR(100) DEFAULT 'general',
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  width INTEGER,
  height INTEGER,
  file_size INTEGER,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_designs_category ON admin_designs(category);
CREATE INDEX IF NOT EXISTS idx_admin_designs_tags ON admin_designs USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_admin_designs_created_at ON admin_designs(created_at DESC);
