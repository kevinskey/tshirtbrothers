const services = [
  {
    emoji: '\uD83C\uDFA8',
    iconBg: 'bg-red-50',
    title: 'Screen Printing',
    description:
      'Bold, vibrant prints for bulk orders. Our screen printing delivers durable, high-quality results that last wash after wash.',
    tags: ['Bulk orders', 'Durable', 'Vibrant colors'],
  },
  {
    emoji: '\uD83D\uDD34',
    iconBg: 'bg-blue-50',
    title: 'DTF Transfers',
    description:
      'Direct-to-film transfers for unlimited colors and photo-quality prints on virtually any fabric type.',
    tags: ['Unlimited colors', 'Photo quality', 'Any fabric'],
  },
  {
    emoji: '\uD83E\uDDF5',
    iconBg: 'bg-green-50',
    title: 'Embroidery',
    description:
      'Professional embroidery for logos, branding, and custom designs on polos, hats, jackets, and more.',
    tags: ['Logos', 'Polos', 'Hats'],
  },
  {
    emoji: '\u2702\uFE0F',
    iconBg: 'bg-amber-50',
    title: 'Custom Vinyl',
    description:
      'Precision-cut vinyl for names, numbers, and custom designs. Perfect for sports teams and individual pieces.',
    tags: ['Names', 'Numbers', 'Cut vinyl'],
  },
];

export default function ServicesGrid() {
  return (
    <section className="py-16 md:py-20">
      <div className="container mx-auto px-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-red-600 mb-3">
          WHAT WE DO
        </p>
        <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight mb-3">
          Professional Custom Printing
        </h2>
        <p className="text-gray-500 text-base mb-12 max-w-lg">
          From screen printing to embroidery, we offer a full range of custom printing services for
          individuals, businesses, and organizations.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {services.map((service) => (
            <div
              key={service.title}
              className="group border rounded-xl p-6 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer border-l-2 border-l-transparent hover:border-l-red-600"
            >
              <div
                className={`w-12 h-12 ${service.iconBg} rounded-xl flex items-center justify-center text-2xl mb-4`}
              >
                {service.emoji}
              </div>
              <h3 className="font-display font-semibold text-lg mb-2">{service.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed mb-4">{service.description}</p>
              <div className="flex flex-wrap gap-1.5">
                {service.tags.map((tag) => (
                  <span
                    key={tag}
                    className="bg-gray-100 rounded-full px-2.5 py-1 text-xs text-gray-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
