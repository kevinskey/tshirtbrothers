const API_BASE = '/api';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('tsb_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new Error((error as { message?: string }).message ?? 'Request failed');
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
  customerName: string;
  customerEmail: string;
  productName: string;
  quantity: number;
  status: 'pending' | 'approved' | 'completed' | 'rejected';
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

export async function fetchDashboardStats() {
  return authRequest<DashboardStats>('/admin/stats');
}

export async function fetchQuotes(status?: string) {
  const query = status && status !== 'all' ? `?status=${status}` : '';
  return authRequest<Quote[]>(`/admin/quotes${query}`);
}

export async function updateQuoteStatus(id: string, status: string) {
  return authRequest<Quote>(`/admin/quotes/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function fetchAdminProducts(search?: string) {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  return authRequest<Product[]>(`/admin/products${query}`);
}

export async function fetchCategories() {
  return authRequest<Category[]>('/admin/categories');
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
