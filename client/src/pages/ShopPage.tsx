import { useState, useRef, useCallback, useEffect } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { Search, Loader2, X } from 'lucide-react';

interface ColorInfo {
  name: string;
  hex: string;
  image?: string;
}

interface Product {
  id: string;
  ss_id?: string;
  name: string;
  brand: string;
  styleNumber?: string;
  style_number?: string;
  category: string;
  colors: (string | ColorInfo)[];
  sizes?: string[];
  sizeRange?: string;
  imageUrl?: string;
  image_url?: string;
  back_image_url?: string;
  base_price?: number | string;
  specifications?: { description?: string; material?: string; weight?: string };
  price_breaks?: { qty?: number; minQty?: number; price?: number }[];
}

interface ProductsResponse {
  products: Product[];
  totalPages: number;
  total: number;
  page: number;
  currentPage?: number;
  totalProducts?: number;
}

// Normalize API product to display format
function getProductImage(p: Product): string | undefined {
  return p.imageUrl || p.image_url || undefined;
}
function getProductStyleNumber(p: Product): string {
  return p.styleNumber || p.style_number || '';
}
function getProductColors(p: Product): { hex: string; name: string }[] {
  if (!p.colors || p.colors.length === 0) return [];
  return p.colors.map(c => {
    if (typeof c === 'string') return { hex: c, name: c };
    return { hex: c.hex || '#ccc', name: c.name || '' };
  });
}
function getProductSizeRange(p: Product): string {
  if (p.sizeRange) return p.sizeRange;
  if (p.sizes && p.sizes.length > 0) {
    return `${p.sizes[0]}-${p.sizes[p.sizes.length - 1]}`;
  }
  return '';
}
function getProductId(p: Product): string {
  // Prefer ss_id — both /quote and /design fetch by ss_id (S&S style id like
  // "G500"), and the DB serial id won't resolve there. Fall back to id only
  // for sample/fallback rows that have no ss_id.
  return (p.ss_id || p.id || '') as string;
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

  query.set('limit', '48');
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
      (p.styleNumber || p.style_number || '').toLowerCase().includes(search.toLowerCase());
    const matchBrand = !brand || p.brand === brand;
    const matchCategory = !category || p.category === category;
    return matchSearch && matchBrand && matchCategory;
  });
}

