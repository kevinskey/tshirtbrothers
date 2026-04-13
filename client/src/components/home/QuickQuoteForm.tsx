import { useState, type FormEvent } from 'react';
import { Upload, Send, CheckCircle2 } from 'lucide-react';

export default function QuickQuoteForm() {
  const [form, setForm] = useState({ name: '', email: '', quantity: '', description: '' });
  const [file, setFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.description) return;
    setLoading(true);

    try {
      // Submit as a quote via the API
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: form.name,
          customer_email: form.email,
          quantity: parseInt(form.quantity) || 1,
          notes: form.description,
          product_name: 'Quick Quote Request',
          shipping_method: 'pickup',
        }),
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        alert('Something went wrong. Please try again or call (470) 622-4845.');
      }
    } catch {
      alert('Could not submit. Please call (470) 622-4845.');
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <section className="py-10 md:py-16 bg-gradient-to-b from-orange-50 to-white">
        <div className="mx-auto max-w-xl px-4 text-center">
          <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto mb-4" />
          <h3 className="font-display text-xl sm:text-2xl font-bold text-gray-900 mb-2">Quote Request Sent!</h3>
          <p className="text-gray-600 text-sm sm:text-base">We'll get back to you the same day. Check your email for a detailed quote from T-Shirt Brothers.</p>
          <p className="text-xs text-gray-400 mt-4">Questions? Call <a href="tel:+14706224845" className="text-orange-500 font-semibold">(470) 622-4845</a></p>
        </div>
      </section>
    );
  }

  return (
    <section className="py-10 md:py-16 bg-gradient-to-b from-orange-50 to-white" id="quick-quote">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Left: Text */}
          <div>
            <p className="text-xs sm:text-sm font-semibold text-orange-500 uppercase tracking-wider mb-2">Quick Quote</p>
            <h2 className="font-display text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-3">
              Get a Free Quote in Minutes
            </h2>
            <p className="text-gray-600 text-sm sm:text-base mb-4 max-w-md">
              Tell us about your project and we'll respond the same day with pricing. No minimums — we print single shirts to bulk orders of 1,000+.
            </p>
            <div className="space-y-2 text-sm text-gray-500">
              <p className="flex items-center gap-2">✅ No minimums — single shirts welcome</p>
              <p className="flex items-center gap-2">✅ Same-day quotes — we respond fast</p>
              <p className="flex items-center gap-2">✅ 1-color designs can be ready in 1 day</p>
              <p className="flex items-center gap-2">✅ Free local delivery on orders over $250</p>
            </div>

            {/* Contact info */}
            <div className="mt-6 flex flex-col sm:flex-row gap-3 text-sm">
              <a href="tel:+14706224845" className="flex items-center gap-2 text-gray-700 hover:text-orange-500 font-medium">
                📞 (470) 622-4845
              </a>
              <a href="mailto:kevin@tshirtbrothers.com" className="flex items-center gap-2 text-gray-700 hover:text-orange-500 font-medium">
                ✉️ kevin@tshirtbrothers.com
              </a>
            </div>
          </div>

          {/* Right: Form */}
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-lg p-5 sm:p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="qq-name" className="text-xs font-medium text-gray-700 block mb-1">Name *</label>
                <input
                  id="qq-name"
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Your name"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  style={{ fontSize: '16px' }}
                />
              </div>
              <div>
                <label htmlFor="qq-email" className="text-xs font-medium text-gray-700 block mb-1">Email *</label>
                <input
                  id="qq-email"
                  type="email"
                  required
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="your@email.com"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  style={{ fontSize: '16px' }}
                />
              </div>
            </div>

            <div>
              <label htmlFor="qq-qty" className="text-xs font-medium text-gray-700 block mb-1">Approximate Quantity</label>
              <input
                id="qq-qty"
                type="number"
                min={1}
                value={form.quantity}
                onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))}
                placeholder="e.g. 24"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                style={{ fontSize: '16px' }}
              />
            </div>

            <div>
              <label htmlFor="qq-desc" className="text-xs font-medium text-gray-700 block mb-1">Project Description *</label>
              <textarea
                id="qq-desc"
                required
                rows={3}
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Tell us about your project — shirt type, colors, design details, deadline..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                style={{ fontSize: '16px' }}
              />
            </div>

            {/* Upload artwork */}
            <div>
              <label className="text-xs font-medium text-gray-700 block mb-1">Upload Artwork (optional)</label>
              <label
                htmlFor="qq-file"
                className="flex items-center gap-2 border-2 border-dashed border-gray-200 rounded-lg px-3 py-3 cursor-pointer hover:border-orange-400 hover:bg-orange-50 transition"
              >
                <Upload className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <span className="text-sm text-gray-500 truncate">
                  {file ? file.name : 'PNG, JPG, PDF, AI, SVG — drop or click'}
                </span>
                <input
                  id="qq-file"
                  type="file"
                  accept=".png,.jpg,.jpeg,.pdf,.ai,.svg,.eps"
                  className="hidden"
                  onChange={e => setFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-lg transition-colors shadow-lg shadow-orange-500/25 text-sm sm:text-base flex items-center justify-center gap-2 disabled:bg-gray-300"
            >
              {loading ? 'Sending...' : (
                <>
                  <Send className="h-4 w-4" />
                  Get My Free Quote
                </>
              )}
            </button>

            <p className="text-[10px] text-gray-400 text-center">
              We respond to all quotes the same day · Serving Fairburn, Tyrone, Peachtree City & all of South Atlanta
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}
