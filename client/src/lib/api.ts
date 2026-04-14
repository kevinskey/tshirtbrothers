const API_BASE = '/api';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('tsb_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init?.headers) {
    const h = init.headers;
    if (h instanceof Headers) {
      h.forEach((v, k) => { headers[k] = v; });
    } else if (Array.isArray(h)) {
      h.forEach(([k, v]) => { headers[k] = v; });
    } else {
      Object.assign(headers, h);
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: init?.method,
    body: init?.body,
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error((err as { error?: string; message?: string }).error ?? (err as { message?: string }).message ?? 'Request failed');
  }

  return res.json() as Promise<T>;
}

async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const authHeaders = getAuthHeaders();
  const existingHeaders = init?.headers || {};
  return request<T>(path, {
    method: init?.method,
    body: init?.body,
    headers: {
      ...authHeaders,
      ...(existingHeaders as Record<string, string>),
    },
  });
}

export async function fetchProducts() {
  return request<unknown[]>('/products');
}

export async function fetchFeaturedProducts() {
  return request<unknown[]>('/products/featured');
}

export async function fetchProduct(id: string) {
  return request<unknown>(`/products/${id}`);
}

export async function submitQuote(data: Record<string, unknown>) {
  return request<unknown>('/quotes', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function login(credentials: { email: string; password: string }) {
  return request<{ token: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export async function register(data: { name: string; email: string; password: string; phone?: string }) {
  return request<{ token: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function syncProducts() {
  return authRequest<unknown>('/admin/sync-products', {
    method: 'POST',
  });
}

// Admin API
export interface Quote {
  id: string;
  createdAt: string;
  created_at?: string;
  customerName: string;
  customer_name?: string;
  customerEmail: string;
  customer_email?: string;
  customerPhone?: string;
  customer_phone?: string;
  productName: string;
  product_name?: string;
  quantity: number;
  status: 'pending' | 'reviewed' | 'quoted' | 'approved' | 'accepted' | 'completed' | 'rejected';
  estimated_price?: number | null;
  notes?: string;
  sizes?: unknown;
  print_areas?: unknown;
  design_type?: string;
  design_url?: string | null;
  price_breakdown?: PriceBreakdown | null;
  deposit_amount?: number | null;
  color?: string;
  shipping_address?: unknown;
  date_needed?: string;
  shipping_method?: string;
  admin_notes?: string | null;
  triage?: {
    urgency?: 'low' | 'medium' | 'high' | 'rush';
    complexity?: 'simple' | 'moderate' | 'complex';
    estimated_hours?: number;
    summary?: string;
  } | null;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  base_price?: number;
  custom_price?: number | null;
  price_visible?: boolean;
  image_url?: string;
  colors: string[];
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  description: string;
}

export interface DashboardStats {
  totalQuotes: number;
  pendingQuotes: number;
  totalProducts: number;
  totalCategories: number;
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  // Build stats from multiple endpoints
  const [quotesRes, productsRes, categoriesRes] = await Promise.all([
    fetch(`${API_BASE}/quotes`, { headers: { ...getAuthHeaders() } }).then(r => r.ok ? r.json() : { quotes: [] }),
    fetch(`${API_BASE}/products?limit=1`).then(r => r.ok ? r.json() : { total: 0 }),
    fetch(`${API_BASE}/categories`).then(r => r.ok ? r.json() : []),
  ]);
  const quotes = Array.isArray(quotesRes) ? quotesRes : quotesRes.quotes || [];
  return {
    totalQuotes: quotes.length,
    pendingQuotes: quotes.filter((q: Quote) => q.status === 'pending').length,
    totalProducts: productsRes.total || 0,
    totalCategories: Array.isArray(categoriesRes) ? categoriesRes.length : 0,
  };
}

export async function fetchQuotes(status?: string, search?: string, sort?: string) {
  const params = new URLSearchParams();
  if (status && status !== 'all') params.set('status', status);
  if (search) params.set('search', search);
  if (sort) params.set('sort', sort);
  const query = params.toString() ? `?${params.toString()}` : '';
  return authRequest<Quote[]>(`/quotes${query}`);
}

export async function updateAdminNotes(id: string, admin_notes: string) {
  return authRequest<{ id: string; admin_notes: string }>(`/quotes/${id}/admin-notes`, {
    method: 'PATCH',
    body: JSON.stringify({ admin_notes }),
  });
}

export async function fetchAdminCounts() {
  return authRequest<{ pending_quotes: string; active_quotes: string; active_orders: string }>('/admin/stats/counts');
}

export async function updateQuoteStatus(id: string, status: string) {
  return authRequest<Quote>(`/quotes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function fetchAdminProducts(search?: string, page = 1) {
  const params = new URLSearchParams({ limit: '50', page: String(page) });
  if (search) params.set('search', search);
  const data = await request<{ products: Product[]; total: number; totalPages: number; page: number }>(`/products?${params}`);
  return data;
}

export interface CustomProduct {
  id: number;
  name: string;
  description?: string;
  category?: string;
  image_url?: string;
  price?: number;
  price_unit?: string;
  sizes?: unknown;
  options?: unknown;
}

export async function fetchCustomProducts() {
  return authRequest<CustomProduct[]>('/admin/custom-products');
}

export async function fetchCategories() {
  return request<Category[]>('/categories');
}

export async function createCategory(data: { name: string; parentId?: string; description: string }) {
  return authRequest<Category>('/categories', {
    method: 'POST',
    body: JSON.stringify({ name: data.name, parent_id: data.parentId, description: data.description }),
  });
}

export async function deleteCategory(id: string) {
  return authRequest<void>(`/categories/${id}`, {
    method: 'DELETE',
  });
}

export async function generateDesign(data: Record<string, unknown>) {
  return request<unknown>('/design/generate', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export interface PriceBreakdown {
  basePrice: number;
  printingCost: number;
  designFee: number;
  rushFee: number;
  total: number;
  shipping?: number;
  sizeMarkups?: Record<string, string>;
}

export interface SendQuotePricePayload {
  quoteId: string;
  priceBreakdown: PriceBreakdown;
  message?: string;
}

export async function sendQuotePrice(data: SendQuotePricePayload) {
  return authRequest<{ success: boolean; quote: unknown }>('/quotes/admin/send-price', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// Customer types & API
export interface Customer {
  id: string;
  email: string;
  name: string;
  phone?: string;
  address_street?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
  created_at: string;
  design_count: number;
  quote_count: number;
}

export interface CustomerDetail extends Customer {
  designs: CustomerDesign[];
  quotes: CustomerQuote[];
}

export interface CustomerDesign {
  id: string;
  name: string;
  product_name: string;
  product_ss_id?: string;
  product_image?: string;
  color_index?: number;
  elements?: unknown[];
  thumbnail?: string;
  mockup_url: string | null;
  print_url: string | null;
  created_at: string;
  user_name: string;
  user_email: string;
}

export interface CustomerQuote {
  id: string;
  product_name: string;
  quantity: number;
  status: string;
  estimated_price: number | null;
  created_at: string;
}

export interface Order {
  id: string;
  product_name: string;
  quantity: number;
  status: string;
  estimated_price: number | null;
  deposit_amount: number | null;
  accepted_at: string | null;
  balance_paid_at: string | null;
  created_at: string;
  date_needed: string | null;
  notes: string | null;
  admin_notes: string | null;
  shipping_method: string | null;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
}

export async function sendBalanceRequest(quoteId: string) {
  return authRequest<{ success: boolean; balanceDue: number }>('/quotes/admin/send-balance', {
    method: 'POST',
    body: JSON.stringify({ quoteId }),
  });
}

export interface QuotePriceBreakdown {
  product: {
    name: string;
    unit_price: number;
    quantity: number;
    subtotal: number;
  };
  gang_sheet: {
    graphic_width_in: number;
    graphic_height_in: number;
    copies_across: number;
    rows_per_foot: number;
    copies_per_foot: number;
    feet_needed: number;
    pricing_tier: string;
    is_rush: boolean;
    rate_per_foot: number;
    subtotal: number;
  };
  setup_fee: number;
  design_fee: number;
  shipping: number;
  taxable_subtotal: number;
  tax_rate: number;
  tax: number;
}

export async function calculateQuotePrice(input: {
  product_id: number;
  quantity: number;
  graphic_width_in: number;
  graphic_height_in: number;
  pricing_tier?: 'standard' | 'rush' | 'hotRush';
  setup_fee?: number;
  design_fee?: number;
  shipping?: number;
  tax_rate?: number;
}) {
  return authRequest<{ breakdown: QuotePriceBreakdown; total: number }>(
    '/quotes/admin/calculate-price',
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export async function fetchCustomers(search?: string) {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  return authRequest<Customer[]>(`/admin/customers${query}`);
}

export async function fetchCustomer(id: string) {
  return authRequest<CustomerDetail>(`/admin/customers/${id}`);
}

export interface BulkImportCustomerRow {
  name: string;
  email: string;
  phone?: string;
}

export interface BulkImportResult {
  created: number;
  updated?: number;
  skipped: number;
  failed: number;
  total: number;
  results: Array<{
    row: number;
    email: string;
    status: 'created' | 'updated' | 'skipped' | 'error';
    message?: string;
  }>;
}

export async function bulkImportCustomers(rows: BulkImportCustomerRow[], updateExisting = false) {
  return authRequest<BulkImportResult>('/admin/customers/bulk-import', {
    method: 'POST',
    body: JSON.stringify({ rows, update_existing: updateExisting }),
  });
}

export interface EmbroideryJob {
  id: number;
  name: string;
  notes: string | null;
  status: 'artwork_received' | 'sent_to_digitizer' | 'dst_ready' | 'in_production' | 'completed' | 'cancelled';
  source_image_url: string | null;
  vector_svg_url: string | null;
  dst_file_url: string | null;
  colors: number | null;
  digitizer: string | null;
  cost: number | string | null;
  quote_id: number | null;
  customer_id: number | null;
  customer_name?: string | null;
  customer_email?: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchEmbroideryJobs(opts: { status?: string; search?: string } = {}) {
  const p = new URLSearchParams();
  if (opts.status) p.set('status', opts.status);
  if (opts.search) p.set('search', opts.search);
  const qs = p.toString() ? `?${p}` : '';
  return authRequest<EmbroideryJob[]>(`/admin/embroidery-jobs${qs}`);
}

export async function createEmbroideryJob(input: {
  name: string;
  notes?: string;
  imageBase64: string;
  filename?: string;
  quote_id?: number | null;
  customer_id?: number | null;
  colors?: number | null;
}) {
  return authRequest<EmbroideryJob>('/admin/embroidery-jobs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateEmbroideryJob(id: number, fields: Partial<EmbroideryJob>) {
  return authRequest<EmbroideryJob>(`/admin/embroidery-jobs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
}

export async function attachEmbroideryDst(id: number, dstBase64: string, filename?: string) {
  return authRequest<EmbroideryJob>(`/admin/embroidery-jobs/${id}/dst`, {
    method: 'POST',
    body: JSON.stringify({ dstBase64, filename }),
  });
}

export async function vectorizeEmbroideryJob(id: number, colors?: number) {
  return authRequest<EmbroideryJob>(`/admin/embroidery-jobs/${id}/vectorize`, {
    method: 'POST',
    body: JSON.stringify({ colors: colors || 1 }),
  });
}

export async function deleteEmbroideryJob(id: number) {
  return authRequest<{ deleted: true }>(`/admin/embroidery-jobs/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchCustomerDesigns(search?: string) {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  return authRequest<CustomerDesign[]>(`/admin/customer-designs${query}`);
}

export async function deleteQuote(id: string) {
  return authRequest<{ deleted: boolean }>(`/quotes/${id}`, { method: 'DELETE' });
}

export async function deleteDesign(id: string) {
  return authRequest<{ deleted: boolean }>(`/admin/designs/${id}`, { method: 'DELETE' });
}

export async function fetchOrders(status?: string, search?: string, sort?: string) {
  const params = new URLSearchParams();
  if (status && status !== 'all') params.set('status', status);
  if (search) params.set('search', search);
  if (sort) params.set('sort', sort);
  const query = params.toString() ? `?${params.toString()}` : '';
  return authRequest<Order[]>(`/admin/orders${query}`);
}

// Invoices
export interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  weight_oz?: number;
  shipping_cost?: number;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  customer_address: string | null;
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  total: number;
  amount_paid: number;
  amount_due: number;
  notes: string | null;
  due_date: string | null;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  quote_id: string | null;
  payments: { amount: number; method: string; date: string }[];
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateInvoiceData {
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  customer_address?: string;
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  total: number;
  notes?: string;
  due_date?: string;
  quote_id?: string;
}

export async function fetchInvoices(status?: string): Promise<Invoice[]> {
  const query = status && status !== 'all' ? `?status=${status}` : '';
  return authRequest<Invoice[]>(`/invoices${query}`);
}

export async function fetchInvoice(id: string): Promise<Invoice> {
  return authRequest<Invoice>(`/invoices/${id}`);
}

export async function createInvoice(data: CreateInvoiceData): Promise<Invoice> {
  return authRequest<Invoice>('/invoices', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateInvoice(id: string, data: Partial<CreateInvoiceData & { status: string }>): Promise<Invoice> {
  return authRequest<Invoice>(`/invoices/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function sendInvoice(id: string): Promise<Invoice> {
  return authRequest<Invoice>(`/invoices/${id}/send`, {
    method: 'POST',
  });
}

export async function recordPayment(id: string, data: { amount: number; method: string }): Promise<Invoice> {
  return authRequest<Invoice>(`/invoices/${id}/record-payment`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteInvoice(id: string): Promise<{ deleted: boolean }> {
  return authRequest<{ deleted: boolean }>(`/invoices/${id}`, { method: 'DELETE' });
}

// Blog
export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  content: string;
  excerpt: string | null;
  cover_image: string | null;
  author: string;
  tags: string[];
  status: 'draft' | 'published';
  meta_title: string | null;
  meta_description: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function fetchBlogPosts(tag?: string): Promise<BlogPost[]> {
  const query = tag ? `?tag=${encodeURIComponent(tag)}` : '';
  return request<BlogPost[]>(`/blog${query}`);
}

export async function fetchBlogPost(slug: string): Promise<BlogPost> {
  return request<BlogPost>(`/blog/${slug}`);
}

export async function fetchAdminBlogPosts(): Promise<BlogPost[]> {
  return authRequest<BlogPost[]>('/blog/admin/all');
}

export async function createBlogPost(data: Partial<BlogPost>): Promise<BlogPost> {
  return authRequest<BlogPost>('/blog', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateBlogPost(id: string, data: Partial<BlogPost>): Promise<BlogPost> {
  return authRequest<BlogPost>(`/blog/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteBlogPost(id: string): Promise<{ deleted: boolean }> {
  return authRequest<{ deleted: boolean }>(`/blog/${id}`, { method: 'DELETE' });
}

export async function publishBlogPost(id: string): Promise<BlogPost> {
  return authRequest<BlogPost>(`/blog/${id}/publish`, { method: 'POST' });
}

// Settings
export async function fetchSettings(): Promise<Record<string, string>> {
  return authRequest<Record<string, string>>('/admin/settings');
}

export async function updateSettings(settings: Record<string, string>): Promise<{ success: boolean }> {
  const token = localStorage.getItem('tsb_token') || localStorage.getItem('token');
  const res = await fetch(`${API_BASE}/admin/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error('Failed to save settings');
  return res.json();
}
