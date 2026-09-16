import { useParams, Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { CheckCircle2 } from 'lucide-react';

// Where an already-accepted quote's accept link lands (the accept endpoint
// has always redirected here; the route just never existed — it 404'd).
export default function QuoteAcceptedPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <Layout>
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
        <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
        <h1 className="text-2xl font-display font-bold text-gray-900 mb-2">Order #{id} Is Already Underway</h1>
        <p className="text-gray-500 max-w-md mb-6">
          Your deposit is in and this order is moving — no need to accept it again.
          We'll email you a mockup to approve, and again when it's ready. Questions?
          Call (470) 622-1392.
        </p>
        <Link to="/account" className="inline-flex items-center justify-center bg-orange-700 hover:bg-orange-800 text-white font-semibold px-6 py-2.5 rounded-lg">
          View My Orders
        </Link>
      </div>
    </Layout>
  );
}
