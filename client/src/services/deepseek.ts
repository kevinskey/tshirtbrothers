// DeepSeek API client for T-Shirt Brothers
// Matches the endpoints in /server/routes/deepseek.js

const API_BASE = '/api/deepseek';

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('tsb_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function post<T>(path: string, body: unknown, requireAuth = false): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(requireAuth ? getAuthHeaders() : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error((err as { error?: string }).error || 'Request failed');
  }
  return res.json() as Promise<T>;
}

// ── 1. FAQ chat ──────────────────────────────────────────────────────────────
export interface CatalogProduct {
  id: number;
  ss_id: string;
  name: string;
  brand: string;
  category: string;
  image_url: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  products?: CatalogProduct[];
  imageUrl?: string;
  imagePrompt?: string;
}

export async function askFaq(message: string, history: ChatMessage[] = []) {
  return post<{ reply: string; cached?: boolean; fallback?: boolean; products?: CatalogProduct[] }>('/faq', {
    message,
    history: history.map((m) => ({ role: m.role, content: m.content })),
  });
}

// ── 2. Pricing suggestion ────────────────────────────────────────────────────
export interface PriceSuggestionInput {
  product_type: string;
  quantity: number;
  print_areas?: number;
  colors_in_design?: number;
  is_rush?: boolean;
  deadline_days?: number;
}

export interface PriceSuggestion {
  suggested_price: number;
  bulk_tier_prices: Record<string, number>;
  profit_margin_percentage: number;
  confidence_level: number;
  reasoning: string;
}

export async function suggestPrice(input: PriceSuggestionInput) {
  return post<PriceSuggestion>('/suggest-price', input, true);
}

// ── 3. Design prompt enhancer ────────────────────────────────────────────────
export async function enhancePrompt(prompt: string, color?: string, garment_type?: string) {
  return post<{ enhanced_prompt: string; variant: 'original' | 'enhanced' | 'fallback' }>(
    '/enhance-prompt',
    { prompt, color, garment_type }
  );
}

// ── Generate design image via DALL-E (existing /api/design/generate endpoint) ─
export async function generateDesignImage(prompt: string, options?: { color?: string; garmentType?: string; removeBackground?: boolean }) {
  const res = await fetch('/api/design/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      color: options?.color,
      garmentType: options?.garmentType,
      removeBackground: options?.removeBackground ?? true,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Generation failed' }));
    throw new Error((err as { error?: string }).error || 'Generation failed');
  }
  return res.json() as Promise<{ imageUrl: string; backgroundRemoved?: boolean }>;
}

// ── 4. Quote classification / triage ─────────────────────────────────────────
export interface QuoteTriage {
  urgency: 'low' | 'medium' | 'high' | 'rush';
  complexity: 'simple' | 'moderate' | 'complex';
  estimated_hours: number;
  recommended_department: 'sales' | 'design' | 'production';
  suggested_followup_time: string;
  summary: string;
}

export async function classifyQuote(quote_text: string, quote_id?: string | number) {
  return post<QuoteTriage>('/classify-quote', { quote_text, quote_id }, true);
}

// ── 5. Draft reply generator ─────────────────────────────────────────────────
export interface DraftReply {
  professional: string;
  friendly: string;
  urgent: string;
}

export async function draftReply(customer_question: string, customer_email?: string, order_context?: string) {
  return post<DraftReply>('/draft-reply', { customer_question, customer_email, order_context }, true);
}

// ── 6. Blog post generator ───────────────────────────────────────────────────
export interface BlogPostDraft {
  title: string;
  meta_description: string;
  slug_suggestion: string;
  outline: string[];
  full_html_content: string;
  saved?: { id: number; slug: string; title: string } | null;
}

export async function generateBlogPost(input: {
  topic: string;
  target_keywords?: string;
  tone?: 'educational' | 'promotional' | 'how-to';
  length?: 'short' | 'medium' | 'long';
}) {
  return post<BlogPostDraft>('/generate-blog-post', input, true);
}
