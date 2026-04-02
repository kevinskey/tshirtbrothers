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
  type Quote,
  type Product,
  type Category,
} from '@/lib/api';

type Section = 'dashboard' | 'quotes' | 'products' | 'categories' | 'settings';
type QuoteFilter = 'all' | 'pending' | 'approved' | 'completed' | 'rejected';

const NAV_ITEMS: { key: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'quotes', label: 'Quotes', icon: FileText },
  { key: 'products', label: 'Products', icon: Package },
  { key: 'categories', label: 'Categories', icon: FolderTree },
  { key: 'settings', label: 'Settings', icon: Settings },
];

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  completed: 'bg-blue-100 text-blue-800',
  rejected: 'bg-red-100 text-red-800',
};

export default function AdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<Section>('dashboard');
  const [quoteFilter, setQuoteFilter] = useState<QuoteFilter>('all');
  const [productSearch, setProductSearch] = useState('');
  const [openActionMenu, setOpenActionMenu] = useState<string | null>(null);

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

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-gray-900 text-white flex flex-col z-30">
        <div className="p-6 border-b border-gray-800">
          <h1 className="font-display text-xl font-bold tracking-tight">
            <span className="text-red-500">TSB</span> Admin
          </h1>
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
                          {new Date(q.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-3 text-gray-900">{q.customerName}</td>
                        <td className="px-6 py-3 text-gray-600">{q.productName}</td>
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
              {(['all', 'pending', 'approved', 'completed'] as QuoteFilter[]).map((f) => (
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
                          {new Date(q.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-3 text-gray-900">{q.customerName}</td>
                        <td className="px-6 py-3 text-gray-600">{q.customerEmail}</td>
                        <td className="px-6 py-3 text-gray-600">{q.productName}</td>
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
                            <div className="absolute right-6 top-10 z-20 bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-36">
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

        {/* Settings Section */}
        {activeSection === 'settings' && (
          <div>
            <h2 className="text-2xl font-display font-bold text-gray-900 mb-6">Settings</h2>
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <p className="text-gray-500 text-sm">Settings panel coming soon.</p>
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
