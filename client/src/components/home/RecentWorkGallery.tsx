
const CDN = 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com';

// Replace these placeholder images with real customer photos from Google Reviews
const gallery = [
  { src: CDN + '/gallery/church-ministry.jpg', caption: 'Church Ministry Tees', tag: 'Screen Print' },
  { src: CDN + '/gallery/family-reunion.jpg', caption: 'Family Reunion', tag: 'DTF Transfer' },
  { src: CDN + '/gallery/sports-league.jpg', caption: 'Rec League Jerseys', tag: 'Screen Print' },
  { src: CDN + '/gallery/school-spirit.jpg', caption: 'School Spirit Wear', tag: 'DTF Transfer' },
  { src: CDN + '/gallery/business-polos.jpg', caption: 'Business Polos', tag: 'Embroidery' },
  { src: CDN + '/gallery/event-merch.jpg', caption: 'Event Merchandise', tag: 'Screen Print' },
];

export default function RecentWorkGallery() {
  return (
    <section className="py-14 md:py-20 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <p className="text-sm font-semibold text-orange-500 uppercase tracking-wider mb-2">Real Results</p>
          <h2 className="font-display text-2xl md:text-3xl font-bold text-gray-900">
            Recent Work
          </h2>
          <p className="text-gray-500 mt-2 max-w-lg mx-auto">Custom prints for churches, schools, businesses, and families across South Atlanta.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          {gallery.map((item) => (
            <div key={item.caption} className="group relative rounded-xl overflow-hidden aspect-square bg-gray-100">
              <img
                src={item.src}
                alt={item.caption}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
                onError={(e) => {
                  // Show placeholder if image doesn't exist yet
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  target.parentElement!.classList.add('flex', 'items-center', 'justify-center');
                  const placeholder = document.createElement('div');
                  placeholder.className = 'flex flex-col items-center gap-2 text-gray-300';
                  placeholder.innerHTML = '<svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg><span class="text-xs font-medium">Photo Coming Soon</span>';
                  target.parentElement!.appendChild(placeholder);
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-full group-hover:translate-y-0 transition-transform">
                <span className="text-xs font-semibold text-orange-400 uppercase tracking-wider">{item.tag}</span>
                <p className="text-white font-semibold text-sm">{item.caption}</p>
              </div>
              {/* Always-visible caption on mobile */}
              <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm py-2 px-3 md:hidden">
                <p className="text-xs font-semibold text-gray-900 text-center">{item.caption}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
