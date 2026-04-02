import { Link } from 'react-router-dom';

export default function BottomCTA() {
  return (
    <section className="py-14 md:py-20 bg-gray-900">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16">
          {/* Left: We'll Do the Work */}
          <div>
            <h2 className="font-display text-2xl md:text-3xl font-bold text-white mb-4">
              We&apos;ll Do the Work
            </h2>
            <p className="text-gray-400 leading-relaxed mb-6">
              Not sure where to start? Our team of design experts is ready to
              help bring your vision to life. Whether it&apos;s custom t-shirts
              for your team, branded merchandise for your business, or
              personalized gifts, we handle everything from design to delivery.
            </p>
            <Link
              to="/design"
              className="inline-flex items-center justify-center bg-red-600 text-white font-semibold px-6 py-3 rounded-lg hover:bg-red-700 transition-colors"
            >
              Start Designing
            </Link>
          </div>

          {/* Right: Satisfaction Guarantee */}
          <div>
            <h2 className="font-display text-2xl md:text-3xl font-bold text-white mb-4">
              Our Satisfaction Guarantee
            </h2>
            <p className="text-gray-400 leading-relaxed mb-6">
              We stand behind every order. If you&apos;re not 100% happy with
              your custom products, we&apos;ll make it right. Our dedicated
              support team ensures your experience is seamless from start to
              finish. Quality products, on-time delivery, guaranteed.
            </p>
            <Link
              to="/quote"
              className="inline-flex items-center justify-center bg-white text-gray-900 font-semibold px-6 py-3 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Get a Quote
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
