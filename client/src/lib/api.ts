const API_BASE = '/api';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('tsb_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const { headers: optHeaders, ...restOptions } = options || {};
  const res = await fetch(`${API_BASE}${path}`, {
    ...restOptions,
    headers: {
      'Content-Type': 'application/json',
      ...(optHeaders as Record<string, string>),
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error((err as { error?: string; message?: string }).error ?? (err as { message?: string }).message ?? 'Request failed');
  }

  return res.json() as Promise<T>;
}

async function authRequest<T>(path: string, options?: RequestInit): Promise<T> {
  return request<T>(path, {
    ...options,
    headers: {
      ...getAuthHeaders(),
      ...options?.headers,
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

export async function register(data: { name: string; email: string; password: string }) {
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
  price_breakdown?: PriceBreakdown | null;
  deposit_amount?: number | null;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
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

export async function fetchQuotes(status?: string) {
  const query = status && status !== 'all' ? `?status=${status}` : '';
  return authRequest<Quote[]>(`/quotes${query}`);
}

export async function updateQuoteStatus(id: string, status: string) {
  return authRequest<Quote>(`/quotes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function fetchAdminProducts(search?: string) {
  const query = search ? `?search=${encodeURIComponent(search)}&limit=100` : '?limit=100';
  const data = await request<{ products: Product[] }>(`/products${query}`);
  return data.products || [];
}

export async function fetchCategories() {
  return request<Category[]>('/categories');
}

export async function createCategory(data: { name: string; parentId?: string; description: string }) {
  return authRequest<Category>('/admin/categories', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteCategory(id: string) {
  return authRequest<void>(`/admin/categories/${id}`, {
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
  created_at: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
}

export async function fetchCustomers(search?: string) {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  return authRequest<Customer[]>(`/admin/customers${query}`);
}

export async function fetchCustomer(id: string) {
  return authRequest<CustomerDetail>(`/admin/customers/${id}`);
}

export async function fetchCustomerDesigns(search?: string) {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  return authRequest<CustomerDesign[]>(`/admin/customer-designs${query}`);
}

export async function fetchOrders(status?: string) {
  const query = status && status !== 'all' ? `?status=${status}` : '';
  return authRequest<Order[]>(`/admin/orders${query}`);
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
