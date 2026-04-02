import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  brand: string;
  styleNumber: string;
  category: string;
  colors: string[];
  sizeRange: string;
  imageUrl?: string;
}

interface ProductsResponse {
  products: Product[];
  totalPages: number;
  currentPage: number;
  totalProducts: number;
}

const SAMPLE_PRODUCTS: Product[] = [
  {
    id: '1',
    name: 'Ultra Cotton Tee',
    brand: 'Gildan',
    styleNumber: 'G200',
    category: 'T-Shirts',
    colors: ['#000000', '#FFFFFF', '#1E3A5F', '#8B0000', '#2F4F2F'],
    sizeRange: 'S - 5XL',
  },
  {
    id: '2',
    name: 'Heavy Cotton Tee',
    brand: 'Gildan',
    styleNumber: 'G500',
    category: 'T-Shirts',
    colors: ['#000000', '#FFFFFF', '#C0C0C0', '#8B0000'],
    sizeRange: 'S - 5XL',
  },
  {
    id: '3',
    name: 'DryBlend Tee',
    brand: 'Gildan',
    styleNumber: 'G800',
    category: 'T-Shirts',
    colors: ['#000000', '#FFFFFF', '#1E3A5F', '#FFA500'],
    sizeRange: 'S - 3XL',
  },
  {
    id: '4',
    name: 'ComfortSoft Tee',
    brand: 'Hanes',
    styleNumber: 'H5250',
    category: 'T-Shirts',
    colors: ['#000000', '#FFFFFF', '#808080', '#4169E1', '#8B0000'],
    sizeRange: 'S - 4XL',
  },
  {
    id: '5',
    name: 'Beefy-T',
    brand: 'Hanes',
    styleNumber: 'H5180',
    category: 'T-Shirts',
    colors: ['#000000', '#FFFFFF', '#2F4F2F', '#FFA500'],
    sizeRange: 'S - 6XL',
  },
  {
    id: '6',
    name: 'CVC Crew',
    brand: 'Next Level',
    styleNumber: 'NL6210',
    category: 'T-Shirts',
    colors: ['#1C1C1C', '#F5F5F5', '#4682B4', '#556B2F'],
    sizeRange: 'XS - 3XL',
  },
  {
    id: '7',
    name: 'Cotton Crew',
    brand: 'Next Level',
    styleNumber: 'NL3600',
    category: 'T-Shirts',
    colors: ['#000000', '#FFFFFF', '#DC143C', '#1E3A5F', '#FFD700'],
    sizeRange: 'XS - 3XL',
  },
  {
    id: '8',
    name: 'Heavy Blend Hoodie',
    brand: 'Gildan',
    styleNumber: 'G185',
    category: 'Hoodies',
    colors: ['#000000', '#1E3A5F', '#808080', '#8B0000'],
    sizeRange: 'S - 5XL',
  },
  {
    id: '9',
    name: 'EcoSmart Hoodie',
    brand: 'Hanes',
    styleNumber: 'HP170',
    category: 'Hoodies',
    colors: ['#000000', '#FFFFFF', '#1E3A5F', '#C0C0C0'],
    sizeRange: 'S - 3XL',
  },
  {
    id: '10',
    name: 'DryBlend Polo',
    brand: 'Gildan',
    styleNumber: 'G948',
    category: 'Polos',
    colors: ['#000000', '#FFFFFF', '#1E3A5F', '#8B0000'],
    sizeRange: 'S - 3XL',
  },
  {
    id: '11',
    name: 'SpotShield Polo',
    brand: 'Hanes',
    styleNumber: 'H054X',
    category: 'Polos',
    colors: ['#000000', '#FFFFFF', '#4169E1'],
    sizeRange: 'S - 4XL',
  },
  {
    id: '12',
    name: 'Softstyle Long Sleeve',
    brand: 'Gildan',
    styleNumber: 'G644',
    category: 'Long Sleeves',
    colors: ['#000000', '#FFFFFF', '#1E3A5F', '#808080', '#8B0000'],
    sizeRange: 'S - 3XL',
  },
];

