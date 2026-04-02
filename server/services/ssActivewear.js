const BASE_URL = 'https://api.ssactivewear.com/v2/products/';

export async function fetchProducts(options = {}) {
  const { page = 1, limit = 100 } = options;

  const accountNumber = process.env.SS_ACCOUNT_NUMBER;
  const apiKey = process.env.SS_API_KEY;

  if (!accountNumber || !apiKey) {
    throw new Error('S&S Activewear credentials not configured');
  }

  const credentials = Buffer.from(`${accountNumber}:${apiKey}`).toString('base64');

  const url = new URL(BASE_URL);
  url.searchParams.set('page', page);
  url.searchParams.set('limit', limit);

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`S&S Activewear API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const rawProducts = Array.isArray(data) ? data : data.products || [];

  return rawProducts.map(transformProduct);
}

function transformProduct(raw) {
  return {
    ss_id: String(raw.sku || raw.styleID || raw.id),
    name: raw.styleName || raw.title || raw.name || '',
    brand: raw.brandName || raw.brand || '',
    category: raw.categoryName || raw.category || '',
    base_price: parseFloat(raw.basePrice || raw.price || 0),
    colors: Array.isArray(raw.colors) ? raw.colors : [],
    sizes: Array.isArray(raw.sizes) ? raw.sizes : [],
    image_url: raw.styleImage || raw.imageUrl || raw.image || null,
    back_image_url: raw.styleImageBack || raw.backImageUrl || null,
    specifications: raw.specifications || {},
    price_breaks: Array.isArray(raw.priceBreaks) ? raw.priceBreaks : [],
  };
}
