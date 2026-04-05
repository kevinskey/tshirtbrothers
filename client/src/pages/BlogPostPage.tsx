import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Layout from '@/components/layout/Layout';
import { fetchBlogPost } from '@/lib/api';
import { Loader2, ArrowLeft, Calendar, User, Share2, Check } from 'lucide-react';

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const [copied, setCopied] = useState(false);

  const { data: post, isLoading, error } = useQuery({
    queryKey: ['blog', 'post', slug],
    queryFn: () => fetchBlogPost(slug!),
    enabled: !!slug,
  });

  // SEO: Update document title and meta description
  useEffect(() => {
    if (post) {
      document.title = post.meta_title || `${post.title} | TShirt Brothers Blog`;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute('content', post.meta_description || post.excerpt || '');
      }
    }
    return () => {
      document.title = 'TShirt Brothers';
    };
  }, [post]);

  function formatDate(dateStr: string | null) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  function shareOnFacebook() {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`,
      '_blank',
      'width=600,height=400'
    );
  }

  function shareOnTwitter() {
    const text = post ? post.title : '';
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(window.location.href)}`,
      '_blank',
      'width=600,height=400'
    );
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="flex justify-center items-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </Layout>
    );
  }

  if (error || !post) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <h1 className="font-display text-3xl font-bold text-gray-900 mb-4">Post Not Found</h1>
          <p className="text-gray-500 mb-6">The blog post you are looking for does not exist.</p>
          <Link to="/blog" className="text-orange-600 hover:text-orange-700 font-medium">
            Back to Blog
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <article className="max-w-3xl mx-auto px-4 py-12">
        {/* Back link */}
        <Link
          to="/blog"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-orange-600 transition mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Blog
        </Link>

        {/* Cover image */}
        {post.cover_image && (
          <img
            src={post.cover_image}
            alt={post.title}
            className="w-full max-h-96 object-cover rounded-xl mb-8"
          />
        )}

        {/* Title */}
        <h1 className="font-display text-3xl md:text-4xl font-bold text-gray-900 mb-4">
          {post.title}
        </h1>

        {/* Meta info */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mb-6">
          <span className="flex items-center gap-1.5">
            <User className="w-4 h-4" />
            {post.author}
          </span>
          {post.published_at && (
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {formatDate(post.published_at)}
            </span>
          )}
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {post.tags.map((tag) => (
                <Link
                  key={tag}
                  to={`/blog?tag=${encodeURIComponent(tag)}`}
                  className="px-2.5 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full hover:bg-gray-200 transition"
                >
                  {tag}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Divider */}
        <hr className="border-gray-200 mb-8" />

        {/* Content */}
        <div
          className="prose prose-gray max-w-none prose-headings:font-display prose-a:text-orange-600 prose-img:rounded-lg"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        {/* Share buttons */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
              <Share2 className="w-4 h-4" />
              Share
            </span>
            <button
              onClick={shareOnFacebook}
              className="px-4 py-2 bg-[#1877f2] text-white text-sm rounded-lg hover:opacity-90 transition"
            >
              Facebook
            </button>
            <button
              onClick={shareOnTwitter}
              className="px-4 py-2 bg-black text-white text-sm rounded-lg hover:opacity-90 transition"
            >
              Twitter
            </button>
            <button
              onClick={copyLink}
              className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition flex items-center gap-1.5"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-green-600" />
                  Copied!
                </>
              ) : (
                'Copy Link'
              )}
            </button>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-12 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl p-8 text-center text-white">
          <h3 className="font-display text-2xl font-bold mb-2">Ready to Get Started?</h3>
          <p className="text-orange-100 mb-6">
            Get a free quote on your custom printing project today.
          </p>
          <Link
            to="/quote"
            className="inline-block bg-white text-orange-600 font-semibold px-8 py-3 rounded-lg hover:bg-gray-50 transition"
          >
            Get a Quote
          </Link>
        </div>
      </article>
    </Layout>
  );
}
