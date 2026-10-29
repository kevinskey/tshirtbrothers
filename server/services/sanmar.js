// SanMar Standard Web Services client (SOAP/XML over HTTPS, port 8080).
// Auth is per-call: customer number + sanmar.com web user credentials.
// The responses are flat, fixed-schema XML, so we parse with a small
// tag extractor instead of pulling in a SOAP/XML dependency.
const PRODUCT_INFO_URL =
  'https://ws.sanmar.com:8080/SanMarWebService/SanMarProductInfoServicePort';
const INVENTORY_URL =
  'https://ws.sanmar.com:8080/SanMarWebService/SanMarWebServicePort';

// Brands SanMar prohibits from blank / direct-to-consumer sale. These sync
// with decorated_only=true so storefronts can exclude them from blanks
// listings while quotes and the studio can still use them.
export const DECORATED_ONLY_BRANDS = new Set([
  'Nike',
  'OGIO',
  'OGIO Endurance',
  'New Era',
  'Eddie Bauer',
  'Alternative Apparel',
]);

// The North Face can't be ordered through the integration at all — never sync.
export const EXCLUDED_BRANDS = new Set(['The North Face']);

function getCredentials() {
  const customerNumber = process.env.SANMAR_CUSTOMER_NUMBER;
  const username = process.env.SANMAR_USERNAME;
  const password = process.env.SANMAR_PASSWORD;
  if (!customerNumber || !username || !password) {
    throw new Error('SanMar credentials not configured');
  }
  return { customerNumber, username, password };
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function xmlDecode(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

// Extract the text content of the first <tag>...</tag> in a block.
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? xmlDecode(m[1].trim()) : null;
}

function num(block, name) {
  const v = tag(block, name);
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function authBlock() {
  const { customerNumber, username, password } = getCredentials();
  return `<arg1>
    <sanMarCustomerNumber>${xmlEscape(customerNumber)}</sanMarCustomerNumber>
    <sanMarUserName>${xmlEscape(username)}</sanMarUserName>
    <sanMarUserPassword>${xmlEscape(password)}</sanMarUserPassword>
    <senderId></senderId>
    <senderPassword></senderPassword>
  </arg1>`;
}

// The product-info port lives in the impl.* namespace; the inventory port
// (SanMarWebServicePort) in webservice.integration.sanmar.com — declare both.
async function soapCall(url, body, { timeoutMs = 180000 } = {}) {
  const envelope = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:impl="http://impl.webservice.integration.sanmar.com/" xmlns:web="http://webservice.integration.sanmar.com/">
  <soapenv:Header/>
  <soapenv:Body>${body}</soapenv:Body>
</soapenv:Envelope>`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml;charset=UTF-8', SOAPAction: '""' },
    body: envelope,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`SanMar API HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  if (tag(text, 'errorOccured') === 'true') {
    throw new Error(`SanMar API error: ${tag(text, 'message') || 'unknown error'}`);
  }
  return text;
}

function parseProductList(xml) {
  const products = [];
  const re = /<listResponse>([\s\S]*?)<\/listResponse>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const basic = block;
    const brandName = tag(basic, 'brandName');
    products.push({
      uniqueKey: num(basic, 'uniqueKey'),
      inventoryKey: num(basic, 'inventoryKey'),
      style: tag(basic, 'style'),
      brandName,
      productTitle: tag(basic, 'productTitle'),
      productDescription: tag(basic, 'productDescription'),
      category: tag(basic, 'category'),
      keywords: tag(basic, 'keywords'),
      color: tag(basic, 'catalogColor') || tag(basic, 'color'),
      size: tag(basic, 'size'),
      sizeIndex: num(basic, 'sizeIndex'),
      availableSizes: tag(basic, 'availableSizes'),
      caseSize: num(basic, 'caseSize'),
      pieceWeight: num(basic, 'pieceWeight'),
      productStatus: tag(basic, 'productStatus'),
      piecePrice: num(basic, 'piecePrice'),
      dozenPrice: num(basic, 'dozenPrice'),
      casePrice: num(basic, 'casePrice'),
      pieceSalePrice: num(basic, 'pieceSalePrice'),
      dozenSalePrice: num(basic, 'dozenSalePrice'),
      caseSalePrice: num(basic, 'caseSalePrice'),
      saleStartDate: tag(basic, 'saleStartDate'),
      saleEndDate: tag(basic, 'saleEndDate'),
      priceCode: tag(basic, 'priceCode'),
      images: {
        product: tag(block, 'productImage'),
        thumbnail: tag(block, 'thumbnailImage'),
        colorProduct: tag(block, 'colorProductImage'),
        colorProductThumbnail: tag(block, 'colorProductImageThumbnail'),
        colorSwatch: tag(block, 'colorSwatchImage'),
        colorSquare: tag(block, 'colorSquareImage'),
        frontModel: tag(block, 'frontModel'),
        backModel: tag(block, 'backModel'),
        sideModel: tag(block, 'sideModel'),
        threeQModel: tag(block, 'threeQModel'),
        frontFlat: tag(block, 'frontFlat'),
        backFlat: tag(block, 'backFlat'),
        specSheet: tag(block, 'specSheet'),
        brandLogo: tag(block, 'brandLogoImage'),
      },
      decoratedOnly: brandName ? DECORATED_ONLY_BRANDS.has(brandName) : false,
    });
  }
  return products.filter((p) => p.uniqueKey !== null);
}

// Full catalog pull for one brand. Responses can be tens of MB; the long
// timeout is deliberate (SanMar's guide warns byBrand calls are slow).
export async function getProductInfoByBrand(brandName) {
  const xml = await soapCall(
    PRODUCT_INFO_URL,
    `<impl:getProductInfoByBrand>
      <arg0><brandName>${xmlEscape(brandName)}</brandName></arg0>
      ${authBlock()}
    </impl:getProductInfoByBrand>`
  );
  return parseProductList(xml);
}

// Targeted lookup; color and size are optional.
export async function getProductInfoByStyle(style, { color, size } = {}) {
  const parts = [`<style>${xmlEscape(style)}</style>`];
  if (color) parts.push(`<color>${xmlEscape(color)}</color>`);
  if (size) parts.push(`<size>${xmlEscape(size)}</size>`);
  const xml = await soapCall(
    PRODUCT_INFO_URL,
    `<impl:getProductInfoByStyleColorSize>
      <arg0>${parts.join('')}</arg0>
      ${authBlock()}
    </impl:getProductInfoByStyleColorSize>`,
    { timeoutMs: 60000 }
  );
  return parseProductList(xml);
}

// The inventory response is bare <listResponse> integers in this fixed
// warehouse order (per the integration guide; 8-11 are virtual).
const WAREHOUSES = [
  { no: 1, city: 'Seattle', state: 'WA' },
  { no: 2, city: 'Cincinnati', state: 'OH' },
  { no: 3, city: 'Dallas', state: 'TX' },
  { no: 4, city: 'Reno', state: 'NV' },
  { no: 5, city: 'Robbinsville', state: 'NJ' },
  { no: 6, city: 'Jacksonville', state: 'FL' },
  { no: 7, city: 'Minneapolis', state: 'MN' },
  { no: 12, city: 'Phoenix', state: 'AZ' },
];

// Live warehouse inventory for a style/color/size via the SanMar standard
// inventory service. Returns { total, warehouses: [{no, city, state, qty}] }.
export async function getInventory(style, color, size) {
  const { customerNumber, username, password } = getCredentials();
  const xml = await soapCall(
    INVENTORY_URL,
    `<web:getInventoryQtyForStyleColorSize>
      <arg0>${xmlEscape(customerNumber)}</arg0>
      <arg1>${xmlEscape(username)}</arg1>
      <arg2>${xmlEscape(password)}</arg2>
      <arg3>${xmlEscape(style)}</arg3>
      <arg4>${xmlEscape(color)}</arg4>
      <arg5>${xmlEscape(size)}</arg5>
    </web:getInventoryQtyForStyleColorSize>`,
    { timeoutMs: 30000 }
  );
  const qtys = [];
  const re = /<listResponse[^>]*>(\d+)<\/listResponse>/g;
  let m;
  while ((m = re.exec(xml)) !== null) qtys.push(Number(m[1]));
  const warehouses = WAREHOUSES.map((w, i) => ({ ...w, qty: qtys[i] ?? 0 }));
  return { total: qtys.reduce((a, b) => a + b, 0), warehouses };
}
