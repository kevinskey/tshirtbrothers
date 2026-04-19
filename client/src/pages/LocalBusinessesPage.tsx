import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Layout from '@/components/layout/Layout';
import {
  fetchLocalBusinesses,
  fetchSouthAtlantaZips,
  type LocalBusiness,
} from '@/lib/api';
import { Loader2, MapPin, Calendar, Search, Building2 } from 'lucide-react';

function formatDate(dateStr: string | null) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function LocalBusinessesPage() {
  const [zip, setZip] = useState<string>('');
  const [q, setQ] = useState('');
  const [since, setSince] = useState('');

  const { data: zipsData } = useQuery({
    queryKey: ['local-businesses', 'zips'],
    queryFn: fetchSouthAtlantaZips,
    staleTime: Infinity,
  });

  const filters = useMemo(
    () => ({
      zip: zip || undefined,
      q: q || undefined,
      since: since || undefined,
      limit: 100,
    }),
    [zip, q, since]
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['local-businesses', filters],
    queryFn: () => fetchLocalBusinesses(filters),
  });

  const businesses = data?.businesses ?? [];

  return (
    <Layout>
      <section className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white py-16">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-3">
            New Businesses in South Atlanta
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            Recently opened and registered businesses pulled from public open-data
            sources, filtered to South Atlanta ZIP codes.
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 py-10">
        {/* Filters */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 grid md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Search by name
            </label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="e.g. coffee, salon, market"
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">ZIP</label>
            <select
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-red-500"
            >
              <option value="">All South Atlanta</option>
              {(zipsData?.zips ?? []).map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              Opened on or after
            </label>
            <input
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-red-500"
            />
          </div>
        </div>

        {/* Loading / error / empty */}
        {isLoading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        )}

        {isError && (
          <div className="text-center py-12 text-red-600 text-sm">
            Failed to load businesses: {(error as Error).message}
          </div>
        )}

        {!isLoading && !isError && businesses.length === 0 && (
          <div className="text-center py-20">
            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-lg">
              No businesses found yet. Once the open-data ingester runs, new
              listings in South Atlanta will appear here.
            </p>
          </div>
        )}

        {/* Results */}
        {businesses.length > 0 && (
          <div className="grid md:grid-cols-2 gap-4">
            {businesses.map((b: LocalBusiness) => (
              <div
                key={b.id}
                className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <h2 className="font-display font-bold text-lg text-gray-900">
                    {b.name}
                  </h2>
                  {b.zip && (
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full whitespace-nowrap">
                      {b.zip}
                    </span>
                  )}
                </div>

                {b.business_type && (
                  <p className="text-sm text-gray-500 mb-3">{b.business_type}</p>
                )}

                <div className="space-y-1.5 text-sm text-gray-600">
                  {b.address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" />
                      <span>
                        {b.address}
                        {b.city ? `, ${b.city}` : ''}
                        {b.state ? `, ${b.state}` : ''}
                      </span>
                    </div>
                  )}
                  {b.opened_at && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                      <span>Opened {formatDate(b.opened_at)}</span>
                    </div>
                  )}
                </div>

                {b.latitude && b.longitude && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${b.latitude},${b.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block mt-3 text-xs text-red-600 hover:underline"
                  >
                    View on map →
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </Layout>
  );
}
