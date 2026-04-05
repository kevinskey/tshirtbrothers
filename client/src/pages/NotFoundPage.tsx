import { Link } from 'react-router-dom';
import { Home } from 'lucide-react';
import Layout from '@/components/layout/Layout';

export default function NotFoundPage() {
  return (
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
        <p className="text-8xl font-display font-bold text-gray-200">404</p>
        <h1 className="mt-4 text-2xl font-display font-bold text-gray-900">Page not found</h1>
        <p className="mt-2 text-gray-500 max-w-md">
          The page you're looking for doesn't exist.
        </p>
        <Link
          to="/"
          className="mt-8 inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          <Home className="w-4 h-4" />
          Go Home
        </Link>
      </div>
    </Layout>
  );
}
