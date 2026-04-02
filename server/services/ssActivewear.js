// S&S Activewear API - uses /styles/ endpoint (lightweight, grouped by style)
// The /products/ endpoint returns 500MB+ of individual SKUs, so we avoid it.
const STYLES_URL = 'https://api.ssactivewear.com/v2/styles/';

function getCredentials() {
  const accountNumber = process.env.SS_ACCOUNT_NUMBER;
  const apiKey = process.env.SS_API_KEY;
  if (!accountNumber || !apiKey) {
    throw new Error('S&S Activewear credentials not configured');
  }
  return Buffer.from(`${accountNumber}:${apiKey}`).toString('base64');
}

export async function fetchProducts(options = {}) {
  const { page = 1, limit = 50 } = options;
  const credentials = getCredentials();

  const response = await fetch(STYLES_URL, {
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`S&S API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const styles = Array.isArray(data) ? data : [];

  // Paginate in-memory since S&S doesn't support server-side pagination on styles
  const start = (page - 1) * limit;
  const pageStyles = styles.slice(start, start + limit);

  return {
    products: pageStyles.map(transformStyle),
    total: styles.length,
    page,
    totalPages: Math.ceil(styles.length / limit),
  };
}

// Fetch a single style by ID
export async function fetchStyle(styleId) {
  const credentials = getCredentials();
  const response = await fetch(`${STYLES_URL}${styleId}`, {
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`S&S API error ${response.status}`);
  }

  const data = await response.json();
  const raw = Array.isArray(data) ? data[0] : data;
  return raw ? transformStyle(raw) : null;
}

const SS_IMAGE_BASE = 'https://www.ssactivewear.com/';

function toFullImageUrl(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return SS_IMAGE_BASE + path;
}

function transformStyle(raw) {
  return {
    ss_id: String(raw.styleID || raw.sku || raw.id),
    name: raw.title || raw.styleName || raw.name || '',
    brand: raw.brandName || raw.brand || '',
    category: raw.baseCategory || raw.categoryName || raw.category || 'Apparel',
    style_number: raw.styleName || raw.partNumber || '',
    base_price: parseFloat(raw.basePrice || raw.customerPrice || raw.price || 0),
    colors: Array.isArray(raw.styleColors) ? raw.styleColors.map(c => ({
      name: c.colorName || c.name || '',
      hex: c.hex1 || c.hex || '',
      image: toFullImageUrl(c.colorFrontImage || c.image),
    })) : [],
    sizes: Array.isArray(raw.styleSizes) ? raw.styleSizes.map(s => s.sizeName || s.name || s) : [],
    image_url: toFullImageUrl(raw.styleImage || raw.mainImage || raw.imageUrl),
    brand_image: toFullImageUrl(raw.brandImage),
    back_image_url: toFullImageUrl(raw.styleImageSide || raw.styleImageBack),
    specifications: {
      description: raw.description || '',
      material: raw.material || '',
      weight: raw.weight || '',
    },
    price_breaks: Array.isArray(raw.priceBreaks) ? raw.priceBreaks : [],
  };
}
