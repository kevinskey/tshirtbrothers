-- T-Shirt Brothers Database Schema

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  ss_id VARCHAR(100) UNIQUE,
  name VARCHAR(500) NOT NULL,
  brand VARCHAR(255),
  category VARCHAR(255),
  base_price DECIMAL(10, 2),
  colors JSONB DEFAULT '[]',
  sizes JSONB DEFAULT '[]',
  image_url TEXT,
  back_image_url TEXT,
  specifications JSONB DEFAULT '{}',
  price_breaks JSONB DEFAULT '[]',
  is_featured BOOLEAN DEFAULT FALSE,
  last_synced TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'customer',
  name VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quotes (
  id SERIAL PRIMARY KEY,
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50),
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  color VARCHAR(100),
  sizes JSONB DEFAULT '[]',
  print_areas JSONB DEFAULT '[]',
  design_type VARCHAR(100),
  design_url TEXT,
  quantity INTEGER NOT NULL,
  estimated_price DECIMAL(10, 2),
  status VARCHAR(50) DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI-generated art library for Design Studio "Add Art" panel
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_products_is_featured ON products(is_featured);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_customer_email ON quotes(customer_email);
CREATE INDEX IF NOT EXISTS idx_admin_designs_category ON admin_designs(category);
CREATE INDEX IF NOT EXISTS idx_admin_designs_tags ON admin_designs USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_admin_designs_created_at ON admin_designs(created_at DESC);
