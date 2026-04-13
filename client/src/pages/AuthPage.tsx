import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Mail, Lock, User } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { login, register } from '@/lib/api';

type Tab = 'login' | 'register';

const BOT_IMG = 'https://tshirtbrothers.atl1.cdn.digitaloceanspaces.com/tee-bot-nobg.png';

function BotMascot({ size = 120 }: { size?: number }) {
  return (
    <img
      src={BOT_IMG}
      alt="Tee - AI Assistant"
      width={size}
      style={{ height: 'auto', filter: 'drop-shadow(0 8px 24px rgba(249,115,22,0.25))' }}
    />
  );
}

export default function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/';
  const reason = searchParams.get('reason'); // 'quote' or 'design'
  const [activeTab, setActiveTab] = useState<Tab>('register');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Login fields
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register fields
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');

  const registerMessage = reason === 'design'
    ? "Let me know who you are before we start designing! 🎨"
    : reason === 'quote'
      ? "Let me know who you are so I can send you a quote! 📋"
      : "Let me know who you are before we get started! 👋";

  const botMessage = activeTab === 'login'
    ? "Welcome back! Good to see you again! 😊"
    : registerMessage;

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token } = await login({ email: loginEmail, password: loginPassword });
      localStorage.setItem('tsb_token', token);
      navigate(loginEmail === 'kevin@tshirtbrothers.com' ? '/admin' : redirectTo);
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
    if (regPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      const { token } = await register({ name: regName, email: regEmail, password: regPassword, phone: regPhone });
      localStorage.setItem('tsb_token', token);
      navigate(redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "w-full rounded-xl border-2 border-gray-200 px-4 py-3.5 text-base focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition";

  return (
    <Layout>
      <div className="bg-white min-h-[80vh]">
      <div className="max-w-md sm:max-w-lg lg:max-w-5xl mx-auto pt-8 sm:pt-12 pb-16 px-4 lg:px-8">
        {/* Mobile only: small bot + speech bubble above form */}
        <div className="flex flex-col items-center mb-6 lg:hidden">
          <BotMascot size={80} />
          <div className="bg-white border border-orange-200 rounded-2xl px-5 py-3 shadow-md -mt-2 relative">
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-l border-t border-orange-200 rotate-45" />
            <p className="text-sm font-semibold text-gray-900 text-center relative">
              {botMessage}
            </p>
          </div>
        </div>

        <div className="lg:flex lg:items-start lg:justify-center lg:gap-8">
        {/* Auth form card */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-lg overflow-hidden lg:max-w-2xl lg:flex-shrink-0">
          {/* Tab Toggle */}
          <div className="flex border-b border-gray-200">
            <button
              type="button"
              onClick={() => { setActiveTab('register'); setError(''); }}
              className={`flex-1 py-4 text-base font-semibold text-center transition-colors ${
                activeTab === 'register'
                  ? 'text-orange-600 border-b-2 border-orange-500 bg-orange-50/50'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              I'm New Here
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('login'); setError(''); }}
              className={`flex-1 py-4 text-base font-semibold text-center transition-colors ${
                activeTab === 'login'
                  ? 'text-orange-600 border-b-2 border-orange-500 bg-orange-50/50'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Welcome Back
            </button>
          </div>

          <div className="p-6 sm:p-8 lg:p-10">
            {/* Error Alert */}
            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Register Form (default) */}
            {activeTab === 'register' && (
              <form onSubmit={handleRegister} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="reg-name" className="block text-sm font-semibold text-gray-700 mb-1.5">
                      <User className="inline w-3 h-3 mr-1 -mt-0.5" />Your Name
                    </label>
                    <input
                      id="reg-name" type="text" required value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      className={inputClass} placeholder="First and last name"
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-email" className="block text-sm font-semibold text-gray-700 mb-1.5">
                      <Mail className="inline w-3 h-3 mr-1 -mt-0.5" />Email
                    </label>
                    <input
                      id="reg-email" type="email" required value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className={inputClass} placeholder="you@example.com"
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="reg-phone" className="block text-sm font-semibold text-gray-700 mb-1.5">
                    📱 Phone (optional)
                  </label>
                  <input
                    id="reg-phone" type="tel" value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    className={inputClass} placeholder="(555) 555-5555"
                    style={{ fontSize: '16px' }}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="reg-password" className="block text-sm font-semibold text-gray-700 mb-1.5">
                      <Lock className="inline w-3 h-3 mr-1 -mt-0.5" />Create Password
                    </label>
                    <input
                      id="reg-password" type="password" required value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className={inputClass} placeholder="At least 6 characters"
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-confirm" className="block text-sm font-semibold text-gray-700 mb-1.5">
                      <Lock className="inline w-3 h-3 mr-1 -mt-0.5" />Confirm Password
                    </label>
                    <input
                      id="reg-confirm" type="password" required value={regConfirm}
                      onChange={(e) => setRegConfirm(e.target.value)}
                      className={inputClass} placeholder="Type it again"
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                </div>
                <button
                  type="submit" disabled={loading}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-4 rounded-xl text-base transition-colors disabled:opacity-50 shadow-lg shadow-orange-500/25 mt-2"
                >
                  {loading ? 'Creating account...' : "Let's Go! 🚀"}
                </button>
                <p className="text-center text-xs text-gray-400 mt-2">
                  Already have an account?{' '}
                  <button type="button" onClick={() => { setActiveTab('login'); setError(''); }}
                    className="text-orange-600 hover:text-orange-700 font-semibold">
                    Log in
                  </button>
                </p>
              </form>
            )}

            {/* Login Form */}
            {activeTab === 'login' && (
              <form onSubmit={handleLogin} className="space-y-6 lg:min-h-[300px]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="login-email" className="block text-sm font-semibold text-gray-700 mb-1.5">
                      <Mail className="inline w-3 h-3 mr-1 -mt-0.5" />Email
                    </label>
                    <input
                      id="login-email" type="email" required value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className={inputClass} placeholder="you@example.com"
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                  <div>
                    <label htmlFor="login-password" className="block text-sm font-semibold text-gray-700 mb-1.5">
                      <Lock className="inline w-3 h-3 mr-1 -mt-0.5" />Password
                    </label>
                    <input
                      id="login-password" type="password" required value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className={inputClass} placeholder="Your password"
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                </div>
                <button
                  type="submit" disabled={loading}
                  className="w-full bg-gray-900 hover:bg-gray-800 text-white font-bold py-4 rounded-xl text-base transition-colors disabled:opacity-50 mt-2"
                >
                  {loading ? 'Signing in...' : 'Welcome Back! 👋'}
                </button>
                <p className="text-center text-xs text-gray-400 mt-2">
                  New here?{' '}
                  <button type="button" onClick={() => { setActiveTab('register'); setError(''); }}
                    className="text-orange-600 hover:text-orange-700 font-semibold">
                    Create an account
                  </button>
                </p>
              </form>
            )}
          </div>
        </div>
        {/* Large freestanding bot — beside the card, not inside it */}
        <div className="hidden lg:flex flex-col items-center flex-shrink-0">
          <div className="bg-white border border-orange-200 rounded-2xl px-5 py-3 shadow-lg mb-3">
            <p className="text-sm font-semibold text-gray-900 text-center leading-snug max-w-[220px]">
              {botMessage}
            </p>
          </div>
          <BotMascot size={340} />
        </div>
        </div>

        <p className="text-center text-[10px] text-gray-400 mt-4">
          By creating an account you agree to our terms of service.
          <br />Questions? Call <a href="tel:+14706224845" className="text-orange-500">(470) 622-4845</a>
        </p>
      </div>
      </div>
    </Layout>
  );
}
