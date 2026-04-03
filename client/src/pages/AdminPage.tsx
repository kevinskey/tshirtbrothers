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
  createInvoice,
  sendInvoice,
  deleteInvoice,
  recordPayment,
} from '@/lib/api';

type Section = 'dashboard' | 'quotes' | 'products' | 'categories' | 'designs' | 'customers' | 'orders' | 'invoices' | 'settings';
type QuoteFilter = 'all' | 'pending' | 'quoted' | 'approved' | 'accepted' | 'completed' | 'rejected';
type OrderFilter = 'all' | 'pending' | 'approved' | 'completed' | 'rejected';

const NAV_ITEMS: { key: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'quotes', label: 'Quotes', icon: FileText },
  { key: 'orders', label: 'Orders', icon: ShoppingBag },
  { key: 'invoices', label: 'Invoices', icon: Receipt },
  { key: 'designs', label: 'Designs', icon: Palette },
  { key: 'customers', label: 'Customers', icon: Users },
  { key: 'products', label: 'Products', icon: Package },
  { key: 'categories', label: 'Categories', icon: FolderTree },
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

export default function AdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<Section>('dashboard');
  const [quoteFilter, setQuoteFilter] = useState<QuoteFilter>('all');
  const [productSearch, setProductSearch] = useState('');
  const [productPage, setProductPage] = useState(1);
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);

  // New section state
  const [designSearch, setDesignSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [orderFilter, setOrderFilter] = useState<OrderFilter>('all');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<'business' | 'notifications' | 'payment'>('business');
  const [settingsForm, setSettingsForm] = useState<Record<string, string>>({});
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Invoice state
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceFilter>('all');
  const [invoiceView, setInvoiceView] = useState<InvoiceView>('list');
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
  const [recordPaymentInvoice, setRecordPaymentInvoice] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('card');

  // Send Price modal state
  const [priceModalQuote, setPriceModalQuote] = useState<Quote | null>(null);
  const [, setPriceBase] = useState('');
  const [, setPricePrinting] = useState('');
  const [priceDesignFee, setPriceDesignFee] = useState('0');
  const [priceRushFee, setPriceRushFee] = useState('0');
  const [priceShipping, setPriceShipping] = useState('0');
  const [priceMessage, setPriceMessage] = useState('');
  const [sizeMarkups, setSizeMarkups] = useState<Record<string, string>>({});

  // Category form state
  const [catName, setCatName] = useState('');
  const [catParent, setCatParent] = useState('');
  const [catDesc, setCatDesc] = useState('');

  // Auth check
  useEffect(() => {
    const token = localStorage.getItem('tsb_token');
    if (!token) {
      navigate('/auth');
    }
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

  const quotesQuery = useQuery({
    queryKey: ['admin', 'quotes', quoteFilter],
    queryFn: () => fetchQuotes(quoteFilter),
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
    enabled: activeSection === 'customers',
  });

  const customerDetailQuery = useQuery({
    queryKey: ['admin', 'customer', selectedCustomerId],
    queryFn: () => fetchCustomer(selectedCustomerId!),
    enabled: !!selectedCustomerId,
  });

  const ordersQuery = useQuery({
    queryKey: ['admin', 'orders', orderFilter],
    queryFn: () => fetchOrders(orderFilter),
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
      queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      setOpenActionMenu(null);
    },
  });

  const deleteDesignMutation = useMutation({
    mutationFn: deleteDesign,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'customer-designs'] });
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
      items: [{ description: '', quantity: 1, unit_price: 0 }],
      tax: '0', shipping: '0', discount: '0', notes: '', due_date: '',
    });
    setPreviewInvoice(null);
    setInvoiceProductSearch('');
  }

  function calcInvoiceSubtotal() {
    return invoiceForm.items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);
  }

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

  function addInvoiceItem(desc = '', qty = 1, price = 0) {
    setInvoiceForm(prev => ({
      ...prev,
      items: [...prev.items, { description: desc, quantity: qty, unit_price: price }],
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
    createInvoiceMutation.mutate(data);
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

  function handleSendPreviewedInvoice() {
    if (!previewInvoice) return;
    createInvoiceMutation.mutate(previewInvoice, {
      onSuccess: (created) => {
        sendInvoiceMutation.mutate(created.id);
        setPreviewInvoice(null);
      },
    });
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
  const customerDetail = customerDetailQuery.data ?? null;

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-gray-900 text-white flex flex-col z-30">
        <div className="p-6 border-b border-gray-800 flex items-center gap-3">
          <img src="https://tshirtbrothers.atl1.digitaloceanspaces.com/tsb-logo.png" alt="TSB" className="h-8 w-8 object-contain" />
          <h1 className="font-display text-xl font-bold tracking-tight">Admin</h1>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveSection(key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeSection === key
                  ? 'bg-red-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
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
      <main className="ml-64 flex-1 p-8">
        {/* Dashboard */}
        {activeSection === 'dashboard' && (
          <div>
            <h2 className="text-2xl font-display font-bold text-gray-900 mb-6">Dashboard</h2>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
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
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="font-display font-semibold text-gray-900">Recent Quotes</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-500">
                      <th className="px-6 py-3 font-medium">Date</th>
                      <th className="px-6 py-3 font-medium">Customer</th>
                      <th className="px-6 py-3 font-medium">Product</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {quotes.slice(0, 10).map((q: Quote) => (
                      <tr key={q.id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-gray-600">
                          {new Date(q.created_at || q.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-3 text-gray-900">{q.customer_name || q.customerName}</td>
                        <td className="px-6 py-3 text-gray-600">{q.product_name || q.productName}</td>
                        <td className="px-6 py-3">
                          <StatusBadge status={q.status} />
                        </td>
                      </tr>
                    ))}
                    {quotes.length === 0 && !quotesQuery.isLoading && (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-gray-400">
                          No quotes yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Quotes Section */}
        {activeSection === 'quotes' && (
          <div>
            <h2 className="text-2xl font-display font-bold text-gray-900 mb-6">Quotes</h2>

            {/* Filter Tabs */}
            <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
              {(['all', 'pending', 'quoted', 'accepted', 'approved', 'completed'] as QuoteFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setQuoteFilter(f)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                    quoteFilter === f
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
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
                      <tr key={q.id} className="hover:bg-gray-50">
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
                        <td className="px-6 py-3 relative">
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
                              {['approved', 'completed', 'rejected']
                                .filter((s) => s !== q.status)
                                .map((s) => (
                                  <button
                                    key={s}
                                    onClick={() =>
                                      statusMutation.mutate({ id: q.id, status: s })
                                    }
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 capitalize"
                                  >
                                    {s === 'approved' ? 'Approve' : s === 'completed' ? 'Complete' : 'Reject'}
                                  </button>
                                ))}
                              <div className="border-t border-gray-100 mt-1 pt-1">
                                <button
                                  onClick={() => {
                                    if (confirm('Delete this quote? This cannot be undone.')) {
                                      deleteQuoteMutation.mutate(String(q.id));
                                    }
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
          </div>
        )}

        {/* Products Section */}
        {activeSection === 'products' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-display font-bold text-gray-900">Products</h2>
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

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
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
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
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
                      {(d.product_image || d.thumbnail || d.mockup_url) ? (
                        <img
                          src={d.product_image || d.thumbnail || d.mockup_url || ''}
                          alt={d.name}
                          className="w-full h-full object-contain p-2"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Palette className="w-10 h-10 text-gray-300" />
                        </div>
                      )}
                      {/* Render design elements on top */}
                      {Array.isArray(d.elements) && d.elements.length > 0 && (
                        <div className="absolute inset-0">
                          {(d.elements as { id: string; type: string; x: number; y: number; width: number; content: string; fontSize?: number; color?: string; fontFamily?: string; rotation?: number }[]).map(el => (
                            <div key={el.id} className="absolute" style={{ left: `${el.x}%`, top: `${el.y}%`, width: `${el.width}%`, transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined }}>
                              {el.type === 'image' ? (
                                <img src={el.content} alt="" className="w-full object-contain drop-shadow-md" />
                              ) : (
                                <span className="block font-bold leading-tight drop-shadow-md" style={{ fontSize: `${(el.fontSize ?? 24) * 0.25}px`, color: el.color ?? '#fff', fontFamily: el.fontFamily ?? 'Inter' }}>{el.content}</span>
                              )}
                            </div>
                          ))}
                          <div className="absolute top-1 right-1 bg-orange-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded">DESIGNED</div>
                        </div>
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
            <h2 className="text-2xl font-display font-bold text-gray-900 mb-6">Customers</h2>

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

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-500">
                      <th className="px-6 py-3 font-medium">Name</th>
                      <th className="px-6 py-3 font-medium">Email</th>
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
                        <td className="px-6 py-3 text-gray-600">{c.design_count}</td>
                        <td className="px-6 py-3 text-gray-600">{c.quote_count}</td>
                        <td className="px-6 py-3 text-gray-600">
                          {new Date(c.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-3">
                          <button
                            onClick={() => setSelectedCustomerId(c.id)}
                            className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <Eye className="w-3 h-3" />
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                    {customers.length === 0 && !customersQuery.isLoading && (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                          No customers found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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
                      <div>
                        <h4 className="text-lg font-semibold text-gray-900">{customerDetail.name}</h4>
                        <p className="text-sm text-gray-500">{customerDetail.email}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          Joined {new Date(customerDetail.created_at).toLocaleDateString()}
                        </p>
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
          </div>
        )}

        {/* Orders Section */}
        {activeSection === 'orders' && (
          <div>
            <h2 className="text-2xl font-display font-bold text-gray-900 mb-6">Orders</h2>

            {/* Filter Tabs */}
            <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
              {(['all', 'pending', 'approved', 'completed', 'rejected'] as OrderFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setOrderFilter(f)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                    orderFilter === f
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-500">
                      <th className="px-6 py-3 font-medium">Order #</th>
                      <th className="px-6 py-3 font-medium">Date</th>
                      <th className="px-6 py-3 font-medium">Customer</th>
                      <th className="px-6 py-3 font-medium">Email</th>
                      <th className="px-6 py-3 font-medium">Phone</th>
                      <th className="px-6 py-3 font-medium">Product</th>
                      <th className="px-6 py-3 font-medium">Qty</th>
                      <th className="px-6 py-3 font-medium">Price</th>
                      <th className="px-6 py-3 font-medium">Status</th>
                      <th className="px-6 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {orders.map((o: Order) => (
                      <tr key={o.id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-gray-900 font-medium">#{o.id.slice(0, 8)}</td>
                        <td className="px-6 py-3 text-gray-600">
                          {new Date(o.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-3 text-gray-900">{o.customer_name}</td>
                        <td className="px-6 py-3 text-gray-600">{o.customer_email}</td>
                        <td className="px-6 py-3 text-gray-600">{o.customer_phone || '--'}</td>
                        <td className="px-6 py-3 text-gray-600">{o.product_name}</td>
                        <td className="px-6 py-3 text-gray-600">{o.quantity}</td>
                        <td className="px-6 py-3 text-gray-600">
                          {o.estimated_price != null
                            ? `$${Number(o.estimated_price).toFixed(2)}`
                            : '--'}
                        </td>
                        <td className="px-6 py-3">
                          <StatusBadge status={o.status} />
                        </td>
                        <td className="px-6 py-3 relative">
                          <button
                            onClick={() =>
                              setOpenActionMenu(openActionMenu === o.id ? null : o.id)
                            }
                            className="flex items-center gap-1 text-gray-500 hover:text-gray-700 text-sm"
                          >
                            Actions <ChevronDown className="w-3 h-3" />
                          </button>
                          {openActionMenu === o.id && (
                            <div className="absolute right-6 top-10 z-20 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-36">
                              {['approved', 'completed', 'rejected']
                                .filter((s) => s !== o.status)
                                .map((s) => (
                                  <button
                                    key={s}
                                    onClick={() =>
                                      statusMutation.mutate({ id: o.id, status: s })
                                    }
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 capitalize"
                                  >
                                    {s === 'approved' ? 'Approve' : s === 'completed' ? 'Complete' : 'Reject'}
                                  </button>
                                ))}
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
          </div>
        )}

        {/* Invoices Section */}
        {activeSection === 'invoices' && (
          <div>
            {invoiceView === 'list' && (
              <>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-display font-bold text-gray-900">Invoices</h2>
                  <button
                    onClick={() => { resetInvoiceForm(); setInvoiceView('create'); }}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    New Invoice
                  </button>
                </div>

                {/* Filter Tabs */}
                <div className="flex gap-2 mb-6">
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
                  <div className="overflow-x-auto">
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
                              <div className="flex items-center gap-2">
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
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* Create Invoice Form */}
            {invoiceView === 'create' && (
              <div>
                <div className="flex items-center gap-4 mb-6">
                  <button onClick={() => { setInvoiceView('list'); resetInvoiceForm(); }} className="text-gray-400 hover:text-gray-600"><ArrowLeft className="w-5 h-5" /></button>
                  <h2 className="text-2xl font-display font-bold text-gray-900">New Invoice</h2>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
                  {/* Customer Info */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Customer Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Name *</label>
                        <input type="text" value={invoiceForm.customer_name} onChange={e => setInvoiceForm(p => ({ ...p, customer_name: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" placeholder="Customer name" />
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
                    {invoiceProductSearch.length >= 2 && invoiceSearchProducts.length > 0 && (
                      <div className="mt-2 border border-gray-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-gray-100">
                        {invoiceSearchProducts.slice(0, 10).map((p: Product) => (
                          <button
                            key={p.id}
                            onClick={() => { addInvoiceItem(p.name, 1, p.price || 0); setInvoiceProductSearch(''); }}
                            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm flex justify-between items-center"
                          >
                            <span className="text-gray-900">{p.name}</span>
                            <span className="text-gray-500">${(p.price || 0).toFixed(2)}</span>
                          </button>
                        ))}
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
                            <th className="px-4 py-2 font-medium">Description</th>
                            <th className="px-4 py-2 font-medium w-24">Qty</th>
                            <th className="px-4 py-2 font-medium w-32">Unit Price</th>
                            <th className="px-4 py-2 font-medium w-28 text-right">Total</th>
                            <th className="px-4 py-2 w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {invoiceForm.items.map((item, idx) => (
                            <tr key={idx}>
                              <td className="px-4 py-2">
                                <input type="text" value={item.description} onChange={e => handleInvoiceItemChange(idx, 'description', e.target.value)} className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-red-500" placeholder="Item description" />
                              </td>
                              <td className="px-4 py-2">
                                <input type="number" min="1" value={item.quantity} onChange={e => handleInvoiceItemChange(idx, 'quantity', e.target.value)} className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-red-500" />
                              </td>
                              <td className="px-4 py-2">
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                                  <input type="number" step="0.01" min="0" value={item.unit_price} onChange={e => handleInvoiceItemChange(idx, 'unit_price', e.target.value)} className="w-full pl-5 pr-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-red-500" />
                                </div>
                              </td>
                              <td className="px-4 py-2 text-right font-medium text-gray-900">
                                ${(item.quantity * item.unit_price).toFixed(2)}
                              </td>
                              <td className="px-4 py-2">
                                {invoiceForm.items.length > 1 && (
                                  <button onClick={() => removeInvoiceItem(idx)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                                )}
                              </td>
                            </tr>
                          ))}
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
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">Tax</span>
                        <div className="relative w-28">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                          <input type="number" step="0.01" min="0" value={invoiceForm.tax} onChange={e => setInvoiceForm(p => ({ ...p, tax: e.target.value }))} className="w-full pl-5 pr-2 py-1.5 border border-gray-200 rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-red-500" />
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">Shipping</span>
                        <div className="relative w-28">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                          <input type="number" step="0.01" min="0" value={invoiceForm.shipping} onChange={e => setInvoiceForm(p => ({ ...p, shipping: e.target.value }))} className="w-full pl-5 pr-2 py-1.5 border border-gray-200 rounded text-sm text-right focus:outline-none focus:ring-1 focus:ring-red-500" />
                        </div>
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
                      disabled={!invoiceForm.customer_name || !invoiceForm.customer_email || createInvoiceMutation.isPending}
                      className="px-6 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
                    >
                      {createInvoiceMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> : null}
                      Save as Draft
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
                {/* Quote Summary */}
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <p className="text-sm font-medium text-gray-900">{priceModalQuote.customerName || priceModalQuote.customer_name}</p>
                  <p className="text-sm text-gray-500">{priceModalQuote.customerEmail || priceModalQuote.customer_email}</p>
                  <div className="flex gap-4 mt-2 text-sm text-gray-600">
                    <span>Product: {priceModalQuote.productName || priceModalQuote.product_name || 'N/A'}</span>
                    <span>Qty: {priceModalQuote.quantity}</span>
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
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="p-2 rounded-lg bg-red-50">
          <Icon className="w-5 h-5 text-red-600" />
        </div>
      </div>
      <p className="text-3xl font-display font-bold text-gray-900">
        {loading ? <Loader2 className="w-6 h-6 animate-spin text-gray-300" /> : value}
      </p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
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