export default function ShopPage() {
  const [searchParams] = useSearchParams();
  const urlCategory = searchParams.get('category') || '';
  const urlBrand = searchParams.get('brand') || '';
  const urlSearch = searchParams.get('search') || '';
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [search, setSearch] = useState(urlSearch);
  const [brand, setBrand] = useState(urlBrand);
  const [category, setCategory] = useState(urlCategory);

  // Sync filters from URL when links are clicked
  useEffect(() => {
    setCategory(urlCategory);
    setBrand(urlBrand);
    setSearch(urlSearch);
  }, [urlCategory, urlBrand, urlSearch]);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Fetch filter options from API
  const { data: filtersData } = useQuery({
    queryKey: ['product-filters'],
    queryFn: async () => {
      const res = await fetch('/api/products/filters');
      if (!res.ok) return { brands: [] as string[], categories: [] as string[] };
      return res.json() as Promise<{ brands: string[]; categories: string[] }>;
    },
    staleTime: 1000 * 60 * 30, // cache 30 min
  });
  const apiBrands = filtersData?.brands ?? [];
  const apiCategories = filtersData?.categories ?? [];

  const {
    data,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<ProductsResponse>({
    queryKey: ['products', search, brand, category],
    queryFn: ({ pageParam = 1 }) => fetchCatalog({ search, brand, category, page: pageParam as number }),
    getNextPageParam: (lastPage) => {
      const currentPage = lastPage.page || lastPage.currentPage || 1;
      const totalPages = lastPage.totalPages || 1;
      return currentPage < totalPages ? currentPage + 1 : undefined;
    },
    initialPageParam: 1,
    retry: false,
  });

  // Infinite scroll observer
  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    const [entry] = entries;
    if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleObserver, { threshold: 0.1 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleObserver]);

  // Flatten all pages into one product list
  const allProducts = data?.pages.flatMap(p => p.products) ?? [];
  const useFallback = isError || allProducts.length === 0;
  const filtered = useFallback ? filterSampleProducts(search, brand, category) : [];
  const products = useFallback ? filtered : allProducts;
  const totalProducts = data?.pages[0]?.total || data?.pages[0]?.totalProducts || products.length;

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
                  // filters reset handled by queryKey change
                }}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
              />
            </div>

            {/* Brand filter */}
            <select
              value={brand}
              onChange={(e) => {
                setBrand(e.target.value);
              }}
              className="border border-gray-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="">All Brands</option>
              {(apiBrands.length > 0 ? apiBrands : ALL_BRANDS).map((b) => (
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
              }}
              className="border border-gray-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
            >
              <option value="">All Categories</option>
              {(apiCategories.length > 0 ? apiCategories : ALL_CATEGORIES).map((c) => (
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
              {products.map((product) => {
                const imgUrl = getProductImage(product);
                const colors = getProductColors(product);
                const styleNum = getProductStyleNumber(product);
                const sizeRange = getProductSizeRange(product);
                const pid = getProductId(product);
                return (
                <button
                  key={pid}
                  type="button"
                  onClick={() => setDetailProduct(product)}
                  className="text-left border border-gray-100 rounded-xl overflow-hidden hover:shadow-lg transition-shadow group cursor-pointer bg-white"
                >
                  {/* Image */}
                  <div className="bg-gray-100 aspect-square flex items-center justify-center overflow-hidden">
                    {imgUrl ? (
                      <img
                        src={imgUrl}
                        alt={product.name}
                        className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
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
                      {styleNum}{styleNum && colors.length ? ' · ' : ''}{colors.length > 0 ? `${colors.length} colors` : ''}{sizeRange ? ` · ${sizeRange}` : ''}
                    </p>

                    {/* Your Price — wholesale doubled, rounded to two decimals.
                        Hidden when S&S didn't return a price (a few discontinued
                        styles return 0). */}
                    {(() => {
                      const wholesale = Number(product.base_price || 0);
                      if (!(wholesale > 0)) return null;
                      return (
                        <p className="mt-2 text-sm">
                          <span className="text-gray-500">Your price: </span>
                          <span className="font-semibold text-gray-900">${(wholesale * 2).toFixed(2)}</span>
                        </p>
                      );
                    })()}

                    {/* Color dots */}
                    {colors.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-3">
                      {colors.slice(0, 5).map((color, i) => (
                        <span
                          key={i}
                          className="w-4 h-4 rounded-full border border-gray-200"
                          style={{ backgroundColor: color.hex || '#ccc' }}
                          title={color.name}
                        />
                      ))}
                      {colors.length > 5 && (
                        <span className="text-[10px] text-gray-400">
                          +{colors.length - 5}
                        </span>
                      )}
                    </div>
                    )}
                  </div>
                </button>
                );
              })}
            </div>
          )}

          {/* Infinite scroll sentinel */}
          <div ref={loadMoreRef} className="flex items-center justify-center py-12">
            {isFetchingNextPage ? (
              <div className="flex items-center gap-2 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading more products...</span>
              </div>
            ) : hasNextPage ? (
              <span className="text-sm text-gray-400">Scroll for more</span>
            ) : products.length > 0 ? (
              <span className="text-sm text-gray-400">Showing all {totalProducts} products</span>
            ) : null}
          </div>
        </div>
      </section>

      {/* Product detail modal */}
      {detailProduct && (() => {
        const p = detailProduct;
        const img = getProductImage(p);
        const colors = getProductColors(p);
        const sizes = Array.isArray(p.sizes) ? p.sizes : [];
        const description = (p.specifications?.description || '').trim();
        const priceBreaks = Array.isArray(p.price_breaks) ? p.price_breaks : [];
        const styleNum = getProductStyleNumber(p);
        return (
          <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
            onClick={() => setDetailProduct(null)}
          >
            <div
              className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
                <div className="min-w-0 pr-4">
                  <p className="text-xs uppercase tracking-wider text-gray-400 font-medium">{p.brand}</p>
                  <h2 className="font-display font-bold text-gray-900 text-lg truncate">{p.name}</h2>
                </div>
                <button
                  onClick={() => setDetailProduct(null)}
                  className="text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-xl aspect-square flex items-center justify-center overflow-hidden">
                  {img ? (
                    <img src={img} alt={p.name} className="w-full h-full object-contain p-6" />
                  ) : (
                    <span className="text-gray-400 text-sm">{p.category}</span>
                  )}
                </div>

                <div className="space-y-4 text-sm">
                  {(() => {
                    const wholesale = Number(p.base_price || 0);
                    if (!(wholesale > 0)) return null;
                    return (
                      <div className="rounded-xl bg-orange-50 border border-orange-200 px-4 py-3">
                        <p className="text-xs uppercase tracking-wider text-orange-700/70 font-medium">Your price</p>
                        <p className="font-display text-2xl font-bold text-gray-900">${(wholesale * 2).toFixed(2)}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">Blank garment. Print pricing calculated separately.</p>
                      </div>
                    );
                  })()}
                  {styleNum && (
                    <div>
                      <p className="text-xs uppercase tracking-wider text-gray-400 font-medium mb-1">Style</p>
                      <p className="text-gray-900">{styleNum}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs uppercase tracking-wider text-gray-400 font-medium mb-1">Category</p>
                    <p className="text-gray-900">{p.category}</p>
                  </div>
                  {sizes.length > 0 && (
                    <div>
                      <p className="text-xs uppercase tracking-wider text-gray-400 font-medium mb-1.5">Sizes ({sizes.length})</p>
                      <div className="flex flex-wrap gap-1.5">
                        {sizes.map((s) => (
                          <span key={s} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {colors.length > 0 && (
                    <div>
                      <p className="text-xs uppercase tracking-wider text-gray-400 font-medium mb-1.5">Colors ({colors.length})</p>
                      <div className="flex flex-wrap gap-1.5">
                        {colors.map((c, i) => (
                          <span
                            key={i}
                            className="w-6 h-6 rounded-full border border-gray-200"
                            style={{ backgroundColor: c.hex || '#ccc' }}
                            title={c.name}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {priceBreaks.length > 0 && (
                    <div>
                      <p className="text-xs uppercase tracking-wider text-gray-400 font-medium mb-1.5">Quantity pricing</p>
                      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                        {priceBreaks.map((b, i) => {
                          const qty = b.qty ?? b.minQty;
                          const price = typeof b.price === 'number' ? b.price.toFixed(2) : b.price;
                          if (qty == null || price == null) return null;
                          return (
                            <div key={i} className="flex justify-between px-3 py-1.5 text-xs">
                              <span className="text-gray-600">{qty}+</span>
                              <span className="text-gray-900 font-medium">${price}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {description && (
                <div className="px-6 pb-6">
                  <p className="text-xs uppercase tracking-wider text-gray-400 font-medium mb-2">Description</p>
                  <div
                    className="text-sm text-gray-700 leading-relaxed prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: description }}
                  />
                </div>
              )}

              {/* CTAs at the bottom of the modal */}
              <div className="px-6 pb-6 pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-gray-100">
                <Link
                  to={`/quote?product=${getProductId(p)}`}
                  onClick={() => setDetailProduct(null)}
                  className="block w-full bg-orange-500 hover:bg-orange-600 text-white text-center rounded-lg text-sm font-semibold py-3 transition-colors"
                >
                  Get a Quote
                </Link>
                <Link
                  to={`/design?product=${getProductId(p)}`}
                  onClick={() => setDetailProduct(null)}
                  className="block w-full bg-white hover:bg-gray-50 text-gray-900 text-center rounded-lg text-sm font-semibold py-3 border border-gray-300 transition-colors"
                >
                  Design Online
                </Link>
              </div>
            </div>
          </div>
        );
      })()}
    </Layout>
  );
}
