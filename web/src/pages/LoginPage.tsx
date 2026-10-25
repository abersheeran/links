import { Eye, EyeOff, LoaderCircle, LockKeyhole } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { errorText } from '../lib/api';
import { LoadingScreen } from '../components/LoadingScreen';

export function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = '登录 · Links';
  }, []);

  if (status === 'loading') {
    return <LoadingScreen />;
  }
  if (status === 'authenticated') {
    return <Navigate to="/app" replace />;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await login(email, password);
      navigate('/app', { replace: true });
    } catch (requestError) {
      setError(errorText(requestError, '登录失败，请稍后再试。'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-panel-inner">
          <div className="login-heading">
            <span className="brand-mark" aria-hidden="true">
              <span />
              <span />
            </span>
            <h1>Links</h1>
            <p>{window.location.host}</p>
          </div>

          <form
            className="login-form"
            onSubmit={(event) => void handleSubmit(event)}
          >
            <label className="field">
              <span>邮箱</span>
              <input
                type="email"
                name="email"
                autoComplete="username"
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>密码</span>
              <div className="password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  placeholder="至少 12 个字符"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button
                  type="button"
                  className="icon-button password-toggle"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>

            {error.length > 0 ? (
              <div className="form-error" role="alert">
                {error}
              </div>
            ) : null}

            <button
              className="button button-primary login-submit"
              type="submit"
              disabled={submitting}
            >
              {submitting ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <LockKeyhole size={17} />
              )}
              {submitting ? '正在验证' : '进入控制台'}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
