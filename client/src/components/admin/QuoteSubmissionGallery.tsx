type Asset = { url: string; placement?: string };
type SubmissionItem = {
  picked_product?: { name?: string; ss_id?: string };
  inputs?: { garmentName?: string };
  custom?: { description?: string };
  artwork_placements?: Asset[];
  mockups?: Asset[];
};

// Original customer submissions stay separate from editable production proofs.
// In particular, changing a proof must never erase what the customer supplied.
export default function QuoteSubmissionGallery({ value }: { value: unknown }) {
  let items: SubmissionItem[] = [];
  try {
    const data = typeof value === 'string' ? JSON.parse(value) : value;
    if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) {
      items = (data as { items: SubmissionItem[] }).items.filter(Boolean);
    }
  } catch { return null; }
  if (!items.some(item => item.mockups?.length || item.artwork_placements?.length)) return null;
  return <section className="border-t border-gray-200 pt-4">
    <h3 className="text-sm font-bold text-gray-900">Customer artwork & mockups</h3>
    {items.map((item, index) => <div key={index} className="mt-3">
      <p className="text-xs font-semibold text-gray-700">{item.picked_product?.name || item.inputs?.garmentName || item.custom?.description || `Product ${index + 1}`}
        {item.picked_product?.ss_id && ` · Style ${item.picked_product.ss_id}`}</p>
      <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
        {[
          ...(Array.isArray(item.mockups) ? item.mockups : []).map(asset => ({ ...asset, kind: 'Mockup' })),
          ...(Array.isArray(item.artwork_placements) ? item.artwork_placements : []).map(asset => ({ ...asset, kind: 'Artwork' })),
        ].filter(asset => typeof asset.url === 'string' && /^https:\/\//.test(asset.url)).map((asset, i) =>
          <a key={i} href={asset.url} target="_blank" rel="noreferrer" className="rounded border border-gray-200 overflow-hidden text-center text-xs">
            <img src={asset.url} alt={`${asset.kind} ${asset.placement || ''}`} className="h-28 w-full object-contain bg-gray-100" loading="lazy" />
            <span className="block p-1">{asset.kind} · {(asset.placement || 'front').replace(/_/g, ' ')}</span>
          </a>)}
      </div>
    </div>)}
  </section>;
}
