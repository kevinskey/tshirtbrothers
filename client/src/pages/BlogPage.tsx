import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Layout from '@/components/layout/Layout';
import { fetchBlogPosts, type BlogPost } from '@/lib/api';
import { Loader2, Calendar, User } from 'lucide-react';

export default function BlogPage() {
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const { data: posts, isLoading } = useQuery({
    queryKey: ['blog', 'posts', activeTag],
    queryFn: () => fetchBlogPosts(activeTag || undefined),
  });

  const allTags = useMemo(() => {
    if (!posts) return [];
    const tagSet = new Set<string>();
    posts.forEach((p) => p.tags?.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [posts]);

  function formatDate(dateStr: string | null) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  return (
    <Layout>
      {/* Header */}
      <section className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white py-20">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">Blog</h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            Custom printing tips, guides, and industry insights
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 py-12">
        {/* Tag filters */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-8">
            <button
              onClick={() => setActiveTag(null)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                activeTag === null
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setActiveTag(tag)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                  activeTag === tag
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && posts && posts.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-500 text-lg">No blog posts yet. Check back soon!</p>
          </div>
        )}

        {/* Post grid */}
        {posts && posts.length > 0 && (
          <div className="grid md:grid-cols-2 gap-8">
            {posts.map((post: BlogPost) => (
              <Link
                key={post.id}
                to={`/blog/${post.slug}`}
                className="group bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
              >
                {/* Cover image */}
                {post.cover_image ? (
                  <img
                    src={post.cover_image}
                    alt={post.title}
                    className="w-full h-52 object-cover"
                  />
                ) : (
                  <div className="w-full h-52 bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center">
                    <span className="text-white/50 text-6xl font-display font-bold">TB</span>
                  </div>
                )}

                <div className="p-6">
                  <h2 className="font-display font-bold text-xl text-gray-900 group-hover:text-red-600 transition-colors mb-2 line-clamp-2">
                    {post.title}
                  </h2>

                  {post.excerpt && (
                    <p className="text-gray-500 text-sm line-clamp-2 mb-4">{post.excerpt}</p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
                    <span className="flex items-center gap-1">
                      <User className="w-3.5 h-3.5" />
                      {post.author}
                    </span>
                    {post.published_at && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatDate(post.published_at)}
                      </span>
                    )}
                  </div>

                  {post.tags && post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {post.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </Layout>
  );
}
