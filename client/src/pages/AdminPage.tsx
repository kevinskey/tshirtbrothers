import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LayoutDashboard,
  FileText,
  Package,
  FolderTree,
  Settings,
  ArrowLeft,
  LogOut,
  RefreshCw,
  Search,
  ChevronDown,
  Loader2,
  ClipboardList,
  Clock,
  Layers,
  Tags,
  Plus,
  Trash2,
  Palette,
  Users,
  ShoppingBag,
  ExternalLink,
  Download,
  Eye,
  X,
  DollarSign,
  Send,
  Receipt,
  PenSquare,
  Sparkles,
  Edit3,
} from 'lucide-react';
import {
  fetchDashboardStats,
  fetchQuotes,
  updateQuoteStatus,
  fetchAdminProducts,
  fetchCategories,
  createCategory,
  deleteCategory,
  syncProducts,
  fetchCustomers,
  fetchCustomer,
  fetchCustomerDesigns,
  fetchOrders,
  deleteDesign,
  deleteQuote,
  sendQuotePrice,
  fetchSettings,
  updateSettings,
  type Quote,
  type Product,
  type Category,
  type Customer,
  // type CustomerDetail,
  type CustomerDesign,
  type Order,
  type SendQuotePricePayload,
  type Invoice,
  type InvoiceItem,
  type CreateInvoiceData,
  fetchInvoices,
  fetchCustomProducts,
  type CustomProduct,
  createInvoice,
  updateInvoice,
  sendInvoice,
  deleteInvoice,
  recordPayment,
  type BlogPost,
  fetchAdminBlogPosts,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  publishBlogPost,
  sendBalanceRequest,
  updateAdminNotes,
  fetchAdminCounts,
} from '@/lib/api';
import PromoManager from '@/components/admin/PromoManager';
import DesignWorkspace from '@/components/admin/DesignWorkspace';
import { classifyQuote, draftReply, suggestPrice, type QuoteTriage, type DraftReply, type PriceSuggestion } from '@/services/deepseek';

type Section = 'dashboard' | 'quotes' | 'products' | 'categories' | 'designs' | 'customers' | 'orders' | 'invoices' | 'blog' | 'pricing' | 'promotions' | 'workspace' | 'gangsheet' | 'settings';
type QuoteFilter = 'all' | 'pending' | 'quoted' | 'approved' | 'accepted' | 'completed' | 'rejected';
type OrderFilter = 'all' | 'accepted' | 'completed';

type NavItem = {
  key: Section;
  label: string;
  icon: typeof LayoutDashboard;
};

type NavGroup = {
  key: string;
  label: string;
  icon: typeof LayoutDashboard;
  children: NavItem[];
};

type NavEntry = NavItem | NavGroup;

const isGroup = (entry: NavEntry): entry is NavGroup => 'children' in entry;

const NAV_ITEMS: NavEntry[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'quotes', label: 'Quotes', icon: FileText },
  { key: 'orders', label: 'Orders', icon: ShoppingBag },
  { key: 'invoices', label: 'Invoices', icon: Receipt },
  { key: 'designs', label: 'Designs', icon: Palette },
  { key: 'customers', label: 'Customers', icon: Users },
  {
    key: 'catalogue',
    label: 'Catalogue',
    icon: Package,
    children: [
      { key: 'products', label: 'Products', icon: Package },
      { key: 'categories', label: 'Categories', icon: FolderTree },
      { key: 'pricing', label: 'AI Pricing', icon: DollarSign },
    ],
  },
  { key: 'blog', label: 'Blog', icon: PenSquare },
  { key: 'workspace', label: 'Design Lab', icon: Palette },
  { key: 'promotions', label: 'Promotions', icon: Sparkles },
  { key: 'gangsheet', label: 'Gang Sheets', icon: Layers },
  { key: 'settings', label: 'Settings', icon: Settings },
];

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  reviewed: 'bg-orange-100 text-orange-800',
  quoted: 'bg-purple-100 text-purple-800',
  approved: 'bg-green-100 text-green-800',
  accepted: 'bg-emerald-100 text-emerald-800',
  completed: 'bg-blue-100 text-blue-800',
  rejected: 'bg-red-100 text-red-800',
  draft: 'bg-gray-100 text-gray-800',
  sent: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-500',
  published: 'bg-green-100 text-green-800',
};

type InvoiceFilter = 'all' | 'draft' | 'sent' | 'paid' | 'overdue';
type InvoiceView = 'list' | 'create' | 'preview';

// S&S Pricing helper for the Send Price modal
function SSPricingInfo({ productName, quantity, printAreas }: { productName: string; quantity: number; printAreas?: unknown }) {
  const { data, isLoading } = useQuery({
    queryKey: ['ss-pricing', productName],
    queryFn: async () => {
      // Search for product to get its ss_id, then fetch pricing
      const searchRes = await fetch(`/api/products?search=${encodeURIComponent(productName)}&limit=1`);
      if (!searchRes.ok) return null;
      const searchData = await searchRes.json();
      const product = searchData.products?.[0];
      if (!product?.ss_id) return null;

      const priceRes = await fetch(`/api/products/pricing/${product.ss_id}`);
      if (!priceRes.ok) return null;
      const priceData = await priceRes.json();
      return priceData.pricing;
    },
    enabled: !!productName,
    staleTime: 1000 * 60 * 30,
  });

  if (isLoading) return <div className="bg-blue-50 rounded-lg p-4 mb-4 text-sm text-blue-600">Loading S&S pricing...</div>;
  if (!data) return null;

  const areas = Array.isArray(printAreas) ? printAreas : [];
  const wholesaleCost = data.customerPrice * quantity;
  const retailValue = data.retailPrice * quantity;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <h4 className="text-sm font-bold text-blue-900 mb-3">S&S Activewear Wholesale Cost</h4>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div className="text-blue-700">Your cost per item:</div>
        <div className="font-semibold text-blue-900">${data.customerPrice.toFixed(2)}</div>
        <div className="text-blue-700">Retail price per item:</div>
        <div className="font-semibold text-blue-900">${data.retailPrice.toFixed(2)}</div>
        <div className="text-blue-700">Qty:</div>
        <div className="font-semibold text-blue-900">{quantity}</div>
        <div className="text-blue-700">Total wholesale cost:</div>
        <div className="font-bold text-blue-900">${wholesaleCost.toFixed(2)}</div>
        <div className="text-blue-700">Total retail value:</div>
        <div className="font-semibold text-gray-500">${retailValue.toFixed(2)}</div>
        {areas.length > 0 && (
          <>
            <div className="text-blue-700">Print areas:</div>
            <div className="font-semibold text-blue-900">{areas.join(', ')}</div>
          </>
        )}
      </div>
      <div className="mt-3 pt-3 border-t border-blue-200">
        <p className="text-xs text-blue-600">
          Suggested markup: Set your base price above ${data.customerPrice.toFixed(2)}/item.
          At 2x markup → ${(data.customerPrice * 2).toFixed(2)}/item (${(data.customerPrice * 2 * quantity).toFixed(2)} total).
          Add printing costs on top.
        </p>
      </div>
    </div>
  );
}

// ─── Gang Sheet List ─────────────────────────────────────────────────────────

