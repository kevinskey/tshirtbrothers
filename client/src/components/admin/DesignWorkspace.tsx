import { useState, useEffect } from 'react';
import { Loader2, Trash2, Download, Save, Search, Sparkles, RotateCcw, Image, FolderOpen, Plus, X, Edit3, ZoomIn, Scissors, QrCode, Shirt } from 'lucide-react';

interface DesignAsset {
  id: number;
  name: string;
  description: string | null;
  image_url: string;
  tags: string[];
  category: string;
  width: number | null;
  height: number | null;
  created_at: string;
}

function getToken() { return localStorage.getItem('tsb_token') || ''; }
const headers = () => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` });

const CATEGORIES = ['general', 'logos', 'typography', 'illustrations', 'backgrounds', 'badges', 'icons', 'patterns'];

export default function DesignWorkspace() {
  // AI Generation
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [removingBg, setRemovingBg] = useState(false);
  const [upscaling, setUpscaling] = useState(false);
  const [removingColor, setRemovingColor] = useState(false);
  const [colorToRemove, setColorToRemove] = useState('#000000');
  const [colorFuzz, setColorFuzz] = useState(25);
  const [preppingVinyl, setPreppingVinyl] = useState(false);
  const [vectorizing, setVectorizing] = useState(false);
  const [vinylColors, _setVinylColors] = useState(1);
  const [qrText, setQrText] = useState('');
  const [qrColor, setQrColor] = useState('#000000');
  const [qrTransparent, setQrTransparent] = useState(true);
  const [generatingQr, setGeneratingQr] = useState(false);
  const [designStyle, setDesignStyle] = useState<'dtf' | 'vinyl' | 'print'>('dtf');

  // Library
  const [designs, setDesigns] = useState<DesignAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [view, setView] = useState<'create' | 'library'>('create');

  // Save dialog
  const [saveDialog, setSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDesc, setSaveDesc] = useState('');
  const [saveCategory, setSaveCategory] = useState('general');
  const [saveTags, setSaveTags] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit dialog
  const [editDesign, setEditDesign] = useState<DesignAsset | null>(null);

  // History for undo
  const [imageHistory, setImageHistory] = useState<string[]>([]);
  // URL paste + customer graphics picker for the Upload & Fix section
  const [pasteUrl, setPasteUrl] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerDesigns, setPickerDesigns] = useState<Array<{ id: number; customer_name: string; product_name: string; design_url: string; status: string }>>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerTab, setPickerTab] = useState<'quotes' | 'private'>('quotes');
  const [customers, setCustomers] = useState<Array<{ id: number; name: string; email: string }>>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [privateAssets, setPrivateAssets] = useState<Array<{ id: number; name: string; image_url: string }>>([]);
  const [privateLoading, setPrivateLoading] = useState(false);
  const [moveToCustomerFor, setMoveToCustomerFor] = useState<{ id: number; name: string } | null>(null);
  const [moveCustomerId, setMoveCustomerId] = useState('');

  async function fetchDesigns() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (searchQuery) params.set('search', searchQuery);
      const res = await fetch(`/api/admin/designs-library?${params}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (res.ok) setDesigns(await res.json());
    } catch {} finally { setLoading(false); }
  }

  useEffect(() => { fetchDesigns(); }, [categoryFilter, searchQuery]);

  async function handleGenerate() {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/design/generate', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ prompt, removeBackground: designStyle !== 'vinyl', style: designStyle }),
      });
      if (!res.ok) throw new Error('Generation failed');
      const data = await res.json();
      if (data.imageUrl) {
        setGeneratedImage(data.imageUrl);
        setImageHistory(prev => [...prev, data.imageUrl]);
      }
    } catch (err) {
      alert('Generation failed. Try again.');
    } finally { setGenerating(false); }
  }

  // Uploads a data URL to DO Spaces and returns a URL. Falls back to the
  // data URL if the upload fails. Used to avoid sending huge base64 bodies
  // to /api/design/remove-bg and /api/design/upscale (nginx rejects with 413).
  async function uploadDataUrlIfNeeded(value: string, filename: string): Promise<{ body: Record<string, string>; newValue: string }> {
    if (!value.startsWith('data:')) {
      return { body: { imageUrl: value }, newValue: value };
    }
    try {
      const res = await fetch('/api/quotes/upload-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ imageBase64: value, filename, customerEmail: 'admin-workspace' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.url) return { body: { imageUrl: data.url }, newValue: data.url };
      }
    } catch { /* fall through */ }
    return { body: { imageBase64: value }, newValue: value };
  }

  async function handleRemoveBg() {
    if (!generatedImage || removingBg) return;
    setRemovingBg(true);
    try {
      const { body, newValue } = await uploadDataUrlIfNeeded(generatedImage, 'workspace-source.png');
      if (newValue !== generatedImage) setGeneratedImage(newValue);
      const res = await fetch('/api/design/remove-bg', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      if (data.imageBase64) {
        setGeneratedImage(data.imageBase64);
        setImageHistory(prev => [...prev, data.imageBase64]);
      }
    } catch (err: any) {
      alert(`Background removal failed: ${err?.message || err}`);
    } finally { setRemovingBg(false); }
  }


  async function handleUpscale() {
    if (!generatedImage || upscaling) return;
    setUpscaling(true);
    try {
      const { body, newValue } = await uploadDataUrlIfNeeded(generatedImage, 'workspace-source.png');
      if (newValue !== generatedImage) setGeneratedImage(newValue);
      const res = await fetch('/api/design/upscale', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ ...body, scale: 4 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      if (data.imageBase64) {
        setGeneratedImage(data.imageBase64);
        setImageHistory(prev => [...prev, data.imageBase64]);
      }
    } catch (err: any) {
      alert(`Upscaling failed: ${err?.message || err}`);
    } finally { setUpscaling(false); }
  }

  async function handleRemoveColor() {
    if (!generatedImage || removingColor) return;
    setRemovingColor(true);
    try {
      const { body, newValue } = await uploadDataUrlIfNeeded(generatedImage, 'workspace-source.png');
      if (newValue !== generatedImage) setGeneratedImage(newValue);
      const res = await fetch('/api/design/remove-color', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ ...body, color: colorToRemove, fuzz: colorFuzz }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      if (data.imageBase64) {
        setGeneratedImage(data.imageBase64);
        setImageHistory(prev => [...prev, data.imageBase64]);
      }
    } catch (err: any) {
      alert(`Color removal failed: ${err?.message || err}`);
    } finally { setRemovingColor(false); }
  }


  async function _handlePrepVinyl() {
    if (!generatedImage || preppingVinyl) return;
    setPreppingVinyl(true);
    try {
      const res = await fetch('/api/design/prep-vinyl', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          ...(generatedImage.startsWith('data:')
            ? { imageBase64: generatedImage }
            : { imageUrl: generatedImage }),
          colors: vinylColors,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      // Update preview with clean PNG
      if (data.cleanPng) {
        setGeneratedImage(data.cleanPng);
        setImageHistory(prev => [...prev, data.cleanPng]);
      }
      // Auto-download SVG
      if (data.svg) {
        const blob = new Blob([data.svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (prompt || 'design').replace(/\s+/g, '-').toLowerCase() + '-cut-ready.svg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch { alert('Vinyl prep failed. Try again.'); }
    finally { setPreppingVinyl(false); }
  }

  async function _handleVectorize() {
    if (!generatedImage || vectorizing) return;
    setVectorizing(true);
    try {
      const res = await fetch('/api/design/vectorize', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          ...(generatedImage.startsWith('data:')
            ? { imageBase64: generatedImage }
            : { imageUrl: generatedImage }),
          colors: vinylColors,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      if (data.svg) {
        const blob = new Blob([data.svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (prompt || 'design').replace(/\s+/g, '-').toLowerCase() + '.svg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch { alert('Vectorization failed. Try again.'); }
    finally { setVectorizing(false); }
  }

  // Kept for future UI wiring
  void _handlePrepVinyl;
  void _handleVectorize;

  async function handleGenerateQR() {
    if (!qrText.trim() || generatingQr) return;
    setGeneratingQr(true);
    try {
      const res = await fetch('/api/design/qrcode', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          text: qrText.trim(),
          size: 2048,
          darkColor: qrColor,
          transparent: qrTransparent,
          errorCorrection: 'H',
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      if (data.imageBase64) {
        setGeneratedImage(data.imageBase64);
        setImageHistory(prev => [...prev, data.imageBase64]);
      }
    } catch { alert('QR code generation failed'); }
    finally { setGeneratingQr(false); }
  }

  function handleUndo() {
    if (imageHistory.length <= 1) return;
    const newHistory = [...imageHistory];
    newHistory.pop();
    setImageHistory(newHistory);
    setGeneratedImage(newHistory[newHistory.length - 1] ?? null);
  }

  async function handleSave() {
    if (!generatedImage || !saveName.trim()) return;
    setSaving(true);
    try {
      // Upload to DO Spaces first
      const uploadRes = await fetch('/api/quotes/upload-design', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          imageBase64: generatedImage.startsWith('data:') ? generatedImage : undefined,
          filename: saveName.replace(/\s+/g, '-').toLowerCase() + '.png',
          customerEmail: 'admin-workspace',
        }),
      });

      let imageUrl = generatedImage;
      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        imageUrl = uploadData.url;
      }

      // Save to library
      const res = await fetch('/api/admin/designs-library', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          name: saveName,
          description: saveDesc || null,
          image_url: imageUrl,
          tags: saveTags ? saveTags.split(',').map(t => t.trim()) : [],
          category: saveCategory,
        }),
      });
      if (res.ok) {
        setSaveDialog(false);
        setGeneratedImage(null); setImageHistory([]); setPrompt(''); setQrText('');
        setSaveName(''); setSaveDesc(''); setSaveTags('');
        setView('library');
        fetchDesigns();
      }
    } catch { alert('Save failed'); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this design?')) return;
    await fetch(`/api/admin/designs-library/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${getToken()}` } });
    fetchDesigns();
  }

  async function handleUpdateDesign() {
    if (!editDesign) return;
    await fetch(`/api/admin/designs-library/${editDesign.id}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ name: editDesign.name, description: editDesign.description, category: editDesign.category, tags: editDesign.tags }),
    });
    setEditDesign(null);
    fetchDesigns();
  }


  function loadDesignToEditor(imageUrl: string, name: string) {
    setGeneratedImage(imageUrl);
    setImageHistory([imageUrl]);
    setPrompt(name);
    setView('create');
  }

  function handleDownload(url: string, name: string) {
    const a = document.createElement('a');
    a.href = url;
    a.download = name + '.png';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 onClick={() => { setGeneratedImage(null); setImageHistory([]); setPrompt(''); setQrText(''); setView('create'); }} className="text-xl md:text-2xl font-display font-bold text-gray-900 cursor-pointer hover:text-orange-600 transition">Design Workspace</h2>
        <div className="flex gap-2">
          <button onClick={() => setView('create')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${view === 'create' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            <Sparkles className="w-4 h-4 inline mr-1" /> Create
          </button>
          <button onClick={() => setView('library')} className={`px-4 py-2 rounded-lg text-sm font-medium transition ${view === 'library' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            <FolderOpen className="w-4 h-4 inline mr-1" /> Library ({designs.length})
          </button>
        </div>
      </div>

      {view === 'create' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: AI Generation */}
          <div className="space-y-4">
            {/* Upload existing graphic */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
              <h3 className="font-semibold text-gray-900 mb-2">Upload & Fix Graphics</h3>
              <p className="text-xs text-gray-500 mb-3">Pick or upload a customer graphic to remove backgrounds / fix low-res.</p>

              <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-xl px-4 py-4 cursor-pointer hover:border-orange-400 hover:bg-orange-50 transition">
                <Plus className="w-5 h-5 text-gray-400" />
                <span className="text-sm text-gray-500">Upload PNG, JPG, SVG, or PDF</span>
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.svg,.pdf,.webp"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      const dataUrl = reader.result as string;
                      setGeneratedImage(dataUrl);
                      setImageHistory(prev => [...prev, dataUrl]);
                      setPrompt(file.name.replace(/\.[^.]+$/, ''));
                    };
                    reader.readAsDataURL(file);
                    e.target.value = '';
                  }}
                />
              </label>

              <div className="mt-3">
                <button
                  type="button"
                  onClick={async () => {
                    setPickerOpen(true);
                    if (pickerDesigns.length === 0) {
                      setPickerLoading(true);
                      try {
                        const res = await fetch('/api/quotes', { headers: { Authorization: `Bearer ${getToken()}` } });
                        if (res.ok) {
                          const quotes = await res.json();
                          const withDesigns = (Array.isArray(quotes) ? quotes : [])
                            .filter((q: { design_url?: string | null }) => !!q.design_url)
                            .map((q: { id: number; customer_name?: string; product_name?: string; design_url: string; status?: string }) => ({
                              id: q.id,
                              customer_name: q.customer_name || 'Unknown',
                              product_name: q.product_name || '',
                              design_url: q.design_url,
                              status: q.status || '',
                            }));
                          setPickerDesigns(withDesigns);
                        }
                      } finally { setPickerLoading(false); }
                    }
                  }}
                  className="w-full text-sm py-2 rounded-lg border border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-700 flex items-center justify-center gap-2"
                >
                  <FolderOpen className="w-4 h-4" /> Pick from Customer Graphics
                </button>
              </div>

              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  placeholder="Or paste an image URL…"
                  value={pasteUrl}
                  onChange={(e) => setPasteUrl(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!pasteUrl.trim()) return;
                    const url = pasteUrl.trim();
                    setGeneratedImage(url);
                    setImageHistory(prev => [...prev, url]);
                    setPrompt('From URL');
                    setPasteUrl('');
                  }}
                  className="px-3 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-medium"
                >
                  Load
                </button>
              </div>
            </div>

            {/* Customer graphics picker modal */}
            {pickerOpen && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col">
                  <div className="flex items-center justify-between px-5 py-3 border-b">
                    <h3 className="font-semibold text-gray-900">Customer Graphics</h3>
                    <button onClick={() => setPickerOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                  </div>
                  {/* Tabs */}
                  <div className="flex border-b">
                    <button
                      onClick={() => setPickerTab('quotes')}
                      className={`flex-1 py-2.5 text-sm font-medium ${pickerTab === 'quotes' ? 'text-orange-600 border-b-2 border-orange-500' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      Quote Uploads ({pickerDesigns.length})
                    </button>
                    <button
                      onClick={async () => {
                        setPickerTab('private');
                        if (customers.length === 0) {
                          try {
                            const r = await fetch('/api/admin/customers', { headers: { Authorization: `Bearer ${getToken()}` } });
                            if (r.ok) setCustomers(await r.json());
                          } catch { /* ignore */ }
                        }
                      }}
                      className={`flex-1 py-2.5 text-sm font-medium ${pickerTab === 'private' ? 'text-orange-600 border-b-2 border-orange-500' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      Private Assets
                    </button>
                  </div>

                  {pickerTab === 'quotes' ? (
                    <>
                      <div className="px-5 py-2 border-b">
                        <input
                          type="text"
                          placeholder="Search customer or product…"
                          value={pickerSearch}
                          onChange={(e) => setPickerSearch(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
                        />
                      </div>
                      <div className="flex-1 overflow-auto p-5">
                        {pickerLoading ? (
                          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
                        ) : pickerDesigns.length === 0 ? (
                          <p className="text-sm text-gray-400 text-center py-8">No customer-uploaded graphics found.</p>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {pickerDesigns
                              .filter(d => {
                                const q = pickerSearch.trim().toLowerCase();
                                if (!q) return true;
                                return d.customer_name.toLowerCase().includes(q) || d.product_name.toLowerCase().includes(q);
                              })
                              .map(d => (
                                <button
                                  key={d.id}
                                  onClick={() => {
                                    setGeneratedImage(d.design_url);
                                    setImageHistory(prev => [...prev, d.design_url]);
                                    setPrompt(`${d.customer_name} - ${d.product_name}`);
                                    setPickerOpen(false);
                                  }}
                                  className="group text-left bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-orange-400 transition"
                                >
                                  <div className="aspect-square bg-gray-50 flex items-center justify-center">
                                    <img src={d.design_url} alt="" className="w-full h-full object-contain" />
                                  </div>
                                  <div className="p-2">
                                    <p className="text-xs font-semibold text-gray-900 truncate">{d.customer_name}</p>
                                    <p className="text-[10px] text-gray-500 truncate">{d.product_name || '—'}</p>
                                  </div>
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="px-5 py-2 border-b">
                        <select
                          value={selectedCustomerId}
                          onChange={async (e) => {
                            const id = e.target.value;
                            setSelectedCustomerId(id);
                            setPrivateAssets([]);
                            if (id) {
                              setPrivateLoading(true);
                              try {
                                const r = await fetch(`/api/admin/customers/${id}/assets`, { headers: { Authorization: `Bearer ${getToken()}` } });
                                if (r.ok) setPrivateAssets(await r.json());
                              } finally { setPrivateLoading(false); }
                            }
                          }}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg"
                        >
                          <option value="">— pick a customer —</option>
                          {customers.map((c) => (
                            <option key={c.id} value={c.id}>{c.name} · {c.email}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex-1 overflow-auto p-5">
                        {!selectedCustomerId ? (
                          <p className="text-sm text-gray-400 text-center py-8">Choose a customer above to see their private assets.</p>
                        ) : privateLoading ? (
                          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
                        ) : privateAssets.length === 0 ? (
                          <p className="text-sm text-gray-400 text-center py-8">No private assets for this customer yet.</p>
                        ) : (
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {privateAssets.map((a) => (
                              <button
                                key={a.id}
                                onClick={() => {
                                  setGeneratedImage(a.image_url);
                                  setImageHistory(prev => [...prev, a.image_url]);
                                  setPrompt(a.name);
                                  setPickerOpen(false);
                                }}
                                className="group text-left bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-orange-400 transition"
                              >
                                <div className="aspect-square bg-gray-50 flex items-center justify-center">
                                  <img src={a.image_url} alt={a.name} className="w-full h-full object-contain" />
                                </div>
                                <div className="p-2">
                                  <p className="text-xs font-semibold text-gray-900 truncate">{a.name}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* QR Code Generator */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
              <h3 className="font-semibold text-gray-900 mb-2"><QrCode className="w-4 h-4 inline mr-1.5" />QR Code Generator</h3>
              <p className="text-xs text-gray-500 mb-3">Generate print-ready QR codes at 2048x2048px (300+ DPI at 6\").</p>
              <input
                type="text"
                value={qrText}
                onChange={e => setQrText(e.target.value)}
                placeholder="URL, address, phone number, email, or any text..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 mb-2"
                style={{ fontSize: '16px' }}
                onKeyDown={e => e.key === 'Enter' && handleGenerateQR()}
              />
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-500">Color:</label>
                  <input type="color" value={qrColor} onChange={e => setQrColor(e.target.value)}
                    className="w-7 h-7 rounded border border-gray-200 cursor-pointer" />
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={qrTransparent} onChange={e => setQrTransparent(e.target.checked)}
                    className="rounded border-gray-300 text-orange-500 focus:ring-orange-500" />
                  <span className="text-xs text-gray-500">Transparent background</span>
                </label>
              </div>
              <button onClick={handleGenerateQR} disabled={generatingQr || !qrText.trim()}
                className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold py-2.5 rounded-xl text-sm transition disabled:bg-gray-300 flex items-center justify-center gap-2">
                {generatingQr ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />} Generate QR Code
              </button>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-3">AI Image Generator</h3>
              <p className="text-xs text-gray-500 mb-3">Describe the graphic you want. Images are generated at print quality (1024×1024) with transparent backgrounds.</p>
              {/* Output Style */}
              <div className="mb-3">
                <label className="text-xs font-medium text-gray-500 block mb-1.5">Output Style</label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button onClick={() => setDesignStyle('dtf')}
                    className={`px-2 py-2 rounded-lg text-xs font-medium transition text-center ${designStyle === 'dtf' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    <Sparkles className="w-3.5 h-3.5 mx-auto mb-0.5" />
                    DTF / Full Color
                  </button>
                  <button onClick={() => setDesignStyle('vinyl')}
                    className={`px-2 py-2 rounded-lg text-xs font-medium transition text-center ${designStyle === 'vinyl' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    <Scissors className="w-3.5 h-3.5 mx-auto mb-0.5" />
                    Vinyl Cut
                  </button>
                  <button onClick={() => setDesignStyle('print')}
                    className={`px-2 py-2 rounded-lg text-xs font-medium transition text-center ${designStyle === 'print' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    <Shirt className="w-3.5 h-3.5 mx-auto mb-0.5" />
                    Screen Print
                  </button>
                </div>
              </div>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="e.g. A vintage badge logo with an eagle, red and gold colors, retro Americana style"
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                style={{ fontSize: '16px' }}
              />
              <button
                onClick={handleGenerate}
                disabled={generating || !prompt.trim()}
                className="mt-3 w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl text-sm transition disabled:bg-gray-300 flex items-center justify-center gap-2"
              >
                {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating (15-30s)...</> : <><Sparkles className="w-4 h-4" /> Generate Design</>}
              </button>
            </div>

            {/* Quick actions */}
            {generatedImage && (
              <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
                <h4 className="text-sm font-semibold text-gray-700">Tools</h4>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={handleRemoveBg} disabled={removingBg}
                    className="px-3 py-2 bg-purple-50 text-purple-700 text-xs font-medium rounded-lg hover:bg-purple-100 disabled:opacity-50 flex items-center justify-center gap-1">
                    {removingBg ? <Loader2 className="w-3 h-3 animate-spin" /> : '✂️'} Remove BG
                  </button>
                  <button onClick={handleUpscale} disabled={upscaling}
                    className="px-3 py-2 bg-cyan-50 text-cyan-700 text-xs font-medium rounded-lg hover:bg-cyan-100 disabled:opacity-50 flex items-center justify-center gap-1">
                    {upscaling ? <Loader2 className="w-3 h-3 animate-spin" /> : <ZoomIn className="w-3 h-3" />} Upscale 4x
                  </button>
                  <button onClick={handleUndo} disabled={imageHistory.length <= 1}
                    className="px-3 py-2 bg-gray-50 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-100 disabled:opacity-50 flex items-center justify-center gap-1">
                    <RotateCcw className="w-3 h-3" /> Undo
                  </button>
                  <button onClick={() => generatedImage && handleDownload(generatedImage, 'design-' + Date.now())}
                    className="px-3 py-2 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-100 flex items-center justify-center gap-1">
                    <Download className="w-3 h-3" /> Download
                  </button>
                  <button onClick={() => { setSaveDialog(true); setSaveName(prompt.slice(0, 50)); }}
                    className="px-3 py-2 bg-green-50 text-green-700 text-xs font-medium rounded-lg hover:bg-green-100 flex items-center justify-center gap-1">
                    <Save className="w-3 h-3" /> Save to Library
                  </button>
                </div>

                {/* Color-based removal — for when AI leaves drop shadows / solid fills */}
                <div className="border-t border-gray-200 pt-2 mt-2">
                  <p className="text-[11px] text-gray-500 mb-1">Remove a specific color (for shadows or solid fills AI missed)</p>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={colorToRemove} onChange={(e) => setColorToRemove(e.target.value)} className="w-10 h-8 rounded border border-gray-200 p-0.5 cursor-pointer" />
                    <label className="text-[11px] text-gray-600 flex-1">
                      Tolerance: {colorFuzz}%
                      <input type="range" min={0} max={60} value={colorFuzz} onChange={(e) => setColorFuzz(Number(e.target.value))} className="w-full" />
                    </label>
                    <button onClick={handleRemoveColor} disabled={removingColor}
                      className="px-3 py-1.5 bg-pink-50 text-pink-700 text-xs font-medium rounded-lg hover:bg-pink-100 disabled:opacity-50 flex items-center justify-center gap-1 whitespace-nowrap">
                      {removingColor ? <Loader2 className="w-3 h-3 animate-spin" /> : null} Remove
                    </button>
                  </div>
                </div>

                <button onClick={() => handleGenerate()}
                  disabled={generating}
                  className="w-full px-3 py-2 bg-orange-50 text-orange-700 text-xs font-medium rounded-lg hover:bg-orange-100 disabled:opacity-50 flex items-center justify-center gap-1">
                  🔄 Regenerate (same prompt)
                </button>
              </div>
            )}
          </div>

          {/* Right: Canvas / Preview */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 min-h-[400px] flex items-center justify-center">
            {generating ? (
              <div className="text-center text-gray-500">
                <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3 text-orange-500" />
                <p className="text-sm font-medium">Creating your design...</p>
                <p className="text-xs text-gray-400 mt-1">This usually takes 15-30 seconds</p>
              </div>
            ) : generatedImage ? (
              <div className="w-full">
                <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-center" style={{ backgroundImage: 'linear-gradient(45deg, #e5e7eb 25%, transparent 25%, transparent 75%, #e5e7eb 75%), linear-gradient(45deg, #e5e7eb 25%, transparent 25%, transparent 75%, #e5e7eb 75%)', backgroundSize: '20px 20px', backgroundPosition: '0 0, 10px 10px' }}>
                  <img src={generatedImage} alt="Generated design" className="max-w-full max-h-[500px] object-contain" />
                </div>
                <p className="text-[10px] text-gray-400 text-center mt-2">Checkerboard = transparent background</p>
              </div>
            ) : (
              <div className="text-center text-gray-400">
                <Image className="w-16 h-16 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">Your design will appear here</p>
                <p className="text-xs mt-1">Describe what you want in the prompt box</p>
              </div>
            )}
          </div>
        </div>
      )}

      {view === 'library' && (
        <div>
          {/* Search + Filter */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search designs..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                style={{ fontSize: '16px' }}
              />
            </div>
            <div className="flex gap-1 overflow-x-auto">
              {['all', ...CATEGORIES].map(cat => (
                <button key={cat} onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition capitalize ${categoryFilter === cat ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Grid */}
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : designs.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <Image className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No designs yet. Create your first one!</p>
              <button onClick={() => setView('create')} className="mt-3 text-orange-500 font-semibold text-sm hover:underline">
                <Plus className="w-4 h-4 inline" /> Create Design
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {designs.map(d => (
                <div key={d.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden group hover:shadow-md transition">
                  <div className="aspect-square bg-gray-50 flex items-center justify-center p-2 relative"
                    style={{ backgroundImage: 'linear-gradient(45deg, #f3f4f6 25%, transparent 25%, transparent 75%, #f3f4f6 75%), linear-gradient(45deg, #f3f4f6 25%, transparent 25%, transparent 75%, #f3f4f6 75%)', backgroundSize: '16px 16px', backgroundPosition: '0 0, 8px 8px' }}>
                    <img src={d.image_url} alt={d.name} className="max-w-full max-h-full object-contain" loading="lazy" />
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center gap-2">
                      <button onClick={() => loadDesignToEditor(d.image_url, d.name)}
                        className="bg-orange-500 hover:bg-orange-600 text-white rounded-lg px-3 py-1.5 text-xs font-bold flex items-center gap-1 shadow-lg">
                        <Sparkles className="w-3 h-3" /> Edit with Tools
                      </button>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => handleDownload(d.image_url, d.name)} className="bg-white rounded-full p-1.5 hover:bg-gray-100" title="Download">
                          <Download className="w-3.5 h-3.5 text-gray-700" />
                        </button>
                        <button onClick={() => setEditDesign(d)} className="bg-white rounded-full p-1.5 hover:bg-gray-100" title="Edit Info">
                          <Edit3 className="w-3.5 h-3.5 text-gray-700" />
                        </button>
                        <button
                          onClick={async () => {
                            setMoveToCustomerFor({ id: d.id, name: d.name });
                            if (customers.length === 0) {
                              try {
                                const r = await fetch('/api/admin/customers', { headers: { Authorization: `Bearer ${getToken()}` } });
                                if (r.ok) setCustomers(await r.json());
                              } catch { /* ignore */ }
                            }
                          }}
                          className="bg-white rounded-full p-1.5 hover:bg-gray-100"
                          title="Move to customer's private library"
                        >
                          <Shirt className="w-3.5 h-3.5 text-blue-600" />
                        </button>
                        <button onClick={() => handleDelete(d.id)} className="bg-white rounded-full p-1.5 hover:bg-gray-100" title="Delete">
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="p-2.5">
                    <p className="text-xs font-semibold text-gray-900 truncate">{d.name}</p>
                    <p className="text-[10px] text-gray-400 capitalize">{d.category} · {new Date(d.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Move library design → customer private */}
          {moveToCustomerFor && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl max-w-md w-full p-5">
                <h3 className="font-semibold text-gray-900 mb-1">Move to Customer's Private Library</h3>
                <p className="text-xs text-gray-500 mb-3">"{moveToCustomerFor.name}" will be removed from the shared Library and added to the chosen customer's private assets only.</p>
                <select
                  value={moveCustomerId}
                  onChange={(e) => setMoveCustomerId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg mb-4"
                >
                  <option value="">— pick a customer —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} · {c.email}</option>
                  ))}
                </select>
                <div className="flex gap-3">
                  <button
                    onClick={() => { setMoveToCustomerFor(null); setMoveCustomerId(''); }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!moveCustomerId}
                    onClick={async () => {
                      if (!moveToCustomerFor || !moveCustomerId) return;
                      const r = await fetch(`/api/admin/designs-library/${moveToCustomerFor.id}/move-to-customer`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                        body: JSON.stringify({ customer_id: Number(moveCustomerId) }),
                      });
                      if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error || 'Move failed'); return; }
                      setMoveToCustomerFor(null);
                      setMoveCustomerId('');
                      await fetchDesigns();
                    }}
                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    Move
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Save Dialog */}
      {saveDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSaveDialog(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Save to Library</h3>
              <button onClick={() => setSaveDialog(false)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Name *</label>
              <input type="text" value={saveName} onChange={e => setSaveName(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" style={{ fontSize: '16px' }} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Description</label>
              <input type="text" value={saveDesc} onChange={e => setSaveDesc(e.target.value)} placeholder="Optional"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" style={{ fontSize: '16px' }} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Category</label>
              <select value={saveCategory} onChange={e => setSaveCategory(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 capitalize" style={{ fontSize: '16px' }}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Tags (comma-separated)</label>
              <input type="text" value={saveTags} onChange={e => setSaveTags(e.target.value)} placeholder="e.g. retro, eagle, badge"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" style={{ fontSize: '16px' }} />
            </div>
            <button onClick={handleSave} disabled={saving || !saveName.trim()}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl text-sm transition disabled:bg-gray-300">
              {saving ? 'Saving...' : 'Save Design'}
            </button>
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      {editDesign && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditDesign(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Edit Design</h3>
              <button onClick={() => setEditDesign(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Name</label>
              <input type="text" value={editDesign.name} onChange={e => setEditDesign({ ...editDesign, name: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" style={{ fontSize: '16px' }} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Category</label>
              <select value={editDesign.category} onChange={e => setEditDesign({ ...editDesign, category: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm capitalize" style={{ fontSize: '16px' }}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <button onClick={handleUpdateDesign}
              className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold py-3 rounded-xl text-sm transition">
              Update
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
