import { Link } from 'react-router-dom';

const CDN = 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com';

const jobs = [
  {
    img: CDN + '/gallery/church-ministry.jpg',
    title: 'Church Retreat Shirts',
    tag: 'Screen Print',
    location: 'Fairburn, GA',
    category: 'church',
  },
  {
    img: CDN + '/gallery/school-spirit.jpg',
    title: 'High School Spirit Wear',
    tag: 'DTF Transfer',
    location: 'Tyrone, GA',
    category: 'school',
    featured: true,
  },
  {
    img: CDN + '/gallery/sports-league.jpg',
    title: 'Team Uniforms & Jerseys',
    tag: 'Screen Print',
    location: 'Peachtree City, GA',
    category: 'sports',
  },
  {
    img: CDN + '/gallery/family-reunion.jpg',
    title: 'Family Reunion Tees',
    tag: 'DTF Transfer',
    location: 'Union City, GA',
    category: 'event',
  },
  {
    img: CDN + '/gallery/business-polos.jpg',
    title: 'Corporate Polos',
    tag: 'Embroidery',
    location: 'Newnan, GA',
    category: 'business',
  },
];

export default function LocalJobsGallery() {
  return (
    <section className="py-10 md:py-16 bg-white" id="portfolio">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8 md:mb-12">
          <p className="text-xs sm:text-sm font-semibold text-orange-500 uppercase tracking-wider mb-2">Local Work</p>
          <h2 className="font-display text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">
            Trusted by Businesses & Families Across South Atlanta
          </h2>
          <p className="text-gray-500 mt-2 max-w-lg mx-auto text-sm sm:text-base">
            From church retreats to team uniforms, we've printed for hundreds of local organizations in Fayette & South Fulton County.
          </p>
        </div>

        {/* Gallery grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
          {jobs.map((job) => (
            <div
              key={job.title}
              className={`group relative rounded-xl overflow-hidden bg-gray-100 ${
                job.featured ? 'col-span-2 md:col-span-1 row-span-1' : ''
              }`}
            >
              <div className="aspect-square">
                <img
                  src={job.img}
                  alt={job.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent) {
                      parent.classList.add('flex', 'items-center', 'justify-center', 'bg-gradient-to-br', 'from-orange-50', 'to-orange-100');
                      parent.innerHTML = `<div class="text-center p-4"><p class="text-2xl mb-2">${
                        job.category === 'church' ? '⛪' :
                        job.category === 'school' ? '🎓' :
                        job.category === 'sports' ? '⚽' :
                        job.category === 'event' ? '👨‍👩‍👧‍👦' : '💼'
                      }</p><p class="text-xs font-semibold text-gray-700">${job.title}</p><p class="text-[10px] text-gray-400">${job.tag}</p></div>`;
                    }
                  }}
                />
              </div>
              {/* Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="absolute bottom-0 left-0 right-0 p-2.5 sm:p-3 translate-y-full group-hover:translate-y-0 transition-transform duration-300">
                <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider">{job.tag}</span>
                <p className="text-white font-semibold text-xs sm:text-sm leading-tight">{job.title}</p>
                <p className="text-white/60 text-[10px]">{job.location}</p>
              </div>
              {/* Mobile always-visible caption */}
              <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm py-1.5 px-2 md:hidden">
                <p className="text-[10px] font-semibold text-gray-900 truncate">{job.title}</p>
                <p className="text-[9px] text-gray-500">{job.tag} · {job.location}</p>
              </div>
            </div>
          ))}
        </div>

        {/* School category link + CTA */}
        <div className="mt-6 md:mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
          <Link
            to="/shop?category=T-Shirts&search=school"
            className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white font-semibold px-5 py-2.5 sm:px-6 sm:py-3 rounded-lg transition-colors text-sm"
          >
            🎓 School & Class Shirts
          </Link>
          <Link
            to="/quote"
            className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-5 py-2.5 sm:px-6 sm:py-3 rounded-lg transition-colors text-sm shadow-lg shadow-orange-500/25"
          >
            Get a Free Quote
          </Link>
        </div>
      </div>
    </section>
  );
}