function GangSheetList() {
  const [sheets, setSheets] = useState<{ id: number; name: string; sheet_length_ft: number; pricing_tier: string; total_cost: number; status: string; design_count: number; created_at: string; updated_at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('tsb_token');
    fetch('/api/admin/gangsheets', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(setSheets)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this gang sheet?')) return;
    const token = localStorage.getItem('tsb_token');
    await fetch(`/api/admin/gangsheets/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    setSheets(prev => prev.filter(s => s.id !== id));
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>;

  if (sheets.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
        <Layers className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">No gang sheets yet</p>
        <p className="text-sm text-gray-400 mt-1">Create your first gang sheet to start laying out DTF transfers</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sheets.map(s => (
        <div key={s.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 hover:border-orange-300 transition">
          <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Layers className="w-5 h-5 text-orange-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 truncate">{s.name}</p>
            <p className="text-xs text-gray-500">{s.design_count || 0} designs · {s.sheet_length_ft || 1}ft · {s.pricing_tier || 'standard'}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="font-bold text-green-700">${(s.total_cost || 0).toFixed(2)}</p>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.status === 'exported' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
              {s.status || 'draft'}
            </span>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <Link to={`/admin/gangsheet/${s.id}`} className="p-2 text-gray-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg">
              <Edit3 className="w-4 h-4" />
            </Link>
            <button onClick={() => handleDelete(s.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<Section>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [quoteFilter, setQuoteFilter] = useState<QuoteFilter>('all');
  const [quoteSearch, setQuoteSearch] = useState('');
  const [quoteSort, setQuoteSort] = useState<'newest' | 'date_needed'>('newest');
  const [orderSearch, setOrderSearch] = useState('');
  const [orderSort, setOrderSort] = useState<'newest' | 'date_needed'>('newest');
  const [productSearch, setProductSearch] = useState('');
  const [productPage, setProductPage] = useState(1);
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);

  // Pricing Assistant state
  const [pricingForm, setPricingForm] = useState({
    brand: 'gildan',
    product_type: 't-shirt',
    quantity: 24,
    print_method: 'screen-print',
    print_areas: 1,
    colors_in_design: 1,
    design_size: 'standard',
    is_rush: false,
    deadline_days: 14,
  });
  const [pricingResult, setPricingResult] = useState<{
    suggested_price?: number;
    garment_cost?: number;
    print_cost?: number;
    gang_sheet_details?: { design_width_inches?: number; design_height_inches?: number; designs_per_foot?: number; sheet_length_feet?: number; sheet_cost?: number; cost_per_unit?: number };
    bulk_tier_prices?: Record<string, number>;
    profit_margin_percentage?: number;
    confidence_level?: number;
    reasoning?: string;
  } | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);

  // New section state
  const [designSearch, setDesignSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [orderFilter, setOrderFilter] = useState<OrderFilter>('all');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [customerForm, setCustomerForm] = useState({ name: '', email: '', phone: '', address_street: '', address_city: '', address_state: '', address_zip: '' });
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'business' | 'notifications' | 'payment'>('business');
  const [settingsForm, setSettingsForm] = useState<Record<string, string>>({});
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Invoice state
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilter>('all');
  const [invoiceView, setInvoiceView] = useState<InvoiceView>('list');
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [invoiceForm, setInvoiceForm] = useState<{
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    customer_address: string;
    items: InvoiceItem[];
    tax: string;
    shipping: string;
    discount: string;
    notes: string;
    due_date: string;
  }>({
    customer_name: '', customer_email: '', customer_phone: '', customer_address: '',
    items: [{ description: '', quantity: 1, unit_price: 0 }],
    tax: '0', shipping: '0', discount: '0', notes: '', due_date: '',
  });
  const [previewInvoice, setPreviewInvoice] = useState<CreateInvoiceData | null>(null);
  const [invoiceProductSearch, setInvoiceProductSearch] = useState('');
  const [invoiceShipTo, setInvoiceShipTo] = useState({ name: '', street: '', city: '', state: '', zip: '' });
  const [shippingRates, setShippingRates] = useState<{ id: string; carrier: string; service: string; rate: string; deliveryDays: number | null }[]>([]);
  const [loadingRates, setLoadingRates] = useState(false);
  const [ratesError, setRatesError] = useState('');
  const [recordPaymentInvoice, setRecordPaymentInvoice] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('card');

  // Quote/Order detail drawer state
  const [detailQuote, setDetailQuote] = useState<Quote | Order | null>(null);
  const [adminNotesDraft, setAdminNotesDraft] = useState('');
  const [adminNotesSaving, setAdminNotesSaving] = useState(false);

  // AI helpers (DeepSeek)
  const [aiTriage, setAiTriage] = useState<QuoteTriage | null>(null);
  const [aiTriageLoading, setAiTriageLoading] = useState(false);
  const [aiDraft, setAiDraft] = useState<DraftReply | null>(null);
  const [aiDraftLoading, setAiDraftLoading] = useState(false);
  const [aiDraftQuestion, setAiDraftQuestion] = useState('');
  const [aiPriceResult, setAiPriceResult] = useState<PriceSuggestion | null>(null);
  const [aiPriceLoading, setAiPriceLoading] = useState(false);

  // Reset AI state when drawer opens a different quote
  useEffect(() => {
    setAiTriage(null);
    setAiDraft(null);
    setAiDraftQuestion('');
    setAiPriceResult(null);
  }, [detailQuote?.id]);

  // Reset admin notes draft when a new quote is opened
  useEffect(() => {
    if (detailQuote) {
      const notes = (detailQuote as { admin_notes?: string | null }).admin_notes || '';
      setAdminNotesDraft(notes);
    }
  }, [detailQuote]);

  // Send Price modal state
  const [priceModalQuote, setPriceModalQuote] = useState<Quote | null>(null);
  const [, setPriceBase] = useState('');
  const [, setPricePrinting] = useState('');
  const [priceDesignFee, setPriceDesignFee] = useState('0');
  const [priceRushFee, setPriceRushFee] = useState('0');
  const [priceShipping, setPriceShipping] = useState('0');
  const [priceMessage, setPriceMessage] = useState('');
  const [sizeMarkups, setSizeMarkups] = useState<Record<string, string>>({});

  // Blog state
  const [blogView, setBlogView] = useState<'list' | 'editor' | 'ai'>('list');
  const [aiBlogForm, setAiBlogForm] = useState({ topic: '', keywords: '', tone: 'educational', length: 'medium' });
  const [aiBlogLoading, setAiBlogLoading] = useState(false);
  const [igPost, setIgPost] = useState<{ caption?: string; hashtags?: string; full_post?: string; image_url?: string } | null>(null);
  const [igLoading, setIgLoading] = useState(false);
  const [aiBlogResult, setAiBlogResult] = useState<{ title?: string; meta_description?: string; slug_suggestion?: string; outline?: string[]; full_html_content?: string; saved?: { id: number; slug: string; title: string } } | null>(null);
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [blogForm, setBlogForm] = useState({
    title: '',
    slug: '',
    excerpt: '',
    cover_image: '',
    tags: '',
    content: '',
    meta_title: '',
    meta_description: '',
  });

  // Category form state
  const [catName, setCatName] = useState('');
  const [catParent, setCatParent] = useState('');
  const [catDesc, setCatDesc] = useState('');

  // Auth check — verify token is valid, redirect if expired
  useEffect(() => {
    const token = localStorage.getItem('tsb_token');
    if (!token) {
      navigate('/auth');
      return;
    }
    // Verify token is still valid with a lightweight API call
    fetch('/api/quotes', { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        if (res.status === 401) {
          localStorage.removeItem('tsb_token');
          navigate('/auth');
        }
      })
      .catch(() => {});
  }, [navigate]);

  function handleSignOut() {
    localStorage.removeItem('tsb_token');
    navigate('/auth');
  }

  // Queries
  const statsQuery = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: fetchDashboardStats,
  });

  const countsQuery = useQuery({
    queryKey: ['admin', 'counts'],
    queryFn: fetchAdminCounts,
    refetchInterval: 30000, // refresh every 30s
  });

  const quotesQuery = useQuery({
    queryKey: ['admin', 'quotes', quoteFilter, quoteSearch, quoteSort],
    queryFn: () => fetchQuotes(quoteFilter, quoteSearch, quoteSort),
    enabled: activeSection === 'dashboard' || activeSection === 'quotes',
    staleTime: 10000, // 10 seconds for admin
    refetchOnWindowFocus: true,
  });

  const productsQuery = useQuery({
    queryKey: ['admin', 'products', productSearch, productPage],
    queryFn: () => fetchAdminProducts(productSearch, productPage),
    enabled: activeSection === 'products',
  });

  const categoriesQuery = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: fetchCategories,
    enabled: activeSection === 'categories' || activeSection === 'dashboard',
  });

  const designsQuery = useQuery({
    queryKey: ['admin', 'customer-designs', designSearch],
    queryFn: () => fetchCustomerDesigns(designSearch),
    enabled: activeSection === 'designs',
  });

  const customersQuery = useQuery({
    queryKey: ['admin', 'customers', customerSearch],
    queryFn: () => fetchCustomers(customerSearch),
    enabled: activeSection === 'customers' || activeSection === 'invoices',
  });

  const customerDetailQuery = useQuery({
    queryKey: ['admin', 'customer', selectedCustomerId],
    queryFn: () => fetchCustomer(selectedCustomerId!),
    enabled: !!selectedCustomerId,
  });

  const ordersQuery = useQuery({
    queryKey: ['admin', 'orders', orderFilter, orderSearch, orderSort],
    queryFn: () => fetchOrders(orderFilter, orderSearch, orderSort),
    enabled: activeSection === 'orders',
  });

  const invoicesQuery = useQuery({
    queryKey: ['admin', 'invoices', invoiceFilter],
    queryFn: () => fetchInvoices(invoiceFilter),
    enabled: activeSection === 'invoices',
  });

  const invoiceProductsQuery = useQuery({
    queryKey: ['admin', 'invoice-products', invoiceProductSearch],
    queryFn: () => fetchAdminProducts(invoiceProductSearch),
    enabled: activeSection === 'invoices' && invoiceView === 'create' && invoiceProductSearch.length >= 2,
  });

  const customProductsQuery = useQuery({
    queryKey: ['admin', 'custom-products'],
    queryFn: fetchCustomProducts,
    enabled: activeSection === 'invoices' || activeSection === 'products',
  });

  const blogPostsQuery = useQuery({
    queryKey: ['admin', 'blog-posts'],
    queryFn: fetchAdminBlogPosts,
    enabled: activeSection === 'blog',
  });

  const { data: settingsData } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: fetchSettings,
    enabled: activeSection === 'settings',
  });

  // Load settings into form when fetched
  useEffect(() => {
    if (settingsData && Object.keys(settingsForm).length === 0) {
      setSettingsForm(settingsData);
    }
  }, [settingsData, settingsForm]);

  const handleSettingsChange = (key: string, value: string) => {
    setSettingsForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    try {
      await updateSettings(settingsForm);
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      alert('Settings saved!');
    } catch {
      alert('Failed to save settings');
    } finally {
      setSettingsSaving(false);
    }
  };

  // Blog helpers
  function resetBlogForm() {
    setBlogForm({ title: '', slug: '', excerpt: '', cover_image: '', tags: '', content: '', meta_title: '', meta_description: '' });
    setEditingPost(null);
  }

  function blogSlugify(text: string) {
    return text.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-');
  }

  function handleBlogTitleChange(title: string) {
    setBlogForm(prev => ({
      ...prev,
      title,
      slug: editingPost ? prev.slug : blogSlugify(title),
    }));
  }

  function handleEditPost(post: BlogPost) {
    setEditingPost(post);
    setBlogForm({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt || '',
      cover_image: post.cover_image || '',
      tags: post.tags?.join(', ') || '',
      content: post.content || '',
      meta_title: post.meta_title || '',
      meta_description: post.meta_description || '',
    });
    setBlogView('editor');
  }

  function handleSaveBlogPost(status: 'draft' | 'published') {
    const payload = {
      title: blogForm.title,
      slug: blogForm.slug,
      excerpt: blogForm.excerpt || undefined,
      cover_image: blogForm.cover_image || undefined,
      tags: typeof blogForm.tags === 'string' ? (blogForm.tags as string).split(',').map((t: string) => t.trim()).filter(Boolean) : blogForm.tags,
      content: blogForm.content,
      meta_title: blogForm.meta_title || undefined,
      meta_description: blogForm.meta_description || undefined,
      status,
    };
    if (editingPost) {
      updateBlogMutation.mutate({ id: editingPost.id, data: payload });
    } else {
      createBlogMutation.mutate(payload);
    }
  }

  // Mutations
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateQuoteStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'quotes'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      setOpenActionMenu(null);
    },
  });

  const syncMutation = useMutation({
    mutationFn: syncProducts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });

  const createCatMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      setCatName('');
      setCatParent('');
      setCatDesc('');
    },
  });

  const deleteCatMutation = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
    },
  });

  const deleteQuoteMutation = useMutation({
    mutationFn: deleteQuote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'quotes'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      setOpenActionMenu(null);
    },
    onError: (err: Error) => {
      alert('Failed to delete quote: ' + err.message);
    },
  });

  const deleteDesignMutation = useMutation({
    mutationFn: deleteDesign,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'customer-designs'] });
    },
  });

  const createBlogMutation = useMutation({
    mutationFn: (data: Partial<BlogPost>) => createBlogPost(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'blog-posts'] });
      setBlogView('list');
      resetBlogForm();
    },
  });

  const updateBlogMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<BlogPost> }) => updateBlogPost(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'blog-posts'] });
      setBlogView('list');
      resetBlogForm();
    },
  });

  const deleteBlogMutation = useMutation({
    mutationFn: deleteBlogPost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'blog-posts'] });
    },
  });

  const publishBlogMutation = useMutation({
    mutationFn: publishBlogPost,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'blog-posts'] });
    },
  });

  const createInvoiceMutation = useMutation({
    mutationFn: (data: CreateInvoiceData) => createInvoice(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'invoices'] });
      setInvoiceView('list');
      resetInvoiceForm();
    },
    onError: (err) => alert(`Failed to create invoice: ${err instanceof Error ? err.message : 'Unknown error'}`),
  });

  const updateInvoiceMutation = useMutation({
    mutationFn: (data: CreateInvoiceData & { id: string }) => {
      const { id, ...rest } = data;
      return updateInvoice(id, rest);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'invoices'] });
      setInvoiceView('list');
      resetInvoiceForm();
      setEditingInvoiceId(null);
      alert('Invoice updated!');
    },
    onError: (err) => alert(`Failed to update: ${err instanceof Error ? err.message : 'Unknown error'}`),
  });

  const sendInvoiceMutation = useMutation({
    mutationFn: (id: string) => sendInvoice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'invoices'] });
      alert('Invoice sent!');
    },
    onError: (err) => alert(`Failed to send: ${err instanceof Error ? err.message : 'Unknown error'}`),
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: deleteInvoice,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'invoices'] }),
  });

  const recordPaymentMutation = useMutation({
    mutationFn: ({ id, amount, method }: { id: string; amount: number; method: string }) => recordPayment(id, { amount, method }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'invoices'] });
      setRecordPaymentInvoice(null);
      setPaymentAmount('');
      setPaymentMethod('card');
    },
    onError: (err) => alert(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`),
  });

  const sendPriceMutation = useMutation({
    mutationFn: (data: SendQuotePricePayload) => sendQuotePrice(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'quotes'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      setPriceModalQuote(null);
      setPriceBase('');
      setPricePrinting('');
      setPriceDesignFee('0');
      setPriceRushFee('0');
      setPriceMessage('');
      alert('Quote sent to customer!');
    },
    onError: (err) => {
      alert(`Failed to send quote: ${err instanceof Error ? err.message : 'Unknown error'}`);
    },
  });

  function resetInvoiceForm() {
    setInvoiceForm({
      customer_name: '', customer_email: '', customer_phone: '', customer_address: '',
      items: [{ description: '', quantity: 1, unit_price: 0, weight_oz: 0, shipping_cost: 0 }],
      tax: '0', shipping: '0', discount: '0', notes: '', due_date: '',
    });
    setPreviewInvoice(null);
    setInvoiceProductSearch('');
    setEditingInvoiceId(null);
  }

  function calcInvoiceSubtotal() {
    return invoiceForm.items.reduce((sum, it) => sum + (it.quantity * it.unit_price) + ((it.shipping_cost || 0) * it.quantity), 0);
  }

  const totalWeight = invoiceForm.items.reduce((sum, it) => sum + ((it.weight_oz || 0) * it.quantity), 0);

  function calcInvoiceTotal() {
    const sub = calcInvoiceSubtotal();
    return sub + (parseFloat(invoiceForm.tax) || 0) + (parseFloat(invoiceForm.shipping) || 0) - (parseFloat(invoiceForm.discount) || 0);
  }

  function handleInvoiceItemChange(idx: number, field: keyof InvoiceItem, value: string | number) {
    setInvoiceForm(prev => {
      const items = [...prev.items];
      const existing = items[idx] ?? { description: '', quantity: 1, unit_price: 0 };
      items[idx] = { ...existing, [field]: field === 'description' ? String(value) : Number(value) };
      return { ...prev, items };
    });
  }

  function addInvoiceItem(desc = '', qty = 1, price = 0, weightOz = 0, shipCost = 0) {
    setInvoiceForm(prev => ({
      ...prev,
      items: [...prev.items, { description: desc, quantity: qty, unit_price: price, weight_oz: weightOz, shipping_cost: shipCost }],
    }));
  }

  function removeInvoiceItem(idx: number) {
    setInvoiceForm(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx),
    }));
  }

  function handleSaveInvoiceDraft() {
    const subtotal = calcInvoiceSubtotal();
    const total = calcInvoiceTotal();
    const data: CreateInvoiceData = {
      customer_name: invoiceForm.customer_name,
      customer_email: invoiceForm.customer_email,
      customer_phone: invoiceForm.customer_phone || undefined,
      customer_address: invoiceForm.customer_address || undefined,
      items: invoiceForm.items,
      subtotal,
      tax: parseFloat(invoiceForm.tax) || 0,
      shipping: parseFloat(invoiceForm.shipping) || 0,
      discount: parseFloat(invoiceForm.discount) || 0,
      total,
      notes: invoiceForm.notes || undefined,
      due_date: invoiceForm.due_date || undefined,
    };
    if (editingInvoiceId) {
      updateInvoiceMutation.mutate({ id: editingInvoiceId, ...data });
    } else {
      createInvoiceMutation.mutate(data);
    }
  }

  function handlePreviewInvoice() {
    const subtotal = calcInvoiceSubtotal();
    const total = calcInvoiceTotal();
    const data: CreateInvoiceData = {
      customer_name: invoiceForm.customer_name,
      customer_email: invoiceForm.customer_email,
      customer_phone: invoiceForm.customer_phone || undefined,
      customer_address: invoiceForm.customer_address || undefined,
      items: invoiceForm.items,
      subtotal,
      tax: parseFloat(invoiceForm.tax) || 0,
      shipping: parseFloat(invoiceForm.shipping) || 0,
      discount: parseFloat(invoiceForm.discount) || 0,
      total,
      notes: invoiceForm.notes || undefined,
      due_date: invoiceForm.due_date || undefined,
    };
    setPreviewInvoice(data);
    setInvoiceView('preview');
  }

  async function handleSendPreviewedInvoice() {
    if (!previewInvoice) return;
    try {
      const created = await createInvoiceMutation.mutateAsync(previewInvoice);
      if (created?.id) {
        await sendInvoiceMutation.mutateAsync(String(created.id));
      }
      setPreviewInvoice(null);
    } catch (err) {
      // errors are handled by the mutation's onError
    }
  }

  function handleSendPrice(e: FormEvent) {
    e.preventDefault();
    if (!priceModalQuote) return;
    // Calculate garment total from per-size prices × quantities
    const sizes = typeof priceModalQuote.sizes === 'string' ? JSON.parse(priceModalQuote.sizes as string) : priceModalQuote.sizes;
    let garmentTotal = 0;
    if (sizes && typeof sizes === 'object' && !Array.isArray(sizes)) {
      Object.entries(sizes).forEach(([size, qty]) => {
        const pricePerItem = parseFloat(sizeMarkups[size] || '0');
        garmentTotal += pricePerItem * Number(qty);
      });
    }
    const designFee = parseFloat(priceDesignFee) || 0;
    const rushFee = parseFloat(priceRushFee) || 0;
    const shipping = parseFloat(priceShipping) || 0;
    const total = garmentTotal + designFee + rushFee + shipping;
    const payload = {
      quoteId: String(priceModalQuote.id),
      priceBreakdown: { basePrice: garmentTotal, printingCost: 0, designFee, rushFee, total, shipping, sizeMarkups },
      message: priceMessage || undefined,
    };
    console.log('Sending price payload:', JSON.stringify(payload));
    sendPriceMutation.mutate(payload);
  }

  function openPriceModal(quote: Quote) {
    setPriceModalQuote(quote);
    setPriceBase('');
    setPricePrinting('');
    setPriceDesignFee('0');
    setPriceRushFee('0');
    setPriceShipping('0');
    setPriceMessage('');
    // Initialize per-size markups from quote sizes
    const sizes = typeof quote.sizes === 'string' ? JSON.parse(quote.sizes) : quote.sizes;
    const markups: Record<string, string> = {};
    if (sizes && typeof sizes === 'object' && !Array.isArray(sizes)) {
      Object.entries(sizes).forEach(([size, qty]) => {
        if (Number(qty) > 0) markups[size] = '';
      });
    }
    setSizeMarkups(markups);
    setOpenActionMenu(null);
  }

  function handleAddCategory(e: FormEvent) {
    e.preventDefault();
    createCatMutation.mutate({
      name: catName,
      parentId: catParent || undefined,
      description: catDesc,
    });
  }

  const stats = statsQuery.data;
  const quotes = quotesQuery.data ?? [];
  const products = productsQuery.data?.products ?? [];
  const productTotal = productsQuery.data?.total ?? 0;
  const productTotalPages = productsQuery.data?.totalPages ?? 1;
  const categories = categoriesQuery.data ?? [];
  const designs = designsQuery.data ?? [];
  const customers = customersQuery.data ?? [];
  const orders = ordersQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];
  const invoiceSearchProducts = invoiceProductsQuery.data?.products ?? [];
  const customProducts = customProductsQuery.data ?? [];
  const matchingCustomProducts = invoiceProductSearch.length >= 2
    ? customProducts.filter((cp: CustomProduct) => cp.name.toLowerCase().includes(invoiceProductSearch.toLowerCase()))
    : [];
  const customerDetail = customerDetailQuery.data ?? null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 bottom-0 w-64 bg-gray-900 text-white flex flex-col z-30 transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="p-6 border-b border-gray-800 flex items-center gap-3">
          <img src="https://tshirtbrothers.atl1.digitaloceanspaces.com/tsb-logo.png" alt="TSB" className="h-8 w-8 object-contain" />
          <h1 className="font-display text-xl font-bold tracking-tight">Admin</h1>
          <Link
            to="/"
            className="ml-auto flex items-center gap-1 text-xs text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded"
            title="Back to site"
          >
            <ArrowLeft className="w-3 h-3" />
            Site
          </Link>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((entry) => {
            if (isGroup(entry)) {
              const Icon = entry.icon;
              const containsActive = entry.children.some((c) => c.key === activeSection);
              const expanded = expandedGroups.has(entry.key) || containsActive;
              return (
                <div key={entry.key}>
                  <button
                    onClick={() => {
                      setExpandedGroups((prev) => {
                        const next = new Set(prev);
                        if (next.has(entry.key)) next.delete(entry.key);
                        else next.add(entry.key);
                        return next;
                      });
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      containsActive
                        ? 'text-white bg-gray-800'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="flex-1 text-left">{entry.label}</span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? '' : '-rotate-90'}`} />
                  </button>
                  {expanded && (
                    <div className="mt-1 ml-3 pl-3 border-l border-gray-800 space-y-1">
                      {entry.children.map(({ key, label, icon: ChildIcon }) => (
                        <button
                          key={key}
                          onClick={() => { setActiveSection(key); setSidebarOpen(false); }}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            activeSection === key
                              ? 'bg-red-600 text-white'
                              : 'text-gray-400 hover:text-white hover:bg-gray-800'
                          }`}
                        >
                          <ChildIcon className="w-4 h-4" />
                          <span className="flex-1 text-left">{label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            const { key, label, icon: Icon } = entry;
            const pendingCount = key === 'quotes' ? Number(countsQuery.data?.pending_quotes || 0) : 0;
            const activeOrdersCount = key === 'orders' ? Number(countsQuery.data?.active_orders || 0) : 0;
            const badgeCount = pendingCount || activeOrdersCount;
            return (
              <button
                key={key}
                onClick={() => { setActiveSection(key); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeSection === key
                    ? 'bg-red-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="flex-1 text-left">{label}</span>
                {badgeCount > 0 && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    activeSection === key
                      ? 'bg-white text-red-600'
                      : key === 'quotes' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'
                  }`}>
                    {badgeCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-800 space-y-2">
          <Link
            to="/"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Site
          </Link>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:ml-64 p-4 pt-16 lg:pt-8 lg:p-8">
        {/* Mobile header */}
        <div className="fixed top-0 left-0 right-0 z-20 flex items-center gap-3 bg-white border-b border-gray-200 px-4 py-3 lg:hidden">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <span className="font-display font-bold text-gray-900">Admin</span>
          <Link
            to="/"
            className="ml-auto flex items-center gap-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            View Site
          </Link>
        </div>
        {/* Dashboard */}
        {activeSection === 'dashboard' && (
          <div>
            <h2 className="text-xl sm:text-2xl font-display font-bold text-gray-900 mb-4 sm:mb-6">Dashboard</h2>

            {/* Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-6">
              <StatCard
                icon={ClipboardList}
                value={stats?.totalQuotes ?? 0}
                label="Total Quotes"
                loading={statsQuery.isLoading}
              />
              <StatCard
                icon={Clock}
                value={stats?.pendingQuotes ?? 0}
                label="Pending Quotes"
                loading={statsQuery.isLoading}
              />
              <StatCard
                icon={Layers}
                value={stats?.totalProducts ?? 0}
                label="Products in Catalog"
                loading={statsQuery.isLoading}
              />
              <StatCard
                icon={Tags}
                value={stats?.totalCategories ?? 0}
                label="Categories"
                loading={statsQuery.isLoading}
              />
            </div>

            {/* Recent Quotes */}
            <div>
              <h3 className="font-display font-semibold text-gray-900 mb-3">Recent Quotes</h3>
              <div className="space-y-2">
                {quotes.slice(0, 10).map((q: Quote) => (
                  <div key={q.id} onClick={() => setDetailQuote(q)}
                    className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-3 cursor-pointer active:bg-gray-50">
                    {q.design_url && (
                      <div className="w-12 h-12 flex-shrink-0 rounded-lg bg-gray-50 border border-gray-200 overflow-hidden">
                        <img src={q.design_url} alt="" className="w-full h-full object-contain" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 truncate">{q.customer_name || q.customerName}</p>
                      <p className="text-xs text-gray-500 truncate">{q.product_name || q.productName} · {q.quantity} pcs</p>
                      <p className="text-[10px] text-gray-400">{new Date(q.created_at || q.createdAt).toLocaleDateString()}</p>
                    </div>
                    <StatusBadge status={q.status} />
                  </div>
                ))}
                {quotes.length === 0 && !quotesQuery.isLoading && (
                  <div className="text-center py-8 bg-white rounded-xl border border-gray-200 text-gray-400 text-sm">
                    No quotes yet
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Quotes Section */}
        {activeSection === 'quotes' && (
          <div>
            <h2 className="text-xl md:text-2xl font-display font-bold text-gray-900 mb-4 md:mb-6">Quotes</h2>

            {/* Search + Sort */}
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="search"
                  placeholder="Search customer, email, product..."
                  value={quoteSearch}
                  onChange={(e) => setQuoteSearch(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  style={{ fontSize: '16px' }}
                />
              </div>
              <select
                value={quoteSort}
                onChange={(e) => setQuoteSort(e.target.value as 'newest' | 'date_needed')}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                style={{ fontSize: '16px' }}
              >
                <option value="newest">Newest first</option>
                <option value="date_needed">Date needed (urgent first)</option>
              </select>
            </div>

            {/* Filter Tabs - scrollable on mobile */}
            <div className="flex gap-1 mb-4 md:mb-6 bg-gray-100 rounded-lg p-1 w-full md:w-fit overflow-x-auto">
              {(['all', 'pending', 'quoted', 'accepted', 'completed'] as QuoteFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setQuoteFilter(f)}
                  className={`px-3 md:px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors whitespace-nowrap flex-shrink-0 ${
                    quoteFilter === f
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Mobile card view */}
            <div className="lg:hidden space-y-3">
              {quotesQuery.isLoading ? (
                <div className="text-center py-12 text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
              ) : quotes.length === 0 ? (
                <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-200">No quotes found</div>
              ) : quotes.map((q: Quote) => {
                const needed = q.date_needed ? new Date(q.date_needed) : null;
                const daysUntil = needed ? Math.ceil((needed.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
                const isRush = daysUntil !== null && daysUntil <= 7;
                return (
                <div
                  key={q.id}
                  onClick={() => setDetailQuote(q)}
                  className={`bg-white rounded-xl border p-4 space-y-3 cursor-pointer active:bg-gray-50 ${isRush ? 'border-orange-300 ring-1 ring-orange-200' : 'border-gray-200'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900 truncate">{q.customer_name || q.customerName}</p>
                      <a href={`mailto:${q.customer_email || q.customerEmail}`} className="text-xs text-blue-600 truncate block">{q.customer_email || q.customerEmail}</a>
                      {(q.customer_phone || q.customerPhone) && (
                        <a href={`tel:${q.customer_phone || q.customerPhone}`} className="text-xs text-blue-600 block">{q.customer_phone || q.customerPhone}</a>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <StatusBadge status={q.status} />
                      {isRush && (
                        <span className="text-[10px] font-bold text-white bg-orange-500 px-2 py-0.5 rounded-full">
                          {daysUntil !== null && daysUntil < 0 ? 'OVERDUE' : daysUntil === 0 ? 'TODAY' : `${daysUntil}d`}
                        </span>
                      )}
                      {(q as Quote & { triage?: { urgency?: string; complexity?: string; summary?: string } }).triage?.urgency && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          (q as Quote & { triage?: { urgency?: string } }).triage?.urgency === 'rush' ? 'bg-red-600 text-white' :
                          (q as Quote & { triage?: { urgency?: string } }).triage?.urgency === 'high' ? 'bg-red-100 text-red-700' :
                          (q as Quote & { triage?: { urgency?: string } }).triage?.urgency === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {(q as Quote & { triage?: { urgency?: string } }).triage?.urgency?.toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-gray-700">
                    <span className="font-medium">{q.quantity}×</span> {q.product_name || q.productName}
                  </div>
                  {q.design_url && (
                    <div className="mt-1">
                      <img src={q.design_url} alt="Customer design" className="w-full max-h-40 object-contain rounded-lg border border-gray-200 bg-gray-50" />
                    </div>
                  )}
                  {needed && (
                    <div className="text-xs text-gray-600">
                      <span className="font-medium">Needed:</span> {needed.toLocaleDateString()}
                    </div>
                  )}
                  {q.notes && (
                    <div className="text-xs text-gray-600 bg-yellow-50 border border-yellow-200 rounded px-2 py-1 line-clamp-2">
                      <span className="font-medium">Note:</span> {q.notes}
                    </div>
                  )}
                  {q.admin_notes && (
                    <div className="text-xs text-gray-700 bg-blue-50 border border-blue-200 rounded px-2 py-1 line-clamp-2">
                      <span className="font-medium">Internal:</span> {q.admin_notes}
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Created {new Date(q.created_at || q.createdAt).toLocaleDateString()}</span>
                    {q.estimated_price != null && (
                      <span className="font-semibold text-gray-900">${Number(q.estimated_price).toFixed(2)}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                    {(q.status === 'pending' || q.status === 'reviewed' || q.status === 'quoted') && (
                      <button
                        onClick={(e) => { e.stopPropagation(); openPriceModal(q); }}
                        className="text-xs font-medium text-purple-700 bg-purple-50 px-3 py-1.5 rounded-lg flex items-center gap-1"
                      >
                        <DollarSign className="w-3 h-3" />
                        {q.status === 'quoted' ? 'Re-Quote' : 'Send Price'}
                      </button>
                    )}
                    {q.status !== 'rejected' && q.status !== 'completed' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); statusMutation.mutate({ id: q.id, status: 'rejected' }); }}
                        className="text-xs font-medium text-gray-600 bg-gray-100 px-3 py-1.5 rounded-lg"
                      >
                        Reject
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const quoteId = String(q.id);
                        setTimeout(() => {
                          if (confirm('Delete this quote?')) {
                            deleteQuoteMutation.mutate(quoteId);
                          }
                        }, 50);
                      }}
                      className="text-xs font-medium text-red-600 bg-red-50 px-3 py-1.5 rounded-lg flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </button>
                  </div>
                </div>
                );
              })}
            </div>

            {/* Desktop table view */}
            <div className="hidden lg:block bg-white rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-500">
                      <th className="px-6 py-3 font-medium">Date</th>
                      <th className="px-6 py-3 font-medium">Customer</th>
                      <th className="px-6 py-3 font-medium">Email</th>
                      <th className="px-6 py-3 font-medium">Product</th>
                      <th className="px-6 py-3 font-medium">Qty</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                      <th className="px-6 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {quotes.map((q: Quote) => (
                      <tr key={q.id} onClick={() => setDetailQuote(q)} className="hover:bg-gray-50 cursor-pointer">
                        <td className="px-6 py-3 text-gray-600">
                          {new Date(q.created_at || q.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-3 text-gray-900">{q.customer_name || q.customerName}</td>
                        <td className="px-6 py-3 text-gray-600">{q.customer_email || q.customerEmail}</td>
                        <td className="px-6 py-3 text-gray-600">{q.product_name || q.productName}</td>
                        <td className="px-6 py-3 text-gray-600">{q.quantity}</td>
                        <td className="px-6 py-3">
                          <StatusBadge status={q.status} />
                        </td>
                        <td className="px-6 py-3 relative" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() =>
                              setOpenActionMenu(openActionMenu === q.id ? null : q.id)
                            }
                            className="flex items-center gap-1 text-gray-500 hover:text-gray-700 text-sm"
                          >
                            Actions <ChevronDown className="w-3 h-3" />
                          </button>
                          {openActionMenu === q.id && (
                            <div className="absolute right-6 top-10 z-20 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-44">
                              {(q.status === 'pending' || q.status === 'reviewed' || q.status === 'quoted') && (
                                <button
                                  onClick={() => openPriceModal(q)}
                                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 text-purple-700 font-medium"
                                >
                                  <DollarSign className="w-3.5 h-3.5" />
                                  {q.status === 'quoted' ? 'Re-Quote' : 'Send Price'}
                                </button>
                              )}
                              {['completed', 'rejected']
                                .filter((s) => s !== q.status)
                                .map((s) => (
                                  <button
                                    key={s}
                                    onClick={() =>
                                      statusMutation.mutate({ id: q.id, status: s })
                                    }
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 capitalize"
                                  >
                                    {s === 'completed' ? 'Complete' : 'Reject'}
                                  </button>
                                ))}
                              <div className="border-t border-gray-100 mt-1 pt-1">
                                <button
                                  onClick={() => {
                                    const quoteId = String(q.id);
                                    setOpenActionMenu(null);
                                    setTimeout(() => {
                                      if (confirm('Delete this quote? This cannot be undone.')) {
                                        deleteQuoteMutation.mutate(quoteId);
                                      }
                                    }, 50);
                                  }}
                                  className="w-full text-left px-4 py-2 text-sm hover:bg-red-50 flex items-center gap-2 text-red-600 font-medium"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Delete
                                </button>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {quotes.length === 0 && !quotesQuery.isLoading && (
                      <tr>
                        <td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                          No quotes found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
            </div>
          </div>
        )}

        {/* Products Section */}
        {activeSection === 'products' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-display font-bold text-gray-900">Products</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const name = prompt('Product name:');
                    if (!name) return;
                    const category = prompt('Category (e.g. Stickers, Transfers, Custom):') || 'Custom';
                    const price = prompt('Price per item:') || '0';
                    const description = prompt('Description (optional):') || '';
                    const imageUrl = prompt('Image URL (optional, or leave blank):') || '';
                    fetch('/api/admin/custom-products', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('tsb_token') || ''}` },
                      body: JSON.stringify({ name, category, price: parseFloat(price), description, image_url: imageUrl || null }),
                    }).then(r => {
                      if (r.ok) { alert('Custom product added!'); queryClient.invalidateQueries({ queryKey: ['admin', 'products'] }); }
                      else r.json().then(d => alert(d.error || 'Failed'));
                    });
                  }}
                  className="flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add Product
                </button>
              <button
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {syncMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Sync Products
              </button>
              </div>
            </div>

            {/* Search */}
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={productSearch}
                onChange={(e) => { setProductSearch(e.target.value); setProductPage(1); }}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/20 focus:outline-none transition"
              />
            </div>

            <div className="bg-white rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-500">
                      <th className="px-4 py-3 font-medium">Product</th>
                      <th className="px-4 py-3 font-medium">Brand</th>
                      <th className="px-4 py-3 font-medium">Category</th>
                      <th className="px-4 py-3 font-medium">Wholesale</th>
                      <th className="px-4 py-3 font-medium">Your Price</th>
                      <th className="px-4 py-3 font-medium w-28">Set Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {products.map((p: Product) => {
                      const wholesale = typeof p.base_price === 'number' ? p.base_price : parseFloat(String(p.base_price || '0'));
                      const customPrice = (p as unknown as Record<string, unknown>).custom_price;
                      const hasCustom = customPrice !== null && customPrice !== undefined;
                      return (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {p.image_url && <img src={String(p.image_url)} alt="" className="h-8 w-8 rounded bg-gray-100 object-contain" />}
                            <span className="text-gray-900 font-medium text-xs">{p.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{p.brand}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{p.category}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{wholesale > 0 ? `$${wholesale.toFixed(2)}` : '—'}</td>
                        <td className="px-4 py-3">
                          {hasCustom ? (
                            <span className="text-green-700 font-semibold text-xs">${Number(customPrice).toFixed(2)}</span>
                          ) : (
                            <span className="text-gray-400 text-xs">Not set</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="$0.00"
                            defaultValue={hasCustom ? Number(customPrice).toFixed(2) : ''}
                            onBlur={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val) && val > 0) {
                                fetch(`/api/admin/products/${p.id}/pricing`, {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('tsb_token') || ''}` },
                                  body: JSON.stringify({ custom_price: val }),
                                }).then(() => queryClient.invalidateQueries({ queryKey: ['admin', 'products'] }));
                              }
                            }}
                            className="w-24 pl-2 pr-1 py-1 rounded border border-gray-200 text-xs focus:border-red-500 focus:outline-none"
                          />
                        </td>
                      </tr>
                      );
                    })}
                    {products.length === 0 && !productsQuery.isLoading && (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                          No products found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-gray-500">
                Showing {products.length} of {productTotal} products (Page {productPage} of {productTotalPages})
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setProductPage(p => Math.max(1, p - 1))}
                  disabled={productPage <= 1}
                  className="px-3 py-1.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setProductPage(p => Math.min(productTotalPages, p + 1))}
                  disabled={productPage >= productTotalPages}
                  className="px-3 py-1.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Categories Section */}
        {activeSection === 'categories' && (
          <div>
            <h2 className="text-2xl font-display font-bold text-gray-900 mb-6">Categories</h2>

            {/* Add Category Form */}
            <form
              onSubmit={handleAddCategory}
              className="bg-white rounded-xl border border-gray-200 p-6 mb-6"
            >
              <h3 className="font-display font-semibold text-gray-900 mb-4">Add Category</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    required
                    value={catName}
                    onChange={(e) => setCatName(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/20 focus:outline-none transition"
                    placeholder="Category name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Parent</label>
                  <select
                    value={catParent}
                    onChange={(e) => setCatParent(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/20 focus:outline-none transition bg-white"
                  >
                    <option value="">None (top-level)</option>
                    {categories.map((c: Category) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={catDesc}
                    onChange={(e) => setCatDesc(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/20 focus:outline-none transition resize-none"
                    rows={1}
                    placeholder="Optional description"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={createCatMutation.isPending}
                className="mt-4 flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                {createCatMutation.isPending ? 'Adding...' : 'Add'}
              </button>
            </form>

            {/* Category List */}
            <div className="bg-white rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-500">
                      <th className="px-6 py-3 font-medium">Name</th>
                      <th className="px-6 py-3 font-medium">Parent</th>
                      <th className="px-6 py-3 font-medium">Description</th>
                      <th className="px-6 py-3 font-medium w-20">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {categories.map((c: Category) => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-gray-900 font-medium">{c.name}</td>
                        <td className="px-6 py-3 text-gray-600">{c.parentName ?? '--'}</td>
                        <td className="px-6 py-3 text-gray-600">{c.description || '--'}</td>
                        <td className="px-6 py-3">
                          <button
                            onClick={() => deleteCatMutation.mutate(c.id)}
                            disabled={deleteCatMutation.isPending}
                            className="text-red-600 hover:text-red-700 transition-colors"
                            title="Delete category"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {categories.length === 0 && !categoriesQuery.isLoading && (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
                          No categories yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
            </div>
          </div>
        )}

        {/* Customer Designs Section */}
        {activeSection === 'designs' && (
          <div>
            <h2 className="text-2xl font-display font-bold text-gray-900 mb-6">Customer Designs</h2>

            {/* Search */}
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by customer name or design name..."
                value={designSearch}
                onChange={(e) => setDesignSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/20 focus:outline-none transition"
              />
            </div>

            {designsQuery.isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : designs.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
                No designs found
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {designs.map((d: CustomerDesign) => (
                  <div key={d.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="aspect-square bg-gray-50 relative overflow-hidden">
                      {/* Use thumbnail (design snapshot) if available, otherwise product image */}
                      {(d.thumbnail || d.product_image || d.mockup_url) ? (
                        <img
                          src={d.thumbnail || d.product_image || d.mockup_url || ''}
                          alt={d.name}
                          className="w-full h-full object-contain p-2"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Palette className="w-10 h-10 text-gray-300" />
                        </div>
                      )}
                      {Array.isArray(d.elements) && d.elements.length > 0 && (
                        <div className="absolute top-1 right-1 bg-orange-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded">DESIGNED</div>
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold text-gray-900 mb-1">{d.name}</h3>
                      <p className="text-sm text-gray-600">{d.user_name}</p>
                      <p className="text-sm text-gray-400">{d.user_email}</p>
                      {d.product_name && (
                        <p className="text-sm text-gray-500 mt-1">Product: {d.product_name}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-2">
                        {new Date(d.created_at).toLocaleDateString()}
                      </p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {d.mockup_url && (
                          <a
                            href={d.mockup_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <ExternalLink className="w-3 h-3" />
                            View Mockup
                          </a>
                        )}
                        {d.print_url && (
                          <a
                            href={d.print_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <Download className="w-3 h-3" />
                            Download Print File
                          </a>
                        )}
                        <Link
                          to={`/design?product=${d.product_ss_id || ''}`}
                          state={{
                            loadDesign: true,
                            designName: d.name,
                            elements: d.elements || [],
                            productImage: d.product_image,
                            colorIndex: d.color_index || 0,
                          }}
                          className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <Eye className="w-3 h-3" />
                          Open in Studio
                        </Link>
                        {Array.isArray(d.elements) && d.elements.length > 0 && (
                          <button
                            onClick={async () => {
                              const els = d.elements as { id: string; type: string; x: number; y: number; width: number; content: string; fontSize?: number; color?: string; fontFamily?: string; rotation?: number; textAlign?: string }[];
                              const canvas = document.createElement('canvas');
                              canvas.width = 3000;
                              canvas.height = 3000;
                              const ctx = canvas.getContext('2d');
                              if (!ctx) return;
                              ctx.clearRect(0, 0, 3000, 3000);
                              for (const el of els) {
                                const x = (el.x / 100) * 3000;
                                const y = (el.y / 100) * 3000;
                                const w = (el.width / 100) * 3000;
                                if (el.type === 'image') {
                                  try {
                                    const img = document.createElement('img');
                                    img.crossOrigin = 'anonymous';
                                    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(); img.src = el.content; });
                                    const aspect = img.naturalHeight / img.naturalWidth;
                                    ctx.drawImage(img, x, y, w, w * aspect);
                                  } catch { /* skip */ }
                                } else {
                                  const fontSize = ((el.fontSize ?? 24) * 3000) / 800;
                                  ctx.save();
                                  if (el.rotation) { ctx.translate(x + w / 2, y + fontSize / 2); ctx.rotate((el.rotation * Math.PI) / 180); ctx.translate(-(x + w / 2), -(y + fontSize / 2)); }
                                  ctx.font = `bold ${fontSize}px ${el.fontFamily ?? 'Inter'}`;
                                  ctx.fillStyle = el.color ?? '#000000';
                                  ctx.textAlign = (el.textAlign as CanvasTextAlign) ?? 'center';
                                  ctx.fillText(el.content, el.textAlign === 'left' ? x : x + w / 2, y + fontSize);
                                  ctx.restore();
                                }
                              }
                              const link = document.createElement('a');
                              link.download = `${d.name || 'design'}-print-ready.png`;
                              link.href = canvas.toDataURL('image/png');
                              link.click();
                            }}
                            className="flex items-center gap-1.5 text-xs font-medium text-purple-600 hover:text-purple-700 bg-purple-50 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <Download className="w-3 h-3" />
                            Design Only
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (confirm('Delete this design? This cannot be undone.')) {
                              deleteDesignMutation.mutate(String(d.id));
                            }
                          }}
                          className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Customers Section */}
        {activeSection === 'customers' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-display font-bold text-gray-900">Customers</h2>
              <button
                onClick={() => { setCustomerForm({ name: '', email: '', phone: '', address_street: '', address_city: '', address_state: '', address_zip: '' }); setEditingCustomerId(null); setShowCustomerForm(true); }}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
              >
                <Plus className="w-4 h-4" /> Add Customer
              </button>
            </div>

            {/* Search */}
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/20 focus:outline-none transition"
              />
            </div>

            <div className="bg-white rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-500">
                      <th className="px-6 py-3 font-medium">Name</th>
                      <th className="px-6 py-3 font-medium">Email</th>
                      <th className="px-6 py-3 font-medium">Phone</th>
                      <th className="px-6 py-3 font-medium">Designs</th>
                      <th className="px-6 py-3 font-medium">Quotes</th>
                      <th className="px-6 py-3 font-medium">Joined</th>
                      <th className="px-6 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {customers.map((c: Customer) => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-gray-900 font-medium">{c.name}</td>
                        <td className="px-6 py-3 text-gray-600">{c.email}</td>
                        <td className="px-6 py-3 text-gray-600">{c.phone || '--'}</td>
                        <td className="px-6 py-3 text-gray-600">{c.design_count}</td>
                        <td className="px-6 py-3 text-gray-600">{c.quote_count}</td>
                        <td className="px-6 py-3 text-gray-600">
                          {new Date(c.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => setSelectedCustomerId(c.id)}
                              className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                            >
                              <Eye className="w-3 h-3" />
                              View
                            </button>
                            <button
                              onClick={() => {
                                setCustomerForm({
                                  name: c.name || '',
                                  email: c.email || '',
                                  phone: c.phone || '',
                                  address_street: c.address_street || '',
                                  address_city: c.address_city || '',
                                  address_state: c.address_state || '',
                                  address_zip: c.address_zip || '',
                                });
                                setEditingCustomerId(c.id);
                                setShowCustomerForm(true);
                              }}
                              className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg transition-colors"
                            >
                              Edit
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {customers.length === 0 && !customersQuery.isLoading && (
                      <tr>
                        <td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                          No customers found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
            </div>

            {/* Customer Detail Modal */}
            {selectedCustomerId && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto">
                  <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
                    <h3 className="font-display font-semibold text-gray-900">Customer Details</h3>
                    <button
                      onClick={() => setSelectedCustomerId(null)}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {customerDetailQuery.isLoading ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                    </div>
                  ) : customerDetail ? (
                    <div className="p-6 space-y-6">
                      {/* Customer Info */}
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="text-lg font-semibold text-gray-900">{customerDetail.name}</h4>
                          <p className="text-sm text-gray-500">{customerDetail.email}</p>
                          {customerDetail.phone && <p className="text-sm text-gray-500">{customerDetail.phone}</p>}
                          {(customerDetail.address_street || customerDetail.address_city) && (
                            <p className="text-sm text-gray-500 mt-1">
                              {[customerDetail.address_street, customerDetail.address_city, customerDetail.address_state, customerDetail.address_zip].filter(Boolean).join(', ')}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            Joined {new Date(customerDetail.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setCustomerForm({
                              name: customerDetail.name || '',
                              email: customerDetail.email || '',
                              phone: customerDetail.phone || '',
                              address_street: customerDetail.address_street || '',
                              address_city: customerDetail.address_city || '',
                              address_state: customerDetail.address_state || '',
                              address_zip: customerDetail.address_zip || '',
                            });
                            setEditingCustomerId(customerDetail.id);
                            setShowCustomerForm(true);
                          }}
                          className="flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          Edit
                        </button>
                      </div>

                      {/* Saved Designs */}
                      <div>
                        <h4 className="font-medium text-gray-900 mb-3">
                          Saved Designs ({customerDetail.designs.length})
                        </h4>
                        {customerDetail.designs.length === 0 ? (
                          <p className="text-sm text-gray-400">No designs yet</p>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {customerDetail.designs.map((d) => (
                              <div key={d.id} className="border border-gray-200 rounded-lg overflow-hidden">
                                <div className="aspect-video bg-gray-100">
                                  {d.mockup_url ? (
                                    <img
                                      src={d.mockup_url}
                                      alt={d.name}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                      }}
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <Palette className="w-6 h-6 text-gray-300" />
                                    </div>
                                  )}
                                </div>
                                <div className="p-2">
                                  <p className="text-xs font-medium text-gray-900 truncate">{d.name}</p>
                                  <p className="text-xs text-gray-400">
                                    {new Date(d.created_at).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Quote History */}
                      <div>
                        <h4 className="font-medium text-gray-900 mb-3">
                          Quote History ({customerDetail.quotes.length})
                        </h4>
                        {customerDetail.quotes.length === 0 ? (
                          <p className="text-sm text-gray-400">No quotes yet</p>
                        ) : (
                          <div className="border border-gray-200 rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-50 text-left text-gray-500">
                                  <th className="px-4 py-2 font-medium">Product</th>
                                  <th className="px-4 py-2 font-medium">Qty</th>
                                  <th className="px-4 py-2 font-medium">Price</th>
                                  <th className="px-4 py-2 font-medium">Status</th>
                                  <th className="px-4 py-2 font-medium">Date</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {customerDetail.quotes.map((q) => (
                                  <tr key={q.id}>
                                    <td className="px-4 py-2 text-gray-900">{q.product_name}</td>
                                    <td className="px-4 py-2 text-gray-600">{q.quantity}</td>
                                    <td className="px-4 py-2 text-gray-600">
                                      {q.estimated_price != null
                                        ? `$${Number(q.estimated_price).toFixed(2)}`
                                        : '--'}
                                    </td>
                                    <td className="px-4 py-2">
                                      <StatusBadge status={q.status} />
                                    </td>
                                    <td className="px-4 py-2 text-gray-400">
                                      {new Date(q.created_at).toLocaleDateString()}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-6 text-center text-gray-400">Customer not found</div>
                  )}
                </div>
              </div>
            )}

            {/* Add / Edit Customer Modal */}
            {showCustomerForm && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl max-w-md w-full">
                  <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                    <h3 className="font-display font-semibold text-gray-900">{editingCustomerId ? 'Edit Customer' : 'Add Customer'}</h3>
                    <button onClick={() => setShowCustomerForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                  </div>
                  <form
                    className="p-6 space-y-4"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!customerForm.name || !customerForm.email) return;
                      setSavingCustomer(true);
                      try {
                        const url = editingCustomerId ? `/api/admin/customers/${editingCustomerId}` : '/api/admin/customers';
                        const method = editingCustomerId ? 'PUT' : 'POST';
                        const r = await fetch(url, {
                          method,
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('tsb_token') || ''}` },
                          body: JSON.stringify(customerForm),
                        });
                        if (r.ok) {
                          queryClient.invalidateQueries({ queryKey: ['admin', 'customers'] });
                          setShowCustomerForm(false);
                        } else {
                          const d = await r.json();
                          alert(d.error || 'Failed');
                        }
                      } finally {
                        setSavingCustomer(false);
                      }
                    }}
                  >
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                      <input type="text" required value={customerForm.name} onChange={e => setCustomerForm(p => ({ ...p, name: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/20 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                      <input type="email" required value={customerForm.email} onChange={e => setCustomerForm(p => ({ ...p, email: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/20 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                      <input type="tel" value={customerForm.phone} onChange={e => setCustomerForm(p => ({ ...p, phone: e.target.value }))} placeholder="(470) 622-4845" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/20 focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
                      <input type="text" value={customerForm.address_street} onChange={e => setCustomerForm(p => ({ ...p, address_street: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/20 focus:outline-none" />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                        <input type="text" value={customerForm.address_city} onChange={e => setCustomerForm(p => ({ ...p, address_city: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/20 focus:outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                        <input type="text" value={customerForm.address_state} onChange={e => setCustomerForm(p => ({ ...p, address_state: e.target.value }))} placeholder="GA" maxLength={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/20 focus:outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">ZIP</label>
                        <input type="text" value={customerForm.address_zip} onChange={e => setCustomerForm(p => ({ ...p, address_zip: e.target.value }))} placeholder="30290" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/20 focus:outline-none" />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={savingCustomer || !customerForm.name || !customerForm.email}
                      className="w-full bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg text-sm font-semibold transition disabled:opacity-50"
                    >
                      {savingCustomer ? 'Saving...' : editingCustomerId ? 'Update Customer' : 'Add Customer'}
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Orders Section */}
        {activeSection === 'orders' && (
          <div>
            <h2 className="text-xl md:text-2xl font-display font-bold text-gray-900 mb-4 md:mb-6">Orders</h2>

            {/* Search + Sort */}
            <div className="flex flex-col sm:flex-row gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="search"
                  placeholder="Search customer, email, product..."
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  style={{ fontSize: '16px' }}
                />
              </div>
              <select
                value={orderSort}
                onChange={(e) => setOrderSort(e.target.value as 'newest' | 'date_needed')}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                style={{ fontSize: '16px' }}
              >
                <option value="newest">Newest first</option>
                <option value="date_needed">Date needed (urgent first)</option>
              </select>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-1 mb-4 md:mb-6 bg-gray-100 rounded-lg p-1 w-full md:w-fit overflow-x-auto">
              {(['all', 'accepted', 'completed'] as OrderFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setOrderFilter(f)}
                  className={`px-3 md:px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors whitespace-nowrap flex-shrink-0 ${
                    orderFilter === f
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Mobile card view */}
            <div className="lg:hidden space-y-3">
              {ordersQuery.isLoading ? (
                <div className="text-center py-12 text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
              ) : orders.length === 0 ? (
                <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-200">No orders found</div>
              ) : orders.map((o: Order) => {
                const total = o.estimated_price != null ? Number(o.estimated_price) : 0;
                const paid = o.deposit_amount != null ? Number(o.deposit_amount) : 0;
                const balance = total - paid;
                const needed = o.date_needed ? new Date(o.date_needed) : null;
                const daysUntil = needed ? Math.ceil((needed.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
                const isRush = daysUntil !== null && daysUntil <= 7;
                return (
                  <div
                    key={o.id}
                    onClick={() => setDetailQuote(o)}
                    className={`bg-white rounded-xl border p-4 space-y-3 cursor-pointer active:bg-gray-50 ${isRush ? 'border-orange-300 ring-1 ring-orange-200' : 'border-gray-200'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900">#{String(o.id)}</span>
                          <span className="text-xs text-gray-400">{new Date(o.created_at).toLocaleDateString()}</span>
                        </div>
                        <p className="font-semibold text-gray-900 truncate">{o.customer_name}</p>
                        <a href={`mailto:${o.customer_email}`} className="text-xs text-blue-600 truncate block">{o.customer_email}</a>
                        {o.customer_phone && (
                          <a href={`tel:${o.customer_phone}`} className="text-xs text-blue-600 block">{o.customer_phone}</a>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <StatusBadge status={o.status} />
                        {isRush && (
                          <span className="text-[10px] font-bold text-white bg-orange-500 px-2 py-0.5 rounded-full">
                            {daysUntil !== null && daysUntil < 0 ? 'OVERDUE' : daysUntil === 0 ? 'TODAY' : `${daysUntil}d`}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-gray-700">
                      <span className="font-medium">{o.quantity}×</span> {o.product_name}
                    </div>
                    {needed && (
                      <div className="text-xs text-gray-600">
                        <span className="font-medium">Needed:</span> {needed.toLocaleDateString()}
                      </div>
                    )}
                    {o.notes && (
                      <div className="text-xs text-gray-600 bg-yellow-50 border border-yellow-200 rounded px-2 py-1 line-clamp-2">
                        <span className="font-medium">Note:</span> {o.notes}
                      </div>
                    )}
                    {o.admin_notes && (
                      <div className="text-xs text-gray-700 bg-blue-50 border border-blue-200 rounded px-2 py-1 line-clamp-2">
                        <span className="font-medium">Internal:</span> {o.admin_notes}
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-gray-100">
                      <div>
                        <p className="text-gray-400">Total</p>
                        <p className="font-semibold text-gray-900">${total.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Paid</p>
                        <p className="font-semibold text-green-600">${paid.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Balance</p>
                        <p className={`font-semibold ${balance > 0 ? 'text-red-600' : 'text-gray-500'}`}>${balance.toFixed(2)}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                      {balance > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            sendBalanceRequest(String(o.id))
                              .then(() => alert('Balance request sent to ' + o.customer_email))
                              .catch((err: Error) => alert('Failed: ' + err.message));
                          }}
                          className="text-xs font-medium text-green-700 bg-green-50 px-3 py-1.5 rounded-lg"
                        >
                          Request Balance
                        </button>
                      )}
                      {o.status !== 'completed' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); statusMutation.mutate({ id: o.id, status: 'completed' }); }}
                          className="text-xs font-medium text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg"
                        >
                          Mark Complete
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const orderId = String(o.id);
                          setTimeout(() => {
                            if (confirm('Delete this order?')) {
                              deleteQuoteMutation.mutate(orderId);
                            }
                          }, 50);
                        }}
                        className="text-xs font-medium text-red-600 bg-red-50 px-3 py-1.5 rounded-lg flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table view */}
            <div className="hidden lg:block bg-white rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-500">
                      <th className="px-4 py-3 font-medium">Order #</th>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Customer</th>
                      <th className="px-4 py-3 font-medium">Product</th>
                      <th className="px-4 py-3 font-medium">Qty</th>
                      <th className="px-4 py-3 font-medium text-right">Total</th>
                      <th className="px-4 py-3 font-medium text-right">Deposit Paid</th>
                      <th className="px-4 py-3 font-medium text-right">Balance Due</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {orders.map((o: Order) => (
                      <tr key={o.id} onClick={() => setDetailQuote(o)} className="hover:bg-gray-50 cursor-pointer">
                        <td className="px-4 py-3 text-gray-900 font-medium">#{String(o.id)}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {new Date(o.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-gray-900">{o.customer_name}</div>
                          <div className="text-xs text-gray-400">{o.customer_email}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate" title={o.product_name}>{o.product_name}</td>
                        <td className="px-4 py-3 text-gray-600">{o.quantity}</td>
                        <td className="px-4 py-3 text-gray-600 text-right whitespace-nowrap">
                          {o.estimated_price != null
                            ? `$${Number(o.estimated_price).toFixed(2)}`
                            : '--'}
                        </td>
                        <td className="px-4 py-3 text-green-600 font-medium text-right whitespace-nowrap">
                          {o.deposit_amount != null && Number(o.deposit_amount) > 0
                            ? `$${Number(o.deposit_amount).toFixed(2)}`
                            : '--'}
                        </td>
                        <td className="px-4 py-3 text-red-600 font-medium text-right whitespace-nowrap">
                          {o.estimated_price != null && o.deposit_amount != null && Number(o.deposit_amount) > 0
                            ? `$${(Number(o.estimated_price) - Number(o.deposit_amount)).toFixed(2)}`
                            : o.estimated_price != null
                              ? `$${Number(o.estimated_price).toFixed(2)}`
                              : '--'}
                        </td>
                        <td className="px-6 py-3">
                          <StatusBadge status={o.status} />
                        </td>
                        <td className="px-6 py-3 relative" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() =>
                              setOpenActionMenu(openActionMenu === o.id ? null : o.id)
                            }
                            className="flex items-center gap-1 text-gray-500 hover:text-gray-700 text-sm"
                          >
                            Actions <ChevronDown className="w-3 h-3" />
                          </button>
                          {openActionMenu === o.id && (
                            <div className="absolute right-6 top-10 z-20 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-48">
                              {o.estimated_price != null && o.deposit_amount != null && Number(o.estimated_price) - Number(o.deposit_amount) > 0 && (
                                <button
                                  onClick={() => {
                                    const orderId = String(o.id);
                                    setOpenActionMenu(null);
                                    sendBalanceRequest(orderId)
                                      .then(() => alert('Balance payment request sent to ' + o.customer_email))
                                      .catch((err: Error) => alert('Failed: ' + err.message));
                                  }}
                                  className="w-full text-left px-4 py-2 text-sm hover:bg-green-50 text-green-700 font-medium"
                                >
                                  Request Balance Payment
                                </button>
                              )}
                              {['completed']
                                .filter((s) => s !== o.status)
                                .map((s) => (
                                  <button
                                    key={s}
                                    onClick={() =>
                                      statusMutation.mutate({ id: o.id, status: s })
                                    }
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 capitalize"
                                  >
                                    Mark Complete
                                  </button>
                                ))}
                              <div className="border-t border-gray-100 mt-1 pt-1">
                                <button
                                  onClick={() => {
                                    const orderId = String(o.id);
                                    setOpenActionMenu(null);
                                    setTimeout(() => {
                                      if (confirm('Delete this order? This cannot be undone.')) {
                                        deleteQuoteMutation.mutate(orderId);
                                      }
                                    }, 50);
                                  }}
                                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {orders.length === 0 && !ordersQuery.isLoading && (
                      <tr>
                        <td colSpan={10} className="px-6 py-8 text-center text-gray-400">
                          No orders found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
            </div>
          </div>
        )}

        {/* Invoices Section */}
        {activeSection === 'invoices' && (
          <div>
            {invoiceView === 'list' && (
              <>
                <div className="flex items-center justify-between mb-4 gap-3">
                  <h2 className="text-xl md:text-2xl font-display font-bold text-gray-900">Invoices</h2>
                  <button
                    onClick={() => { resetInvoiceForm(); setInvoiceView('create'); }}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    New Invoice
                  </button>
                </div>

                {/* Filter Tabs */}
                <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
                  {(['all', 'draft', 'sent', 'paid', 'overdue'] as InvoiceFilter[]).map(f => (
                    <button
                      key={f}
                      onClick={() => setInvoiceFilter(f)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                        invoiceFilter === f ? 'bg-red-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>

                {/* Invoice Table */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Mobile card view */}
                  <div className="divide-y divide-gray-100 lg:hidden">
                    {invoicesQuery.isLoading ? (
                      <div className="px-4 py-12 text-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
                    ) : invoices.length === 0 ? (
                      <div className="px-4 py-12 text-center text-gray-400">No invoices found</div>
                    ) : invoices.map((inv: Invoice) => (
                      <div key={inv.id} className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-900 text-sm">{inv.invoice_number}</span>
                          <StatusBadge status={inv.status} />
                        </div>
                        <div className="text-sm text-gray-700">{inv.customer_name}</div>
                        <div className="text-xs text-gray-500">{inv.customer_email}</div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-gray-500">{new Date(inv.created_at).toLocaleDateString()}</span>
                          <span className="font-semibold text-gray-900">Total: ${Number(inv.total).toFixed(2)}</span>
                          <span className="text-red-600 font-medium">Due: ${Number(inv.amount_due).toFixed(2)}</span>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <button onClick={() => { setEditingInvoiceId(inv.id); setInvoiceForm({ customer_name: inv.customer_name || '', customer_email: inv.customer_email || '', customer_phone: inv.customer_phone || '', customer_address: '', items: Array.isArray(inv.items) ? inv.items : [{ description: '', quantity: 1, unit_price: 0 }], tax: String(inv.tax || 0), shipping: String(inv.shipping || 0), discount: String(inv.discount || 0), notes: inv.notes || '', due_date: inv.due_date || '' }); setInvoiceView('create'); }} className="text-xs font-medium text-gray-600 bg-gray-100 px-3 py-1.5 rounded-lg">Edit</button>
                          {inv.status === 'draft' && <button onClick={() => sendInvoiceMutation.mutate(inv.id)} disabled={sendInvoiceMutation.isPending} className="text-xs font-medium text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg">Send</button>}
                          {inv.status === 'sent' && <button onClick={() => { setRecordPaymentInvoice(inv); setPaymentAmount(String(inv.amount_due)); }} className="text-xs font-medium text-green-600 bg-green-50 px-3 py-1.5 rounded-lg">Payment</button>}
                          <button onClick={() => { if (confirm('Delete?')) deleteInvoiceMutation.mutate(inv.id); }} className="text-xs font-medium text-red-600 bg-red-50 px-3 py-1.5 rounded-lg">Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Desktop table */}
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left text-gray-500">
                          <th className="px-6 py-3 font-medium">Invoice #</th>
                          <th className="px-6 py-3 font-medium">Date</th>
                          <th className="px-6 py-3 font-medium">Customer</th>
                          <th className="px-6 py-3 font-medium">Email</th>
                          <th className="px-6 py-3 font-medium text-right">Total</th>
                          <th className="px-6 py-3 font-medium text-right">Paid</th>
                          <th className="px-6 py-3 font-medium text-right">Due</th>
                          <th className="px-6 py-3 font-medium">Status</th>
                          <th className="px-6 py-3 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {invoicesQuery.isLoading ? (
                          <tr><td colSpan={9} className="px-6 py-12 text-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
                        ) : invoices.length === 0 ? (
                          <tr><td colSpan={9} className="px-6 py-12 text-center text-gray-400">No invoices found</td></tr>
                        ) : invoices.map((inv: Invoice) => (
                          <tr key={inv.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 font-medium text-gray-900">{inv.invoice_number}</td>
                            <td className="px-6 py-4 text-gray-500">{new Date(inv.created_at).toLocaleDateString()}</td>
                            <td className="px-6 py-4 text-gray-900">{inv.customer_name}</td>
                            <td className="px-6 py-4 text-gray-500">{inv.customer_email}</td>
                            <td className="px-6 py-4 text-right font-medium text-gray-900">${Number(inv.total).toFixed(2)}</td>
                            <td className="px-6 py-4 text-right text-green-600">${Number(inv.amount_paid).toFixed(2)}</td>
                            <td className="px-6 py-4 text-right font-medium text-red-600">${Number(inv.amount_due).toFixed(2)}</td>
                            <td className="px-6 py-4"><StatusBadge status={inv.status} /></td>
                            <td className="px-6 py-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  onClick={() => {
                                    setEditingInvoiceId(inv.id);
                                    setInvoiceForm({
                                      customer_name: inv.customer_name || '',
                                      customer_email: inv.customer_email || '',
                                      customer_phone: inv.customer_phone || '',
                                      customer_address: '',
                                      items: Array.isArray(inv.items) ? inv.items : [{ description: '', quantity: 1, unit_price: 0 }],
                                      tax: String(inv.tax || 0),
                                      shipping: String(inv.shipping || 0),
                                      discount: String(inv.discount || 0),
                                      notes: inv.notes || '',
                                      due_date: inv.due_date || '',
                                    });
                                    setInvoiceView('create');
                                  }}
                                  className="text-xs font-medium text-gray-600 hover:text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg transition-colors"
                                >
                                  <Eye className="w-3 h-3 inline mr-1" />Edit
                                </button>
                                {inv.status === 'draft' && (
                                  <button
                                    onClick={() => sendInvoiceMutation.mutate(inv.id)}
                                    disabled={sendInvoiceMutation.isPending}
                                    className="text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
                                  >
                                    <Send className="w-3 h-3 inline mr-1" />Send
                                  </button>
                                )}
                                {inv.status === 'sent' && (
                                  <button
                                    onClick={() => { setRecordPaymentInvoice(inv); setPaymentAmount(String(inv.amount_due)); }}
                                    className="text-xs font-medium text-green-600 hover:text-green-700 bg-green-50 px-3 py-1.5 rounded-lg transition-colors"
                                  >
                                    <DollarSign className="w-3 h-3 inline mr-1" />Payment
                                  </button>
                                )}
                                <button
                                    onClick={() => { if (confirm('Delete this invoice? This cannot be undone.')) deleteInvoiceMutation.mutate(inv.id); }}
                                    className="text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                                  >
                                    <Trash2 className="w-3 h-3 inline mr-1" />Delete
                                  </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                </div>
              </>
            )}

            {/* Create Invoice Form */}
            {invoiceView === 'create' && (
              <div>
                <div className="flex items-center gap-4 mb-6">
                  <button onClick={() => { setInvoiceView('list'); resetInvoiceForm(); }} className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-5 h-5" /></button>
                  <h2 className="text-2xl font-display font-bold text-gray-900">{editingInvoiceId ? 'Edit Invoice' : 'New Invoice'}</h2>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
                  {/* Customer Info with autocomplete */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Customer Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="relative">
                        <label className="block text-xs text-gray-500 mb-1">Name *</label>
                        <input
                          type="text"
                          value={invoiceForm.customer_name}
                          onChange={e => setInvoiceForm(p => ({ ...p, customer_name: e.target.value }))}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                          placeholder="Start typing to search customers..."
                        />
                        {/* Customer autocomplete dropdown */}
                        {invoiceForm.customer_name.length >= 2 && customers.filter((c: Customer) =>
                          c.name.toLowerCase().includes(invoiceForm.customer_name.toLowerCase()) ||
                          c.email.toLowerCase().includes(invoiceForm.customer_name.toLowerCase())
                        ).length > 0 && (
                          <div className="absolute z-30 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {customers.filter((c: Customer) =>
                              c.name.toLowerCase().includes(invoiceForm.customer_name.toLowerCase()) ||
                              c.email.toLowerCase().includes(invoiceForm.customer_name.toLowerCase())
                            ).slice(0, 8).map((c: Customer) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  setInvoiceForm(p => ({
                                    ...p,
                                    customer_name: c.name,
                                    customer_email: c.email,
                                    customer_phone: c.phone || p.customer_phone,
                                    customer_address: [c.address_street, c.address_city, c.address_state, c.address_zip].filter(Boolean).join(', ') || p.customer_address,
                                  }));
                                  setInvoiceShipTo({
                                    name: c.name,
                                    street: c.address_street || '',
                                    city: c.address_city || '',
                                    state: c.address_state || '',
                                    zip: c.address_zip || '',
                                  });
                                  setShippingRates([]);
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 transition flex justify-between items-center"
                              >
                                <span className="font-medium text-gray-900">{c.name}</span>
                                <span className="text-xs text-gray-400">{c.email}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Email *</label>
                        <input type="email" value={invoiceForm.customer_email} onChange={e => setInvoiceForm(p => ({ ...p, customer_email: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" placeholder="email@example.com" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Phone</label>
                        <input type="tel" value={invoiceForm.customer_phone} onChange={e => setInvoiceForm(p => ({ ...p, customer_phone: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" placeholder="(555) 000-0000" />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="block text-xs text-gray-500 mb-1">Shipping Address</label>
                      <input type="text" value={invoiceForm.customer_address} onChange={e => setInvoiceForm(p => ({ ...p, customer_address: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" placeholder="Street address, City, State, ZIP" />
                    </div>
                  </div>

                  {/* Product Search */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Add Products from Catalog</h3>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={invoiceProductSearch}
                        onChange={e => setInvoiceProductSearch(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                        placeholder="Search products to add as line items..."
                      />
                    </div>
                    {invoiceProductSearch.length >= 2 && (invoiceSearchProducts.length > 0 || matchingCustomProducts.length > 0) && (
                      <div className="mt-2 border border-gray-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-gray-100">
                        {/* Custom Products */}
                        {matchingCustomProducts.map((cp: CustomProduct) => (
                          <button
                            key={`custom-${cp.id}`}
                            onClick={() => {
                              addInvoiceItem(cp.name, 1, cp.price || 0, 0);
                              setInvoiceProductSearch('');
                            }}
                            className="w-full text-left px-3 py-2.5 hover:bg-gray-50 text-sm flex items-center gap-3"
                          >
                            {cp.image_url ? (
                              <img src={cp.image_url} alt="" className="h-10 w-10 rounded bg-gray-100 object-contain flex-shrink-0" />
                            ) : (
                              <div className="h-10 w-10 rounded bg-orange-100 flex items-center justify-center flex-shrink-0">
                                <span className="text-orange-600 text-xs font-bold">CP</span>
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-gray-900 font-medium truncate">{cp.name}</p>
                              <p className="text-xs text-orange-600">{cp.category || 'Custom Product'} {cp.price_unit ? `(${cp.price_unit})` : ''}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              {cp.price ? (
                                <p className="text-sm font-semibold text-green-700">${Number(cp.price).toFixed(2)}</p>
                              ) : (
                                <p className="text-xs text-gray-400">No price</p>
                              )}
                            </div>
                          </button>
                        ))}
                        {/* S&S Products */}
                        {invoiceSearchProducts.slice(0, 10).map((p: Product) => {
                          const wholesale = p.base_price && Number(p.base_price) > 0 ? Number(p.base_price) : null;
                          const customP = p.custom_price ? Number(p.custom_price) : null;
                          return (
                            <button
                              key={p.id}
                              onClick={async () => {
                                const ssId = (p as unknown as Record<string, unknown>).ss_id;
                                let weightOz = 0;
                                if (ssId) {
                                  try {
                                    const wr = await fetch(`/api/products/weight/${ssId}`);
                                    if (wr.ok) { const wd = await wr.json(); weightOz = wd.weight_oz || 0; }
                                  } catch {}
                                }
                                addInvoiceItem(`${p.name} (${p.brand})`, 1, customP || wholesale || 0, weightOz);
                                setInvoiceProductSearch('');
                              }}
                              className="w-full text-left px-3 py-2.5 hover:bg-gray-50 text-sm flex items-center gap-3"
                            >
                              {p.image_url ? (
                                <img src={String(p.image_url)} alt="" className="h-10 w-10 rounded bg-gray-100 object-contain flex-shrink-0" />
                              ) : (
                                <div className="h-10 w-10 rounded bg-gray-100 flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-gray-900 font-medium truncate">{p.name}</p>
                                <p className="text-xs text-gray-500">{p.brand} &middot; {p.category}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                {wholesale && <p className="text-[10px] text-gray-400">Wholesale: ${wholesale.toFixed(2)}</p>}
                                {customP ? (
                                  <p className="text-sm font-semibold text-green-700">${customP.toFixed(2)}</p>
                                ) : wholesale ? (
                                  <p className="text-sm text-gray-600">${wholesale.toFixed(2)}</p>
                                ) : (
                                  <p className="text-xs text-gray-400">No price</p>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Line Items */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Line Items</h3>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-left text-gray-500">
                            <th className="px-3 py-2 font-medium">Description</th>
                            <th className="px-2 py-2 font-medium w-14">Qty</th>
                            <th className="px-2 py-2 font-medium w-20">Price</th>
                            <th className="px-2 py-2 font-medium w-20 hidden md:table-cell">Wt (oz)</th>
                            <th className="px-2 py-2 font-medium w-20 hidden md:table-cell">Ship $</th>
                            <th className="px-2 py-2 font-medium w-20 text-right">Total</th>
                            <th className="px-2 py-2 w-8"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {invoiceForm.items.map((item, idx) => {
                            const itemShip = (item.shipping_cost || 0) * item.quantity;
                            const itemTotal = (item.quantity * item.unit_price) + itemShip;
                            return (
                            <tr key={idx}>
                              <td className="px-3 py-2">
                                <input type="text" value={item.description} onChange={e => handleInvoiceItemChange(idx, 'description', e.target.value)} className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-red-500" placeholder="Item description" />
                              </td>
                              <td className="px-2 py-2">
                                <input type="number" min="1" value={item.quantity} onChange={e => handleInvoiceItemChange(idx, 'quantity', e.target.value)} className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-red-500" />
                              </td>
                              <td className="px-2 py-2">
                                <div className="relative">
                                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">$</span>
                                  <input type="number" step="0.01" min="0" value={item.unit_price} onChange={e => handleInvoiceItemChange(idx, 'unit_price', e.target.value)} className="w-full pl-4 pr-1 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-500" />
                                </div>
                              </td>
                              <td className="px-2 py-2 hidden md:table-cell">
                                <input type="number" step="0.1" min="0" value={item.weight_oz || ''} onChange={e => handleInvoiceItemChange(idx, 'weight_oz' as keyof InvoiceItem, e.target.value)} placeholder="oz" className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-red-500" />
                              </td>
                              <td className="px-2 py-2 hidden md:table-cell">
                                <div className="relative">
                                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">$</span>
                                  <input type="number" step="0.01" min="0" value={item.shipping_cost || ''} onChange={e => handleInvoiceItemChange(idx, 'shipping_cost' as keyof InvoiceItem, e.target.value)} placeholder="0" className="w-full pl-4 pr-1 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-500" />
                                </div>
                              </td>
                              <td className="px-2 py-2 text-right font-medium text-gray-900 text-xs">
                                ${itemTotal.toFixed(2)}
                              </td>
                              <td className="px-2 py-2">
                                {invoiceForm.items.length > 1 && (
                                  <button onClick={() => removeInvoiceItem(idx)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                                )}
                              </td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <button onClick={() => addInvoiceItem()} className="mt-3 flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 font-medium">
                      <Plus className="w-4 h-4" /> Add Item
                    </button>
                  </div>

                  {/* Totals */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Due Date</label>
                        <input type="date" value={invoiceForm.due_date} onChange={e => setInvoiceForm(p => ({ ...p, due_date: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Notes</label>
                        <textarea value={invoiceForm.notes} onChange={e => setInvoiceForm(p => ({ ...p, notes: e.target.value }))} rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none" placeholder="Additional notes..." />
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Subtotal</span>
                        <span className="font-medium text-gray-900">${calcInvoiceSubtotal().toFixed(2)}</span>
                      </div>
                      {totalWeight > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">Total Weight</span>
                          <span className="text-gray-600">{totalWeight.toFixed(1)} oz ({(totalWeight / 16).toFixed(1)} lbs)</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">Tax</span>
                        <div className="relative w-28">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                          <input type="number" step="0.01" min="0" value={invoiceForm.tax} onChange={e => setInvoiceForm(p => ({ ...p, tax: e.target.value }))} className="w-full pl-5 pr-2 py-1.5 border border-gray-200 rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-red-500" />
                        </div>
                      </div>
                      <div className="text-sm space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-500">Shipping</span>
                          <div className="flex items-center gap-2">
                            <div className="relative w-28">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                              <input type="number" step="0.01" min="0" value={invoiceForm.shipping} onChange={e => { setInvoiceForm(p => ({ ...p, shipping: e.target.value })); setShippingRates([]); }} className="w-full pl-5 pr-2 py-1.5 border border-gray-200 rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-red-500" />
                            </div>
                            <button
                              type="button"
                              disabled={loadingRates}
                              onClick={async () => {
                                if (!invoiceShipTo.street || !invoiceShipTo.city || !invoiceShipTo.state || !invoiceShipTo.zip) {
                                  setRatesError('Select a customer with an address first'); return;
                                }
                                if (totalWeight <= 0) {
                                  setRatesError('Add items with weight first'); return;
                                }
                                setRatesError(''); setLoadingRates(true); setShippingRates([]);
                                try {
                                  const r = await fetch('/api/shipping/rates', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('tsb_token') || ''}` },
                                    body: JSON.stringify({
                                      toAddress: { name: invoiceShipTo.name, street1: invoiceShipTo.street, city: invoiceShipTo.city, state: invoiceShipTo.state, zip: invoiceShipTo.zip },
                                      weight: totalWeight,
                                    }),
                                  });
                                  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Failed'); }
                                  const data = await r.json();
                                  setShippingRates(data.rates || []);
                                  if (!data.rates?.length) setRatesError('No rates returned');
                                } catch (err) {
                                  setRatesError(err instanceof Error ? err.message : 'Failed to get rates');
                                } finally {
                                  setLoadingRates(false);
                                }
                              }}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition whitespace-nowrap disabled:opacity-50"
                            >
                              {loadingRates ? 'Loading...' : 'Get Rates'}
                            </button>
                          </div>
                        </div>
                        {ratesError && <p className="text-xs text-red-500 text-right">{ratesError}</p>}
                        {shippingRates.length > 0 && (
                          <div className="border border-gray-200 rounded-lg overflow-hidden">
                            {shippingRates.map((rate) => (
                              <button
                                key={rate.id}
                                type="button"
                                onClick={() => { setInvoiceForm(p => ({ ...p, shipping: rate.rate })); setShippingRates([]); }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition flex items-center justify-between border-b border-gray-100 last:border-0"
                              >
                                <div>
                                  <span className="font-medium text-gray-900">{rate.carrier}</span>
                                  <span className="text-gray-500 ml-1">{rate.service}</span>
                                  {rate.deliveryDays && <span className="text-gray-400 ml-1">({rate.deliveryDays}d)</span>}
                                </div>
                                <span className="font-semibold text-green-700">${Number(rate.rate).toFixed(2)}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">Discount</span>
                        <div className="relative w-28">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                          <input type="number" step="0.01" min="0" value={invoiceForm.discount} onChange={e => setInvoiceForm(p => ({ ...p, discount: e.target.value }))} className="w-full pl-5 pr-2 py-1.5 border border-gray-200 rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-red-500" />
                        </div>
                      </div>
                      <div className="border-t border-gray-200 pt-2 flex justify-between">
                        <span className="text-base font-bold text-gray-900">Total</span>
                        <span className="text-xl font-bold text-gray-900">${calcInvoiceTotal().toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3 pt-4 border-t border-gray-100">
                    <button onClick={() => { setInvoiceView('list'); resetInvoiceForm(); }} className="px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
                    <button
                      onClick={handleSaveInvoiceDraft}
                      disabled={!invoiceForm.customer_name || !invoiceForm.customer_email || createInvoiceMutation.isPending || updateInvoiceMutation.isPending}
                      className="px-6 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
                    >
                      {(createInvoiceMutation.isPending || updateInvoiceMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> : null}
                      {editingInvoiceId ? 'Update Invoice' : 'Save as Draft'}
                    </button>
                    <button
                      onClick={handlePreviewInvoice}
                      disabled={!invoiceForm.customer_name || !invoiceForm.customer_email || invoiceForm.items.every(i => !i.description)}
                      className="flex items-center gap-2 px-6 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                    >
                      <Eye className="w-4 h-4" /> Preview & Send
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Invoice Preview */}
            {invoiceView === 'preview' && previewInvoice && (
              <div>
                <div className="flex items-center gap-4 mb-6">
                  <button onClick={() => setInvoiceView('create')} className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-5 h-5" /></button>
                  <h2 className="text-2xl font-display font-bold text-gray-900">Invoice Preview</h2>
                </div>

                <div className="max-w-2xl mx-auto bg-white rounded-xl border border-gray-200 overflow-hidden shadow-lg">
                  {/* Preview Header */}
                  <div className="bg-gray-900 px-8 py-6 flex items-center justify-between">
                    <img src="https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/tsb-logo.png" alt="T-Shirt Brothers" className="h-10" />
                    <span className="text-white text-2xl font-bold">INVOICE</span>
                  </div>

                  <div className="p-8">
                    {/* Customer & Invoice Info */}
                    <div className="flex justify-between mb-8">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Bill To:</p>
                        <p className="font-semibold text-gray-900">{previewInvoice.customer_name}</p>
                        <p className="text-sm text-gray-500">{previewInvoice.customer_email}</p>
                        {previewInvoice.customer_phone && <p className="text-sm text-gray-500">{previewInvoice.customer_phone}</p>}
                      </div>
                      <div className="text-right text-sm">
                        <p className="text-gray-500">Invoice #: <span className="font-medium text-gray-900">INV-DRAFT</span></p>
                        <p className="text-gray-500">Date: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        {previewInvoice.due_date && <p className="text-gray-500">Due: {new Date(previewInvoice.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>}
                      </div>
                    </div>

                    {/* Line Items */}
                    <table className="w-full text-sm mb-6">
                      <thead>
                        <tr className="border-b-2 border-gray-200">
                          <th className="text-left py-2 font-semibold text-gray-600">Description</th>
                          <th className="text-center py-2 font-semibold text-gray-600">Qty</th>
                          <th className="text-right py-2 font-semibold text-gray-600">Unit Price</th>
                          <th className="text-right py-2 font-semibold text-gray-600">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewInvoice.items.filter(i => i.description).map((item, idx) => (
                          <tr key={idx} className="border-b border-gray-100">
                            <td className="py-3 text-gray-900">{item.description}</td>
                            <td className="py-3 text-center text-gray-600">{item.quantity}</td>
                            <td className="py-3 text-right text-gray-600">${item.unit_price.toFixed(2)}</td>
                            <td className="py-3 text-right font-medium text-gray-900">${(item.quantity * item.unit_price).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Totals */}
                    <div className="ml-auto w-64 space-y-1">
                      <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span className="text-gray-900">${previewInvoice.subtotal.toFixed(2)}</span></div>
                      {previewInvoice.tax > 0 && <div className="flex justify-between text-sm"><span className="text-gray-500">Tax</span><span className="text-gray-900">${previewInvoice.tax.toFixed(2)}</span></div>}
                      {previewInvoice.shipping > 0 && <div className="flex justify-between text-sm"><span className="text-gray-500">Shipping</span><span className="text-gray-900">${previewInvoice.shipping.toFixed(2)}</span></div>}
                      {previewInvoice.discount > 0 && <div className="flex justify-between text-sm"><span className="text-gray-500">Discount</span><span className="text-green-600">-${previewInvoice.discount.toFixed(2)}</span></div>}
                      <div className="border-t-2 border-gray-900 pt-2 flex justify-between">
                        <span className="font-bold text-gray-900">Total</span>
                        <span className="text-xl font-bold text-gray-900">${previewInvoice.total.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm"><span className="text-red-600 font-semibold">Amount Due</span><span className="text-red-600 font-bold text-lg">${previewInvoice.total.toFixed(2)}</span></div>
                    </div>

                    {previewInvoice.notes && (
                      <div className="mt-6 bg-green-50 border-l-4 border-green-500 p-4 rounded-r-lg">
                        <p className="text-xs font-semibold text-green-800">Notes</p>
                        <p className="text-sm text-green-700 mt-1">{previewInvoice.notes}</p>
                      </div>
                    )}

                    {/* Pay Now placeholder */}
                    <div className="mt-8 text-center">
                      <div className="inline-block bg-red-600 text-white px-12 py-3 rounded-lg font-bold text-base">Pay Now</div>
                      <p className="text-xs text-gray-400 mt-2">Customer will receive this button linked to Stripe Checkout</p>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="bg-gray-50 border-t border-gray-200 px-8 py-4 text-center">
                    <p className="text-xs text-gray-500">T-Shirt Brothers -- Custom Apparel & Screen Printing</p>
                    <p className="text-xs text-gray-500">Phone: (555) 123-4567 | Email: info@tshirtbrothers.com</p>
                    <p className="text-xs text-gray-400">123 Print Ave, Dallas TX 75001</p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-center gap-3 mt-6">
                  <button onClick={() => setInvoiceView('create')} className="px-6 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                    Edit
                  </button>
                  <button
                    onClick={handleSendPreviewedInvoice}
                    disabled={createInvoiceMutation.isPending || sendInvoiceMutation.isPending}
                    className="flex items-center gap-2 px-8 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition disabled:opacity-50"
                  >
                    {(createInvoiceMutation.isPending || sendInvoiceMutation.isPending) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Send to Customer
                  </button>
                </div>
              </div>
            )}

            {/* Record Payment Modal */}
            {recordPaymentInvoice && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl max-w-md w-full">
                  <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
                    <h3 className="font-display font-semibold text-gray-900">Record Payment</h3>
                    <button onClick={() => setRecordPaymentInvoice(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                  </div>
                  <div className="p-6 space-y-4">
                    <div className="bg-gray-50 rounded-lg p-3 text-sm">
                      <p className="font-medium text-gray-900">{recordPaymentInvoice.invoice_number}</p>
                      <p className="text-gray-500">{recordPaymentInvoice.customer_name} - Amount due: ${Number(recordPaymentInvoice.amount_due).toFixed(2)}</p>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Amount</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                        <input type="number" step="0.01" min="0" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Payment Method</label>
                      <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500">
                        <option value="card">Credit Card</option>
                        <option value="cash">Cash</option>
                        <option value="check">Check</option>
                        <option value="transfer">Bank Transfer</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setRecordPaymentInvoice(null)} className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
                      <button
                        onClick={() => {
                          if (!paymentAmount || Number(paymentAmount) <= 0) return;
                          recordPaymentMutation.mutate({ id: recordPaymentInvoice.id, amount: Number(paymentAmount), method: paymentMethod });
                        }}
                        disabled={recordPaymentMutation.isPending || !paymentAmount || Number(paymentAmount) <= 0}
                        className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-50"
                      >
                        {recordPaymentMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                        Record Payment
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Settings Section */}
        {activeSection === 'blog' && (
          <div>
            {blogView === 'ai' ? (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl md:text-2xl font-display font-bold text-gray-900">Write with AI</h2>
                  <button onClick={() => { setBlogView('list'); setAiBlogResult(null); }} className="text-sm text-gray-500 hover:text-gray-700">← Back to Posts</button>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Input form */}
                  <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Topic</label>
                      <input type="text" value={aiBlogForm.topic} onChange={e => setAiBlogForm(p => ({ ...p, topic: e.target.value }))} placeholder="e.g. How to choose the right t-shirt for screen printing" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" style={{ fontSize: '16px' }} />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Target Keywords (comma-separated)</label>
                      <input type="text" value={aiBlogForm.keywords} onChange={e => setAiBlogForm(p => ({ ...p, keywords: e.target.value }))} placeholder="e.g. custom t-shirts, screen printing, DTF" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" style={{ fontSize: '16px' }} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm font-medium text-gray-700 block mb-1">Tone</label>
                        <select value={aiBlogForm.tone} onChange={e => setAiBlogForm(p => ({ ...p, tone: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" style={{ fontSize: '16px' }}>
                          <option value="educational">Educational</option>
                          <option value="promotional">Promotional</option>
                          <option value="how-to">How-To Guide</option>
                          <option value="casual">Casual / Conversational</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700 block mb-1">Length</label>
                        <select value={aiBlogForm.length} onChange={e => setAiBlogForm(p => ({ ...p, length: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" style={{ fontSize: '16px' }}>
                          <option value="short">Short (~400 words)</option>
                          <option value="medium">Medium (~800 words)</option>
                          <option value="long">Long (~1500 words)</option>
                        </select>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={aiBlogLoading || !aiBlogForm.topic.trim()}
                      onClick={async () => {
                        setAiBlogLoading(true);
                        setAiBlogResult(null);
                        try {
                          const token = localStorage.getItem('tsb_token');
                          const res = await fetch('/api/deepseek/generate-blog-post', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                            body: JSON.stringify(aiBlogForm),
                          });
                          if (!res.ok) throw new Error('Failed');
                          const data = await res.json();
                          setAiBlogResult(data);
                          blogPostsQuery.refetch();
                        } catch {
                          alert('Blog generation failed. Please try again.');
                        } finally {
                          setAiBlogLoading(false);
                        }
                      }}
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-lg transition disabled:bg-gray-300"
                    >
                      {aiBlogLoading ? 'Writing...' : '✨ Generate Blog Post'}
                    </button>
                  </div>

                  {/* Results */}
                  <div className="bg-white rounded-xl border border-gray-200 p-5">
                    {!aiBlogResult && !aiBlogLoading && (
                      <div className="flex items-center justify-center h-64 text-gray-400 text-sm text-center">
                        Enter a topic and click "Generate Blog Post".<br />The AI will write a full SEO-optimized article and save it as a draft.
                      </div>
                    )}
                    {aiBlogLoading && (
                      <div className="flex items-center justify-center h-64 text-gray-500">
                        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Writing your blog post...
                      </div>
                    )}
                    {aiBlogResult && (
                      <div className="space-y-4">
                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase">Title</p>
                          <p className="text-lg font-bold text-gray-900">{aiBlogResult.title}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase">Meta Description</p>
                          <p className="text-sm text-gray-600">{aiBlogResult.meta_description}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase">Slug</p>
                          <p className="text-sm text-gray-500 font-mono">/blog/{aiBlogResult.slug_suggestion}</p>
                        </div>
                        {aiBlogResult.outline && (
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Outline</p>
                            <ul className="text-sm text-gray-600 space-y-1">
                              {aiBlogResult.outline.map((s, i) => <li key={i} className="flex gap-2"><span className="text-orange-500 font-bold">{i + 1}.</span> {s}</li>)}
                            </ul>
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Preview</p>
                          <div className="border border-gray-200 rounded-lg p-4 max-h-80 overflow-y-auto prose prose-sm" dangerouslySetInnerHTML={{ __html: aiBlogResult.full_html_content || '' }} />
                        </div>
                        {aiBlogResult.saved && (
                          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                            <p className="text-sm text-green-700 font-medium">✅ Saved as draft!</p>
                            <p className="text-xs text-green-600 mt-1">Go to Blog → find "{aiBlogResult.saved.title}" → edit and publish when ready.</p>
                          </div>
                        )}
                        <button
                          onClick={() => { setBlogView('list'); setAiBlogResult(null); }}
                          className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 rounded-lg text-sm"
                        >
                          ← Back to Blog Posts
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : blogView === 'list' ? (
              <>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-display font-bold text-gray-900">Blog Posts</h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setBlogView('ai')}
                      className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition"
                    >
                      <Sparkles className="w-4 h-4" />
                      Write with AI
                    </button>
                    <button
                      onClick={() => { resetBlogForm(); setBlogView('editor'); }}
                      className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition"
                    >
                      <Plus className="w-4 h-4" />
                      New Post
                    </button>
                  </div>
                </div>

                {blogPostsQuery.isLoading && (
                  <div className="flex justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                )}

                {blogPostsQuery.data && blogPostsQuery.data.length === 0 && (
                  <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                    <PenSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500">No blog posts yet. Create your first one!</p>
                  </div>
                )}

                {blogPostsQuery.data && blogPostsQuery.data.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left text-gray-500">
                          <th className="px-4 py-3 font-medium">Title</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                          <th className="px-4 py-3 font-medium">Date</th>
                          <th className="px-4 py-3 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {blogPostsQuery.data.map((post: BlogPost) => (
                          <tr key={post.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">{post.title}</td>
                            <td className="px-4 py-3">
                              <StatusBadge status={post.status} />
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              {post.published_at
                                ? new Date(post.published_at).toLocaleDateString()
                                : new Date(post.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleEditPost(post)}
                                  className="p-1.5 text-gray-400 hover:text-blue-600 transition"
                                  title="Edit"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                {post.status === 'draft' && (
                                  <button
                                    onClick={() => publishBlogMutation.mutate(post.id)}
                                    className="px-2.5 py-1 text-xs font-medium bg-green-50 text-green-700 rounded-md hover:bg-green-100 transition"
                                  >
                                    Publish
                                  </button>
                                )}
                                <button
                                  disabled={igLoading}
                                  onClick={async () => {
                                    setIgLoading(true);
                                    try {
                                      const token = localStorage.getItem('tsb_token');
                                      const res = await fetch('/api/deepseek/generate-instagram', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
                                        body: JSON.stringify({ title: post.title, content: post.content || '', topic: post.title }),
                                      });
                                      if (res.ok) setIgPost(await res.json());
                                      else alert('Failed to generate Instagram post');
                                    } catch { alert('Failed'); } finally { setIgLoading(false); }
                                  }}
                                  className="px-2.5 py-1 text-xs font-medium bg-pink-50 text-pink-700 rounded-md hover:bg-pink-100 transition disabled:opacity-50"
                                  title="Generate Instagram Post"
                                >
                                  {igLoading ? '...' : '📸 IG'}
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm('Delete this post?')) deleteBlogMutation.mutate(post.id);
                                  }}
                                  className="p-1.5 text-gray-400 hover:text-red-600 transition"
                                  title="Delete"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <div>
                <button
                  onClick={() => { setBlogView('list'); resetBlogForm(); }}
                  className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition mb-6"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Posts
                </button>

                <h2 className="text-2xl font-display font-bold text-gray-900 mb-6">
                  {editingPost ? 'Edit Post' : 'New Post'}
                </h2>

                <div className="space-y-5">
                  {/* Title */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                    <input
                      value={blogForm.title}
                      onChange={(e) => handleBlogTitleChange(e.target.value)}
                      placeholder="Post title..."
                      className="w-full border border-gray-200 rounded-lg px-4 py-3 text-lg font-display font-bold focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>

                  {/* Slug */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
                    <input
                      value={blogForm.slug}
                      onChange={(e) => setBlogForm(prev => ({ ...prev, slug: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>

                  {/* Excerpt */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Excerpt</label>
                    <textarea
                      value={blogForm.excerpt}
                      onChange={(e) => setBlogForm(prev => ({ ...prev, excerpt: e.target.value }))}
                      rows={3}
                      placeholder="Brief summary of the post..."
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>

                  {/* Cover Image */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cover Image URL</label>
                    <input
                      value={blogForm.cover_image}
                      onChange={(e) => setBlogForm(prev => ({ ...prev, cover_image: e.target.value }))}
                      placeholder="https://..."
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                    {blogForm.cover_image && (
                      <img src={blogForm.cover_image} alt="Cover preview" className="mt-2 h-32 object-cover rounded-lg" />
                    )}
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tags (comma separated)</label>
                    <input
                      value={blogForm.tags}
                      onChange={(e) => setBlogForm(prev => ({ ...prev, tags: e.target.value }))}
                      placeholder="screen printing, tips, guides"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>

                  {/* Content */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Content (HTML)</label>
                    <textarea
                      value={blogForm.content}
                      onChange={(e) => setBlogForm(prev => ({ ...prev, content: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono min-h-[400px] focus:outline-none focus:ring-2 focus:ring-red-500"
                      placeholder="<h2>Your post content here...</h2><p>Write HTML content...</p>"
                    />
                  </div>

                  {/* Meta fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Meta Title</label>
                      <input
                        value={blogForm.meta_title}
                        onChange={(e) => setBlogForm(prev => ({ ...prev, meta_title: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Meta Description</label>
                      <input
                        value={blogForm.meta_description}
                        onChange={(e) => setBlogForm(prev => ({ ...prev, meta_description: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
                    <button
                      onClick={() => handleSaveBlogPost('draft')}
                      disabled={!blogForm.title || createBlogMutation.isPending || updateBlogMutation.isPending}
                      className="px-5 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition disabled:opacity-50"
                    >
                      {(createBlogMutation.isPending || updateBlogMutation.isPending) ? 'Saving...' : 'Save Draft'}
                    </button>
                    <button
                      onClick={() => handleSaveBlogPost('published')}
                      disabled={!blogForm.title || createBlogMutation.isPending || updateBlogMutation.isPending}
                      className="px-5 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                    >
                      Publish
                    </button>
                    {blogForm.slug && (
                      <a
                        href={`/blog/${blogForm.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-blue-600 hover:text-blue-700 transition"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Preview
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        
        
        {/* Instagram Post Preview Modal */}
        {igPost && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setIgPost(null)}>
            <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <h3 className="font-semibold text-gray-900">📸 Instagram Post Ready</h3>
                <button onClick={() => setIgPost(null)} className="text-gray-400 hover:text-gray-700"><X className="h-5 w-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                {igPost.image_url && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Generated Image</p>
                    <img src={igPost.image_url} alt="IG Post" className="w-full rounded-xl border" />
                    <a href={igPost.image_url} download="instagram-post.png" target="_blank" rel="noreferrer"
                      className="mt-2 block text-center text-xs font-medium text-blue-600 hover:underline">
                      ⬇️ Download Image
                    </a>
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Caption</p>
                  <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-wrap">{igPost.caption}</div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Hashtags</p>
                  <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700 break-words">{igPost.hashtags}</div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Full Post (copy this)</p>
                  <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-wrap border-2 border-dashed border-gray-200">{igPost.full_post}</div>
                  <button
                    onClick={() => { navigator.clipboard.writeText(igPost.full_post || ''); alert('Copied to clipboard!'); }}
                    className="mt-2 w-full bg-pink-500 hover:bg-pink-600 text-white font-bold py-3 rounded-xl text-sm transition"
                  >
                    📋 Copy Full Post to Clipboard
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 text-center">
                  Open Instagram on your phone → New Post → paste the caption → upload the image → post!
                </p>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'workspace' && (
          <DesignWorkspace />
        )}

        {activeSection === 'promotions' && (
          <div>
            <h2 className="text-xl md:text-2xl font-display font-bold text-gray-900 mb-6">Promotions</h2>
            <PromoManager />
          </div>
        )}


        {activeSection === 'gangsheet' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl md:text-2xl font-display font-bold text-gray-900">Gang Sheets</h2>
              <Link to="/admin/gangsheet" className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition">
                <Plus className="w-4 h-4" /> New Gang Sheet
              </Link>
            </div>
            <GangSheetList />
          </div>
        )}

        {activeSection === 'pricing' && (
          <div>
            <h2 className="text-xl md:text-2xl font-display font-bold text-gray-900 mb-6">AI Pricing Assistant</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Input form */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                <h3 className="font-semibold text-gray-900">Quote Parameters</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Brand</label>
                    <select value={pricingForm.brand} onChange={e => setPricingForm(p => ({ ...p, brand: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" style={{ fontSize: '16px' }}>
                      <option value="gildan">Gildan</option>
                      <option value="bella-canvas">Bella+Canvas</option>
                      <option value="next-level">Next Level</option>
                      <option value="comfort-colors">Comfort Colors</option>
                      <option value="champion">Champion</option>
                      <option value="hanes">Hanes</option>
                      <option value="nike">Nike</option>
                      <option value="adidas">Adidas</option>
                      <option value="under-armour">Under Armour</option>
                      <option value="carhartt">Carhartt</option>
                      <option value="port-authority">Port Authority</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Product Type</label>
                    <select value={pricingForm.product_type} onChange={e => setPricingForm(p => ({ ...p, product_type: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" style={{ fontSize: '16px' }}>
                      <option value="t-shirt">T-Shirt</option>
                      <option value="premium-tee">Premium Tee</option>
                      <option value="hoodie">Hoodie</option>
                      <option value="crewneck-sweatshirt">Crewneck Sweatshirt</option>
                      <option value="tank-top">Tank Top</option>
                      <option value="polo">Polo</option>
                      <option value="long-sleeve">Long Sleeve</option>
                      <option value="jersey">Jersey</option>
                      <option value="jacket">Jacket</option>
                      <option value="hat">Hat</option>
                      <option value="towel">Towel</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Quantity</label>
                    <input type="number" min={1} value={pricingForm.quantity} onChange={e => setPricingForm(p => ({ ...p, quantity: Number(e.target.value) || 1 }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" style={{ fontSize: '16px' }} />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Print Method</label>
                    <select value={pricingForm.print_method} onChange={e => setPricingForm(p => ({ ...p, print_method: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" style={{ fontSize: '16px' }}>
                      <option value="screen-print">Screen Print</option>
                      <option value="dtf">DTF Transfer</option>
                      <option value="sublimation">Sublimation</option>
                      <option value="vinyl">Vinyl</option>
                      <option value="embroidery">Embroidery</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Print Areas</label>
                    <select value={pricingForm.print_areas} onChange={e => setPricingForm(p => ({ ...p, print_areas: Number(e.target.value) }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" style={{ fontSize: '16px' }}>
                      <option value={1}>1 (Front only)</option>
                      <option value={2}>2 (Front + Back)</option>
                      <option value={3}>3 (+ Sleeve)</option>
                      <option value={4}>4 (All areas)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Colors in Design</label>
                    <select value={pricingForm.colors_in_design} onChange={e => setPricingForm(p => ({ ...p, colors_in_design: Number(e.target.value) }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" style={{ fontSize: '16px' }}>
                      {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} color{n > 1 ? 's' : ''}</option>)}
                      <option value={99}>Full color (DTF/sublimation)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Design/Image Size</label>
                  <select value={pricingForm.design_size} onChange={e => setPricingForm(p => ({ ...p, design_size: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" style={{ fontSize: '16px' }}>
                    <option value="left-chest">Left Chest (4" x 4")</option>
                    <option value="standard">Standard (10" x 12")</option>
                    <option value="oversized">Oversized (14" x 16")</option>
                    <option value="full-front">Full Front (edge to edge)</option>
                    <option value="full-back">Full Back (edge to edge)</option>
                    <option value="sleeve">Sleeve (3" x 10")</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Deadline (days)</label>
                    <input type="number" min={1} value={pricingForm.deadline_days} onChange={e => setPricingForm(p => ({ ...p, deadline_days: Number(e.target.value) || 14 }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" style={{ fontSize: '16px' }} />
                  </div>
                  <div className="flex items-end pb-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={pricingForm.is_rush} onChange={e => setPricingForm(p => ({ ...p, is_rush: e.target.checked }))} className="w-4 h-4 accent-red-600" />
                      <span className="text-sm font-medium text-gray-700">Rush Order (+50%)</span>
                    </label>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={pricingLoading}
                  onClick={async () => {
                    setPricingLoading(true);
                    setPricingResult(null);
                    try {
                      const token = localStorage.getItem('tsb_token');
                      const res = await fetch('/api/deepseek/suggest-price', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                        body: JSON.stringify(pricingForm),
                      });
                      if (!res.ok) throw new Error('Failed');
                      const data = await res.json();
                      setPricingResult(data);
                    } catch {
                      alert('Pricing suggestion failed. Please try again.');
                    } finally {
                      setPricingLoading(false);
                    }
                  }}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition disabled:bg-gray-300"
                >
                  {pricingLoading ? 'Calculating...' : 'Get AI Price Suggestion'}
                </button>
              </div>

              {/* Results */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                {!pricingResult && !pricingLoading && (
                  <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                    Fill in the form and click "Get AI Price Suggestion" to see results
                  </div>
                )}
                {pricingLoading && (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" /> Analyzing pricing...
                  </div>
                )}
                {pricingResult && (
                  <div className="space-y-5">
                    {/* Suggested price */}
                    <div className="text-center py-4 bg-green-50 rounded-xl">
                      <p className="text-sm text-green-700 font-medium">Suggested Price Per Unit</p>
                      <p className="text-4xl font-bold text-green-700 mt-1">${pricingResult.suggested_price?.toFixed(2)}</p>
                      <p className="text-xs text-green-600 mt-1">
                        Total: ${((pricingResult.suggested_price || 0) * pricingForm.quantity).toFixed(2)} for {pricingForm.quantity} units
                      </p>
                    </div>

                    {/* Cost breakdown */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-[10px] text-gray-500 font-medium">Garment Cost</p>
                        <p className="text-lg font-bold text-gray-700">${(pricingResult.garment_cost || 0).toFixed(2)}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-[10px] text-gray-500 font-medium">Print Cost</p>
                        <p className="text-lg font-bold text-gray-700">${(pricingResult.print_cost || 0).toFixed(2)}</p>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-3 text-center">
                        <p className="text-[10px] text-purple-600 font-medium">Margin</p>
                        <p className="text-lg font-bold text-purple-700">{pricingResult.profit_margin_percentage?.toFixed(0)}%</p>
                      </div>
                    </div>

                    {/* Gang sheet breakdown (DTF) */}
                    {pricingResult.gang_sheet_details && pricingResult.gang_sheet_details.designs_per_foot ? (
                      <div className="bg-orange-50 rounded-lg p-3">
                        <p className="text-xs font-semibold text-orange-700 mb-2">KolorMatrix Gang Sheet Breakdown</p>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div className="text-center">
                            <p className="text-gray-500">Design Size</p>
                            <p className="font-bold text-gray-900">{pricingResult.gang_sheet_details.design_width_inches}&quot;x{pricingResult.gang_sheet_details.design_height_inches}&quot;</p>
                          </div>
                          <div className="text-center">
                            <p className="text-gray-500">Per Foot</p>
                            <p className="font-bold text-gray-900">{pricingResult.gang_sheet_details.designs_per_foot} designs</p>
                          </div>
                          <div className="text-center">
                            <p className="text-gray-500">Sheet Needed</p>
                            <p className="font-bold text-gray-900">{pricingResult.gang_sheet_details.sheet_length_feet}ft</p>
                          </div>
                        </div>
                        <div className="flex justify-between mt-2 pt-2 border-t border-orange-200 text-xs">
                          <span className="text-orange-700">Sheet Cost: <strong>${pricingResult.gang_sheet_details.sheet_cost?.toFixed(2)}</strong></span>
                          <span className="text-orange-700">Per Unit: <strong>${pricingResult.gang_sheet_details.cost_per_unit?.toFixed(2)}</strong></span>
                        </div>
                      </div>
                    ) : null}

                    {/* Confidence */}
                    <div className="bg-blue-50 rounded-lg p-2 text-center">
                      <p className="text-xs text-blue-600">AI Confidence: <span className="font-bold">{Math.round((pricingResult.confidence_level || 0) * 100)}%</span></p>
                    </div>

                    {/* Bulk tiers */}
                    {pricingResult.bulk_tier_prices && (
                      <div>
                        <p className="text-sm font-semibold text-gray-700 mb-2">Bulk Pricing Tiers</p>
                        <div className="grid grid-cols-2 gap-2">
                          {Object.entries(pricingResult.bulk_tier_prices).map(([qty, price]) => (
                            <div key={qty} className="bg-gray-50 rounded-lg p-2 text-center">
                              <p className="text-xs text-gray-500">{qty} units</p>
                              <p className="font-bold text-gray-900">${Number(price).toFixed(2)}/ea</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Reasoning */}
                    {pricingResult.reasoning && (
                      <div>
                        <p className="text-sm font-semibold text-gray-700 mb-1">AI Reasoning</p>
                        <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">{pricingResult.reasoning}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeSection === 'settings' && (
          <div>
            <h2 className="text-2xl font-display font-bold text-gray-900 mb-6">Settings</h2>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
              {(['business', 'notifications', 'payment'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setSettingsTab(tab)}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition ${
                    settingsTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab === 'business' ? 'Business Info' : tab === 'notifications' ? 'Notifications' : 'Payment & Pricing'}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
              {settingsTab === 'business' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                    <input value={settingsForm.companyName || ''} onChange={e => handleSettingsChange('companyName', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 1</label>
                    <input value={settingsForm.address1 || ''} onChange={e => handleSettingsChange('address1', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 2</label>
                    <input value={settingsForm.address2 || ''} onChange={e => handleSettingsChange('address2', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                      <input value={settingsForm.phone || ''} onChange={e => handleSettingsChange('phone', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input value={settingsForm.email || ''} onChange={e => handleSettingsChange('email', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Business Hours</label>
                    <textarea rows={3} value={settingsForm.businessHours || ''} onChange={e => handleSettingsChange('businessHours', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Service Area</label>
                    <input value={settingsForm.serviceArea || ''} onChange={e => handleSettingsChange('serviceArea', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </>
              )}

              {settingsTab === 'notifications' && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Email Notifications</p>
                      <p className="text-xs text-gray-500">Send email notifications for quotes and orders</p>
                    </div>
                    <button
                      onClick={() => handleSettingsChange('emailNotifications', settingsForm.emailNotifications === 'true' ? 'false' : 'true')}
                      className={`w-12 h-6 rounded-full transition ${settingsForm.emailNotifications === 'true' ? 'bg-blue-600' : 'bg-gray-300'}`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${settingsForm.emailNotifications === 'true' ? 'translate-x-6' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700">SMS Notifications</p>
                      <p className="text-xs text-gray-500">Send SMS alerts via Twilio</p>
                    </div>
                    <button
                      onClick={() => handleSettingsChange('smsNotifications', settingsForm.smsNotifications === 'true' ? 'false' : 'true')}
                      className={`w-12 h-6 rounded-full transition ${settingsForm.smsNotifications === 'true' ? 'bg-blue-600' : 'bg-gray-300'}`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${settingsForm.smsNotifications === 'true' ? 'translate-x-6' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email</label>
                    <input value={settingsForm.adminEmail || ''} onChange={e => handleSettingsChange('adminEmail', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Admin Phone (for SMS)</label>
                    <input value={settingsForm.adminPhone || ''} onChange={e => handleSettingsChange('adminPhone', e.target.value)} placeholder="+14706224845" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">From Email (Resend sender)</label>
                    <input value={settingsForm.fromEmail || ''} onChange={e => handleSettingsChange('fromEmail', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </>
              )}

              {settingsTab === 'payment' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Deposit Percentage</label>
                      <div className="relative">
                        <input type="number" value={settingsForm.depositPercent || ''} onChange={e => handleSettingsChange('depositPercent', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <span className="absolute right-3 top-2 text-sm text-gray-400">%</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tax Rate</label>
                      <div className="relative">
                        <input type="number" step="0.1" value={settingsForm.taxRate || ''} onChange={e => handleSettingsChange('taxRate', e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <span className="absolute right-3 top-2 text-sm text-gray-400">%</span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Rush Fee</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-sm text-gray-400">$</span>
                        <input type="number" value={settingsForm.rushFee || ''} onChange={e => handleSettingsChange('rushFee', e.target.value)} className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Design Fee</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-sm text-gray-400">$</span>
                        <input type="number" value={settingsForm.designFee || ''} onChange={e => handleSettingsChange('designFee', e.target.value)} className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Free Shipping Threshold</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-sm text-gray-400">$</span>
                      <input type="number" value={settingsForm.freeShippingThreshold || ''} onChange={e => handleSettingsChange('freeShippingThreshold', e.target.value)} className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                </>
              )}

              {/* Save button */}
              <div className="pt-4 border-t border-gray-100">
                <button
                  onClick={handleSaveSettings}
                  disabled={settingsSaving}
                  className="px-6 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {settingsSaving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Quote / Order Detail Drawer */}
        {detailQuote && (() => {
          const q = detailQuote as Quote & { deposit_amount?: number | null; balance_paid_at?: string | null };
          const customerName = (q as Quote).customer_name || (q as Quote).customerName || '';
          const customerEmail = (q as Quote).customer_email || (q as Quote).customerEmail || '';
          const customerPhone = (q as Quote).customer_phone || (q as Quote).customerPhone || '';
          const productName = (q as Quote).product_name || (q as Quote).productName || '';
          const createdAt = (q as Quote).created_at || (q as Quote).createdAt || '';
          const sizes = (q as Quote).sizes;
          const printAreas = (q as Quote).print_areas;
          const shippingAddress = (q as Quote).shipping_address as { street?: string; city?: string; state?: string; zip?: string } | undefined;
          const total = q.estimated_price != null ? Number(q.estimated_price) : 0;
          const paid = q.deposit_amount != null ? Number(q.deposit_amount) : 0;
          const balance = total - paid;

          const sizeEntries: [string, number][] = (() => {
            if (!sizes) return [];
            try {
              const parsed = typeof sizes === 'string' ? JSON.parse(sizes) : sizes;
              if (Array.isArray(parsed)) {
                return parsed.map((s) =>
                  typeof s === 'object' && s !== null
                    ? [String((s as { size?: string }).size), Number((s as { quantity?: number }).quantity) || 0]
                    : [String(s), 0]
                );
              }
              if (typeof parsed === 'object' && parsed !== null) {
                return Object.entries(parsed as Record<string, number>).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)]);
              }
            } catch {
              // ignore
            }
            return [];
          })();

          const printAreasList: string[] = (() => {
            if (!printAreas) return [];
            try {
              const parsed = typeof printAreas === 'string' ? JSON.parse(printAreas) : printAreas;
              if (Array.isArray(parsed)) return parsed.map(String);
            } catch {
              // ignore
            }
            return [];
          })();

          return (
            <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setDetailQuote(null)}>
              <div className="absolute inset-0 bg-black/50" />
              <div
                className="relative bg-white w-full md:max-w-lg h-full overflow-y-auto shadow-2xl animate-slide-in-right"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between z-10">
                  <div>
                    <h3 className="font-display font-semibold text-gray-900 text-lg">Quote #{q.id}</h3>
                    <p className="text-xs text-gray-500">{createdAt ? new Date(createdAt).toLocaleString() : ''}</p>
                  </div>
                  <button onClick={() => setDetailQuote(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                </div>

                <div className="p-5 space-y-5">
                  {/* Status */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge status={q.status} />
                    {q.date_needed && (
                      <span className="text-xs font-medium text-orange-600 bg-orange-50 px-2 py-1 rounded">
                        Needed by {new Date(q.date_needed).toLocaleDateString()}
                      </span>
                    )}
                    {(q as Quote & { triage?: { urgency?: string } }).triage?.urgency && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        (q as Quote & { triage?: { urgency?: string } }).triage?.urgency === 'rush' ? 'bg-red-600 text-white' :
                        (q as Quote & { triage?: { urgency?: string } }).triage?.urgency === 'high' ? 'bg-red-100 text-red-700' :
                        (q as Quote & { triage?: { urgency?: string } }).triage?.urgency === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {(q as Quote & { triage?: { urgency?: string } }).triage?.urgency?.toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* AI Triage summary */}
                  {(q as Quote & { triage?: { summary?: string; complexity?: string; estimated_hours?: number } }).triage?.summary && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-xs font-semibold text-blue-600 uppercase mb-1">AI Triage</p>
                      <p className="text-sm text-blue-800">{(q as Quote & { triage?: { summary?: string } }).triage?.summary}</p>
                      <div className="flex gap-3 mt-1 text-[10px] text-blue-600">
                        {(q as Quote & { triage?: { complexity?: string } }).triage?.complexity && (
                          <span>Complexity: <strong>{(q as Quote & { triage?: { complexity?: string } }).triage?.complexity}</strong></span>
                        )}
                        {(q as Quote & { triage?: { estimated_hours?: number } }).triage?.estimated_hours && (
                          <span>Est: <strong>{(q as Quote & { triage?: { estimated_hours?: number } }).triage?.estimated_hours}h</strong></span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Design preview */}
                  {q.design_url && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Design</p>
                      <a href={q.design_url} target="_blank" rel="noreferrer" className="block">
                        <img src={q.design_url} alt="Design" className="w-full max-h-64 object-contain rounded-lg border border-gray-200 bg-gray-50" />
                      </a>
                    </div>
                  )}

                  {/* Customer */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Customer</p>
                    <p className="font-semibold text-gray-900">{customerName}</p>
                    <a href={`mailto:${customerEmail}`} className="text-sm text-blue-600 block">{customerEmail}</a>
                    {customerPhone && <a href={`tel:${customerPhone}`} className="text-sm text-blue-600 block">{customerPhone}</a>}
                  </div>

                  {/* Product */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Product</p>
                    <p className="font-semibold text-gray-900">{productName}</p>
                    {q.color && (
                      <p className="text-sm text-gray-600">Color: <span className="font-medium">{q.color}</span></p>
                    )}
                    <p className="text-sm text-gray-600">Quantity: <span className="font-medium">{q.quantity}</span></p>
                  </div>

                  {/* Sizes breakdown */}
                  {sizeEntries.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Sizes</p>
                      <div className="grid grid-cols-4 gap-2">
                        {sizeEntries.map(([size, qty]) => (
                          <div key={size} className="bg-gray-50 rounded-lg p-2 text-center">
                            <p className="text-xs text-gray-500">{size}</p>
                            <p className="font-semibold text-gray-900">{qty}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Print Areas */}
                  {printAreasList.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Print Areas</p>
                      <div className="flex flex-wrap gap-2">
                        {printAreasList.map((area) => (
                          <span key={area} className="text-xs bg-gray-100 text-gray-700 px-3 py-1 rounded-full">{area}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Shipping */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Fulfillment</p>
                    <p className="text-sm text-gray-700 capitalize">{q.shipping_method || 'pickup'}</p>
                    {shippingAddress && (shippingAddress.street || shippingAddress.city) && (
                      <p className="text-sm text-gray-600 mt-1">
                        {shippingAddress.street}<br />
                        {shippingAddress.city}{shippingAddress.city && shippingAddress.state && ', '}{shippingAddress.state} {shippingAddress.zip}
                      </p>
                    )}
                  </div>

                  {/* Customer Notes */}
                  {q.notes && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Customer Notes</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap bg-yellow-50 border border-yellow-200 rounded-lg p-3">{q.notes}</p>
                    </div>
                  )}

                  {/* Admin Private Notes */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Internal Notes (admin only)</p>
                    <textarea
                      value={adminNotesDraft}
                      onChange={(e) => setAdminNotesDraft(e.target.value)}
                      placeholder="Private notes for your team — customers never see this..."
                      className="w-full text-sm text-gray-700 bg-blue-50 border border-blue-200 rounded-lg p-3 min-h-[80px] focus:outline-none focus:ring-2 focus:ring-blue-400"
                      style={{ fontSize: '16px' }}
                    />
                    <button
                      disabled={adminNotesSaving || adminNotesDraft === (q.admin_notes || '')}
                      onClick={async () => {
                        setAdminNotesSaving(true);
                        try {
                          await updateAdminNotes(String(q.id), adminNotesDraft);
                          queryClient.invalidateQueries({ queryKey: ['admin', 'quotes'] });
                          queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
                          setDetailQuote({ ...(q as Quote), admin_notes: adminNotesDraft } as Quote);
                        } catch (err) {
                          alert('Failed to save notes: ' + (err as Error).message);
                        } finally {
                          setAdminNotesSaving(false);
                        }
                      }}
                      className="mt-2 px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      {adminNotesSaving ? 'Saving...' : 'Save Notes'}
                    </button>
                  </div>

                  {/* AI Assistant (DeepSeek) */}
                  <div className="border-t border-gray-200 pt-5">
                    <p className="text-xs font-semibold text-purple-600 uppercase mb-3 flex items-center gap-1">
                      ✨ AI Assistant
                    </p>

                    {/* Triage */}
                    <div className="mb-4">
                      <button
                        disabled={aiTriageLoading}
                        onClick={async () => {
                          setAiTriageLoading(true);
                          try {
                            const quoteText = [
                              `Product: ${productName}`,
                              `Quantity: ${q.quantity}`,
                              q.color ? `Color: ${q.color}` : '',
                              q.date_needed ? `Deadline: ${q.date_needed}` : '',
                              q.notes ? `Notes: ${q.notes}` : '',
                            ].filter(Boolean).join('\n');
                            const result = await classifyQuote(quoteText, q.id);
                            setAiTriage(result);
                            queryClient.invalidateQueries({ queryKey: ['admin', 'quotes'] });
                          } catch (err) {
                            alert('Triage failed: ' + (err as Error).message);
                          } finally {
                            setAiTriageLoading(false);
                          }
                        }}
                        className="w-full px-3 py-2 text-xs font-semibold bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 disabled:opacity-50"
                      >
                        {aiTriageLoading ? 'Analyzing...' : '🔍 Classify & Triage'}
                      </button>
                      {aiTriage && (
                        <div className="mt-2 bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs space-y-1">
                          <p><span className="font-semibold">Urgency:</span> <span className={`capitalize ${aiTriage.urgency === 'rush' || aiTriage.urgency === 'high' ? 'text-red-600 font-bold' : 'text-gray-700'}`}>{aiTriage.urgency}</span></p>
                          <p><span className="font-semibold">Complexity:</span> <span className="capitalize">{aiTriage.complexity}</span></p>
                          <p><span className="font-semibold">Est. hours:</span> {aiTriage.estimated_hours}</p>
                          <p><span className="font-semibold">Dept:</span> <span className="capitalize">{aiTriage.recommended_department}</span></p>
                          <p><span className="font-semibold">Follow up:</span> {aiTriage.suggested_followup_time}</p>
                          <p className="text-gray-700 pt-1 border-t border-purple-200">{aiTriage.summary}</p>
                        </div>
                      )}
                    </div>

                    {/* Pricing Suggestion */}
                    {total === 0 && (
                      <div className="mb-4">
                        <button
                          disabled={aiPriceLoading}
                          onClick={async () => {
                            setAiPriceLoading(true);
                            try {
                              const days = q.date_needed ? Math.ceil((new Date(q.date_needed).getTime() - Date.now()) / 86400000) : undefined;
                              const result = await suggestPrice({
                                product_type: productName.toLowerCase().includes('hood') ? 'hoodie' : productName.toLowerCase().includes('polo') ? 'polo' : 't-shirt',
                                quantity: q.quantity,
                                print_areas: Array.isArray((q as Quote).print_areas) ? ((q as Quote).print_areas as unknown[]).length : 1,
                                is_rush: days !== undefined && days < 7,
                                deadline_days: days,
                              });
                              setAiPriceResult(result);
                            } catch (err) {
                              alert('Pricing failed: ' + (err as Error).message);
                            } finally {
                              setAiPriceLoading(false);
                            }
                          }}
                          className="w-full px-3 py-2 text-xs font-semibold bg-green-100 text-green-700 rounded-lg hover:bg-green-200 disabled:opacity-50"
                        >
                          {aiPriceLoading ? 'Calculating...' : '💰 Suggest Price'}
                        </button>
                        {aiPriceResult && (
                          <div className="mt-2 bg-green-50 border border-green-200 rounded-lg p-3 text-xs space-y-1">
                            <p className="text-base font-bold text-green-700">${Number(aiPriceResult.suggested_price).toFixed(2)}/unit</p>
                            <p className="text-gray-600">Margin: {aiPriceResult.profit_margin_percentage}% · Confidence: {Math.round(aiPriceResult.confidence_level * 100)}%</p>
                            {aiPriceResult.bulk_tier_prices && (
                              <div className="grid grid-cols-4 gap-1 pt-1">
                                {Object.entries(aiPriceResult.bulk_tier_prices).map(([qty, price]) => (
                                  <div key={qty} className="text-center">
                                    <p className="text-[10px] text-gray-500">{qty}+</p>
                                    <p className="font-semibold">${Number(price).toFixed(2)}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                            <p className="text-gray-600 italic pt-1 border-t border-green-200">{aiPriceResult.reasoning}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Draft Reply */}
                    <div>
                      <p className="text-[10px] text-gray-500 mb-1">Draft an email reply — what's the customer asking?</p>
                      <textarea
                        value={aiDraftQuestion}
                        onChange={(e) => setAiDraftQuestion(e.target.value)}
                        placeholder="e.g. Can you do 50 shirts by next Friday?"
                        rows={2}
                        className="w-full text-xs border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-purple-400"
                        style={{ fontSize: '16px' }}
                      />
                      <button
                        disabled={aiDraftLoading || !aiDraftQuestion.trim()}
                        onClick={async () => {
                          setAiDraftLoading(true);
                          try {
                            const ctx = `Quote #${q.id}, ${q.quantity}× ${productName}${q.date_needed ? ', needed by ' + q.date_needed : ''}${total > 0 ? ', total $' + total.toFixed(2) : ''}`;
                            const result = await draftReply(aiDraftQuestion, customerEmail, ctx);
                            setAiDraft(result);
                          } catch (err) {
                            alert('Draft failed: ' + (err as Error).message);
                          } finally {
                            setAiDraftLoading(false);
                          }
                        }}
                        className="mt-1 w-full px-3 py-2 text-xs font-semibold bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                      >
                        {aiDraftLoading ? 'Drafting...' : '✍️ Draft Reply'}
                      </button>
                      {aiDraft && (
                        <div className="mt-2 space-y-2">
                          {(['professional', 'friendly', 'urgent'] as const).map((tone) => (
                            <div key={tone} className="bg-purple-50 border border-purple-200 rounded-lg p-2">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-bold uppercase text-purple-700">{tone}</span>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(aiDraft[tone]);
                                    alert('Copied!');
                                  }}
                                  className="text-[10px] text-purple-600 hover:underline"
                                >
                                  Copy
                                </button>
                              </div>
                              <p className="text-xs text-gray-800 whitespace-pre-wrap">{aiDraft[tone]}</p>
                            </div>
                          ))}
                          <a
                            href={`mailto:${customerEmail}?subject=Re:%20Quote%20%23${q.id}&body=${encodeURIComponent(aiDraft.friendly)}`}
                            className="block w-full text-center px-3 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                          >
                            📧 Send via Email
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Pricing */}
                  {total > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Pricing</p>
                      <div className="space-y-1 text-sm bg-gray-50 rounded-lg p-3">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Total</span>
                          <span className="font-semibold text-gray-900">${total.toFixed(2)}</span>
                        </div>
                        {paid > 0 && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Deposit Paid</span>
                              <span className="font-semibold text-green-600">${paid.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between pt-1 border-t border-gray-200">
                              <span className="text-gray-600">Balance Due</span>
                              <span className={`font-semibold ${balance > 0 ? 'text-red-600' : 'text-gray-500'}`}>${balance.toFixed(2)}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="pt-2 space-y-2">
                    {(q.status === 'pending' || q.status === 'reviewed' || q.status === 'quoted') && (
                      <button
                        onClick={() => { openPriceModal(q as Quote); setDetailQuote(null); }}
                        className="w-full py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700"
                      >
                        {q.status === 'quoted' ? 'Re-Quote Price' : 'Send Price Quote'}
                      </button>
                    )}
                    {q.status === 'accepted' && balance > 0 && (
                      <button
                        onClick={() => {
                          sendBalanceRequest(String(q.id))
                            .then(() => alert('Balance request sent to ' + customerEmail))
                            .catch((err: Error) => alert('Failed: ' + err.message));
                        }}
                        className="w-full py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700"
                      >
                        Request Balance Payment (${balance.toFixed(2)})
                      </button>
                    )}
                    {q.status === 'accepted' && (
                      <button
                        onClick={() => { statusMutation.mutate({ id: q.id, status: 'completed' }); setDetailQuote(null); }}
                        className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700"
                      >
                        Mark as Complete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Send Price Modal */}
        {priceModalQuote && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
                <h3 className="font-display font-semibold text-gray-900">Send Price Quote</h3>
                <button
                  onClick={() => setPriceModalQuote(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6">
                {/* Quote Summary with Design */}
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <div className="flex gap-4">
                    {/* Design image */}
                    {priceModalQuote.design_url && (
                      <a
                        href={priceModalQuote.design_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0"
                      >
                        <img
                          src={priceModalQuote.design_url}
                          alt="Customer design"
                          className="w-28 h-28 rounded-lg border border-gray-200 bg-white object-contain cursor-pointer hover:ring-2 hover:ring-blue-400 transition"
                        />
                        <span className="text-[10px] text-blue-600 mt-1 block text-center">Click to enlarge</span>
                      </a>
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{priceModalQuote.customerName || priceModalQuote.customer_name}</p>
                      <p className="text-sm text-gray-500">{priceModalQuote.customerEmail || priceModalQuote.customer_email}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-gray-600">
                        <span>Product: {priceModalQuote.productName || priceModalQuote.product_name || 'N/A'}</span>
                        <span>Qty: {priceModalQuote.quantity}</span>
                        {priceModalQuote.color && (
                          <span>Color: {priceModalQuote.color}</span>
                        )}
                      </div>
                      {priceModalQuote.date_needed && (
                        <p className="text-xs text-orange-600 font-medium mt-1">
                          Needed by: {new Date(priceModalQuote.date_needed).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* S&S Wholesale Pricing Info */}
                <SSPricingInfo productName={priceModalQuote.product_name || priceModalQuote.productName || ''} quantity={priceModalQuote.quantity} printAreas={priceModalQuote.print_areas} />

                <form onSubmit={handleSendPrice} className="space-y-4">
                  {/* Per-size pricing table */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">Price Per Garment (by size)</label>
                    <p className="text-xs text-gray-500 mb-3">Set the customer price per item for each size (includes garment + printing).</p>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-left text-gray-500">
                            <th className="px-4 py-2 font-medium">Size</th>
                            <th className="px-4 py-2 font-medium">Qty</th>
                            <th className="px-4 py-2 font-medium">Price/Item</th>
                            <th className="px-4 py-2 font-medium text-right">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {Object.entries(sizeMarkups).map(([size, price]) => {
                            const sizes = typeof priceModalQuote.sizes === 'string' ? JSON.parse(priceModalQuote.sizes as string) : priceModalQuote.sizes;
                            const qty = Number((sizes as Record<string, number>)?.[size] || 0);
                            const perItem = parseFloat(price) || 0;
                            return (
                              <tr key={size}>
                                <td className="px-4 py-2 font-medium text-gray-900">{size}</td>
                                <td className="px-4 py-2 text-gray-600">{qty}</td>
                                <td className="px-4 py-2">
                                  <div className="relative w-24">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      value={price}
                                      onChange={(e) => setSizeMarkups(prev => ({ ...prev, [size]: e.target.value }))}
                                      className="w-full pl-5 pr-2 py-1.5 rounded border border-gray-300 text-sm focus:border-red-500 focus:outline-none"
                                      placeholder="0.00"
                                    />
                                  </div>
                                </td>
                                <td className="px-4 py-2 text-right font-medium text-gray-900">${(perItem * qty).toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Additional fees */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">Additional Fees</label>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Artwork Fee</label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                          <input type="number" step="0.01" min="0" value={priceDesignFee} onChange={(e) => setPriceDesignFee(e.target.value)} className="w-full pl-5 pr-2 py-2 rounded-lg border border-gray-300 text-sm focus:border-red-500 focus:outline-none" placeholder="0" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Rush Fee</label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                          <input type="number" step="0.01" min="0" value={priceRushFee} onChange={(e) => setPriceRushFee(e.target.value)} className="w-full pl-5 pr-2 py-2 rounded-lg border border-gray-300 text-sm focus:border-red-500 focus:outline-none" placeholder="0" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Shipping</label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                          <input type="number" step="0.01" min="0" value={priceShipping} onChange={(e) => setPriceShipping(e.target.value)} className="w-full pl-5 pr-2 py-2 rounded-lg border border-gray-300 text-sm focus:border-red-500 focus:outline-none" placeholder="0" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Total Preview */}
                  {(() => {
                    const sizes = typeof priceModalQuote.sizes === 'string' ? JSON.parse(priceModalQuote.sizes as string) : priceModalQuote.sizes;
                    let garmentTotal = 0;
                    if (sizes && typeof sizes === 'object' && !Array.isArray(sizes)) {
                      Object.entries(sizes).forEach(([size, qty]) => {
                        garmentTotal += (parseFloat(sizeMarkups[size] || '0')) * Number(qty);
                      });
                    }
                    const fees = (parseFloat(priceDesignFee) || 0) + (parseFloat(priceRushFee) || 0) + (parseFloat(priceShipping) || 0);
                    const total = garmentTotal + fees;
                    return (
                      <div className="bg-gray-900 rounded-lg p-4">
                        <div className="flex justify-between text-sm text-gray-400 mb-1">
                          <span>Garments subtotal</span><span className="text-white">${garmentTotal.toFixed(2)}</span>
                        </div>
                        {(parseFloat(priceDesignFee) || 0) > 0 && <div className="flex justify-between text-sm text-gray-400"><span>Artwork fee</span><span className="text-white">${parseFloat(priceDesignFee).toFixed(2)}</span></div>}
                        {(parseFloat(priceRushFee) || 0) > 0 && <div className="flex justify-between text-sm text-gray-400"><span>Rush fee</span><span className="text-white">${parseFloat(priceRushFee).toFixed(2)}</span></div>}
                        {(parseFloat(priceShipping) || 0) > 0 && <div className="flex justify-between text-sm text-gray-400"><span>Shipping</span><span className="text-white">${parseFloat(priceShipping).toFixed(2)}</span></div>}
                        <div className="border-t border-gray-700 mt-2 pt-2 flex justify-between">
                          <span className="text-sm font-bold text-white">Total</span>
                          <span className="text-xl font-bold text-white">${total.toFixed(2)}</span>
                        </div>
                        <div className="text-center text-sm text-gray-400 mt-1">50% deposit: ${(total * 0.5).toFixed(2)}</div>
                      </div>
                    );
                  })()}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Personal Message (optional)</label>
                    <textarea
                      value={priceMessage}
                      onChange={(e) => setPriceMessage(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/20 focus:outline-none transition resize-none"
                      rows={3}
                      placeholder="Add a personal note to the customer..."
                    />
                  </div>

                  {sendPriceMutation.isError && (
                    <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3">
                      Failed to send price quote. Please try again.
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setPriceModalQuote(null)}
                      className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={sendPriceMutation.isPending || Object.values(sizeMarkups).every(v => !v || parseFloat(v) === 0)}
                      className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {sendPriceMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      Send Quote to Customer
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function StatCard({
  icon: Icon,
  value,
  label,
  loading,
}: {
  icon: typeof ClipboardList;
  value: number;
  label: string;
  loading: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-5">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="p-1.5 sm:p-2 rounded-lg bg-red-50 flex-shrink-0">
          <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
        </div>
        <div className="min-w-0">
          <p className="text-xl sm:text-2xl font-display font-bold text-gray-900 leading-tight">
            {loading ? <Loader2 className="w-5 h-5 animate-spin text-gray-300" /> : value}
          </p>
          <p className="text-xs sm:text-sm text-gray-500 truncate">{label}</p>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
        STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-800'
      }`}
    >
      {status}
    </span>
  );
}
