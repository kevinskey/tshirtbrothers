export default function SocialProofBar() {
  const items = [
    { emoji: '\uD83D\uDD25', text: <><strong className="text-gray-900">6,500+</strong> products in catalog</> },
    { emoji: '\u23F1', text: <>Quotes in <strong className="text-gray-900">under 24 hrs</strong></> },
    { emoji: '\uD83D\uDCE6', text: <><strong className="text-gray-900">Free shipping</strong> over $150</> },
    { emoji: '\uD83C\uDFAF', text: <><strong className="text-gray-900">No minimum</strong> order</> },
  ];

  return (
    <section className="bg-gray-50 border-y py-5">
      <div className="container mx-auto px-6">
        <div className="flex justify-center flex-wrap gap-12">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2.5 text-sm text-gray-600">
              <span>{item.emoji}</span>
              <span>{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
