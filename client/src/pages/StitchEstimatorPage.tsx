import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import StitchEstimator from '@/components/admin/StitchEstimator';

export default function StitchEstimatorPage() {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let active = true;
    const token = localStorage.getItem('tsb_token');
    const signIn = () => { if (active) navigate('/auth?redirect=/stitch-estimator&reason=admin', { replace: true }); };
    if (!token) { signIn(); return; }
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(user => { if (!active) return; if (user.role === 'admin') setAllowed(true); else signIn(); })
      .catch(signIn);
    return () => { active = false; };
  }, [navigate]);
  return <main className="min-h-screen bg-gray-50 px-4 py-6 sm:py-10">
    <Helmet><title>Stitch Estimator | T-Shirt Brothers</title><meta name="robots" content="noindex,nofollow" /></Helmet>
    <div className="mx-auto max-w-5xl"><Link to="/admin?section=embroidery" className="mb-6 inline-block text-sm font-semibold text-orange-700">← T-Shirt Brothers admin</Link>
      {allowed ? <StitchEstimator /> : <p role="status">Checking your sign-in…</p>}
    </div>
  </main>;
}
