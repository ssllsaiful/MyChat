'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const registerRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/accounts/register/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      });

      if (registerRes.ok) {
        // Auto-login after registration
        const loginRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/accounts/login/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        });

        if (loginRes.ok) {
          const loginData = await loginRes.json();
          const meRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/accounts/me/`, {
            headers: { 'Authorization': `Bearer ${loginData.access}` }
          });
          const meData = await meRes.json();
          login(loginData.access, meData);
        } else {
          router.push('/login');
        }
      } else {
        const data = await registerRes.json();
        const firstError = Object.values(data)[0];
        setError(Array.isArray(firstError) ? firstError[0] as string : 'Registration failed');
        setIsSubmitting(false);
      }
    } catch {
      setError('Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-bg">
      <div className="auth-card">
        <div className="auth-logo">MyChat</div>
        <h1 className="auth-title">Create an account</h1>
        <p className="auth-subtitle">Join and start chatting instantly</p>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input
              id="reg-username-input"
              className="form-input"
              type="text"
              placeholder="Choose a username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              id="reg-email-input"
              className="form-input"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              id="reg-password-input"
              className="form-input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <button id="register-btn" type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="auth-footer">
          Already have an account? <Link href="/login">Sign In</Link>
        </p>
      </div>
    </div>
  );
}
