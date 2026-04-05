import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, UserPlus, AlertCircle } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { login, register } from '@/lib/api';

type Tab = 'login' | 'register';

export default function AuthPage() {
  useEffect(() => {
    document.title = 'Sign In | TShirt Brothers';
  }, []);

  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register fields
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token } = await login({ email: loginEmail, password: loginPassword });
      localStorage.setItem('tsb_token', token);
      navigate('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (regPassword !== regConfirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const { token } = await register({ name: regName, email: regEmail, password: regPassword });
      localStorage.setItem('tsb_token', token);
      navigate('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <div className="max-w-md mx-auto mt-20 mb-20 px-4">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {/* Tab Toggle */}
          <div className="flex border-b border-gray-200">
            <button
              type="button"
              onClick={() => { setActiveTab('login'); setError(''); }}
              className={`flex-1 py-3.5 text-sm font-medium text-center transition-colors ${
                activeTab === 'login'
                  ? 'text-orange-600 border-b-2 border-orange-600 bg-orange-50/50'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <LogIn className="inline-block w-4 h-4 mr-1.5 -mt-0.5" />
              Log In
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('register'); setError(''); }}
              className={`flex-1 py-3.5 text-sm font-medium text-center transition-colors ${
                activeTab === 'register'
                  ? 'text-orange-600 border-b-2 border-orange-600 bg-orange-50/50'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <UserPlus className="inline-block w-4 h-4 mr-1.5 -mt-0.5" />
              Sign Up
            </button>
          </div>

          <div className="p-6">
            {/* Error Alert */}
            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Login Form */}
            {activeTab === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <input
                    id="login-password"
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition"
                    placeholder="Enter your password"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white font-medium py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Signing in...' : 'Log In'}
                </button>
                <p className="text-center text-sm text-gray-500">
                  Don't have an account?{' '}
                  <button
                    type="button"
                    onClick={() => { setActiveTab('register'); setError(''); }}
                    className="text-orange-600 hover:text-orange-700 font-medium"
                  >
                    Sign up
                  </button>
                </p>
              </form>
            )}

            {/* Register Form */}
            {activeTab === 'register' && (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label htmlFor="reg-name" className="block text-sm font-medium text-gray-700 mb-1">
                    Name
                  </label>
                  <input
                    id="reg-name"
                    type="text"
                    required
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition"
                    placeholder="Your full name"
                  />
                </div>
                <div>
                  <label htmlFor="reg-email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    required
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label htmlFor="reg-password" className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <input
                    id="reg-password"
                    type="password"
                    required
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition"
                    placeholder="Create a password"
                  />
                </div>
                <div>
                  <label htmlFor="reg-confirm" className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm Password
                  </label>
                  <input
                    id="reg-confirm"
                    type="password"
                    required
                    value={regConfirm}
                    onChange={(e) => setRegConfirm(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition"
                    placeholder="Confirm your password"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white font-medium py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Creating account...' : 'Create Account'}
                </button>
                <p className="text-center text-sm text-gray-500">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => { setActiveTab('login'); setError(''); }}
                    className="text-orange-600 hover:text-orange-700 font-medium"
                  >
                    Log in
                  </button>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
