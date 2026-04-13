import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import GangSheetBuilder from '@/components/gangsheet/GangSheetBuilder';

export default function GangSheetPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('tsb_token');
    if (!token) {
      navigate('/auth?redirect=/admin/gangsheet&reason=admin');
      return;
    }
    // Verify admin
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(user => {
        if (user.role !== 'admin') {
          navigate('/auth?reason=admin');
        } else {
          setChecking(false);
        }
      })
      .catch(() => navigate('/auth?redirect=/admin/gangsheet&reason=admin'));
  }, [navigate]);

  if (checking) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return <GangSheetBuilder />;
}
