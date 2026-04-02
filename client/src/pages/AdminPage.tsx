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
} from '@/lib/api';

type Section = 'dashboard' | 'quotes' | 'products' | 'categories' | 'designs' | 'customers' | 'orders' | 'settings';
type QuoteFilter = 'all' | 'pending' | 'quoted' | 'approved' | 'accepted' | 'completed' | 'rejected';
type OrderFilter = 'all' | 'pending' | 'approved' | 'completed' | 'rejected';

const NAV_ITEMS: { key: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'quotes', label: 'Quotes', icon: FileText },
  { key: 'orders', label: 'Orders', icon: ShoppingBag },
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
};

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
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);

  // New section state
  const [designSearch, setDesignSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [orderFilter, setOrderFilter] = useState<OrderFilter>('all');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<'business' | 'notifications' | 'payment'>('business');
  const [settingsForm, setSettingsForm] = useState<Record<string, string>>({});
  const [settingsSaving, setSettingsSaving] = useState(false);

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
    queryKey: ['admin', 'products', productSearch],
    queryFn: () => fetchAdminProducts(productSearch),
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

  const deleteDesignMutation = useMutation({
    mutationFn: deleteDesign,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'designs'] });
    },
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
  const products = productsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const designs = designsQuery.data ?? [];
  const customers = customersQuery.data ?? [];
  const orders = ordersQuery.data ?? [];
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
                onChange={(e) => setProductSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-500/20 focus:outline-none transition"
              />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-500">
                      <th className="px-6 py-3 font-medium">Name</th>
                      <th className="px-6 py-3 font-medium">Brand</th>
                      <th className="px-6 py-3 font-medium">Category</th>
                      <th className="px-6 py-3 font-medium">Price</th>
                      <th className="px-6 py-3 font-medium">Colors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {products.map((p: Product) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-gray-900 font-medium">{p.name}</td>
                        <td className="px-6 py-3 text-gray-600">{p.brand}</td>
                        <td className="px-6 py-3 text-gray-600">{p.category}</td>
                        <td className="px-6 py-3 text-gray-600">
                          ${typeof p.price === 'number' ? p.price.toFixed(2) : p.price}
                        </td>
                        <td className="px-6 py-3 text-gray-600">{p.colors?.length ?? 0}</td>
                      </tr>
                    ))}
                    {products.length === 0 && !productsQuery.isLoading && (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                          No products found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
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
                    <div className="aspect-video bg-gray-100 relative">
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
                          <Palette className="w-10 h-10 text-gray-300" />
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