const ALL_BRANDS = [...new Set(SAMPLE_PRODUCTS.map((p) => p.brand))];
const ALL_CATEGORIES = [...new Set(SAMPLE_PRODUCTS.map((p) => p.category))];

async function fetchCatalog(params: {
  search: string;
  brand: string;
  category: string;
  page: number;
}): Promise<ProductsResponse> {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.brand) query.set('brand', params.brand);
  if (params.category) query.set('category', params.category);
  query.set('page', String(params.page));

  const res = await fetch(`/api/products?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch products');
  return res.json() as Promise<ProductsResponse>;
}

function filterSampleProducts(
  search: string,
  brand: string,
  category: string,
): Product[] {
  return SAMPLE_PRODUCTS.filter((p) => {
    const matchSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.brand.toLowerCase().includes(search.toLowerCase()) ||
      p.styleNumber.toLowerCase().includes(search.toLowerCase());
    const matchBrand = !brand || p.brand === brand;
    const matchCategory = !category || p.category === category;
    return matchSearch && matchBrand && matchCategory;
  });
}

export default function ShopPage() {
  const [search, setSearch] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);

  const { data, isError } = useQuery<ProductsResponse>({
    queryKey: ['products', search, brand, category, page],
    queryFn: () => fetchCatalog({ search, brand, category, page }),
    retry: false,
  });

  // Fall back to sample data if API is unavailable
  const useFallback = isError || !data;
  const filtered = useFallback
    ? filterSampleProducts(search, brand, category)
    : [];
  const products = useFallback ? filtered : data.products;
  const totalPages = useFallback ? 1 : data.totalPages;
  const currentPage = useFallback ? 1 : data.currentPage;
  const totalProducts = useFallback ? filtered.length : data.totalProducts;

  return (
    <Layout>
      <section className="py-12">
        <div className="container mx-auto px-4">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="font-display text-4xl md:text-5xl font-bold">
              TSHIRT Brothers Catalogue
            </h1>
            <p className="mt-3 text-gray-500 max-w-xl mx-auto">
              Browse our complete catalog with thousands of products ready for
              custom printing.
            </p>
          </div>

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-8">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
              />
            </div>

            {/* Brand filter */}
            <select
              value={brand}
              onChange={(e) => {
                setBrand(e.target.value);
                setPage(1);
              }}
              className="border border-gray-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="">All Brands</option>
              {ALL_BRANDS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>

            {/* Category filter */}
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              className="border border-gray-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="">All Categories</option>
              {ALL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {/* Count */}
            <span className="text-xs text-gray-500 whitespace-nowrap self-center">
              Showing {products.length} of {totalProducts} products
            </span>
          </div>

          {/* Product Grid */}
          {products.length === 0 ? (
            <div className="text-center py-20 text-gray-400">
              <p className="text-lg font-medium">No products found</p>
              <p className="text-sm mt-1">
                Try adjusting your search or filters.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="border border-gray-100 rounded-xl overflow-hidden hover:shadow-lg transition-shadow group"
                >
                  {/* Image placeholder */}
                  <div className="bg-gray-100 aspect-square flex items-center justify-center">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-gray-400 text-sm font-medium">
                        {product.category}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">
                      {product.brand}
                    </span>
                    <h3 className="font-display font-semibold text-sm mt-0.5 leading-tight">
                      {product.name}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {product.styleNumber} &middot; {product.colors.length}{' '}
                      colors &middot; {product.sizeRange}
                    </p>

                    {/* Color dots */}
                    <div className="flex items-center gap-1.5 mt-3">
                      {product.colors.slice(0, 5).map((color, i) => (
                        <span
                          key={i}
                          className="w-4 h-4 rounded-full border border-gray-200"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                      {product.colors.length > 5 && (
                        <span className="text-[10px] text-gray-400">
                          +{product.colors.length - 5}
                        </span>
                      )}
                    </div>

                    {/* CTA */}
                    <Link
                      to={`/shop/${product.id}`}
                      className="mt-4 block w-full bg-gray-900 hover:bg-gray-800 text-white text-center rounded-lg text-xs font-medium py-2.5 transition-colors"
                    >
                      View Details
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-12">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <span className="text-sm text-gray-500">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}
