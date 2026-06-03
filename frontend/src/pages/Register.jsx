/*import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Register() {
  const { register } = useAuth()
  const navigate     = useNavigate()

  const [form, setForm]     = useState({ username: '', email: '', password: '' })
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  const handleRegister = async () => {
    setLoading(true)
    setError('')
    try {
      await register(form)
      navigate('/accueil')
    } catch (err) {
      const msg = err.email?.[0] || err.username?.[0] || err.password?.[0] || err.detail || 'Erreur'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: '400px', padding: '2rem', border: '1px solid #e5e7eb', borderRadius: '12px' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>Créer un compte</h1>

        <input
          placeholder="Nom d'utilisateur"
          type="text"
          value={form.username}
          onChange={set('username')}
          style={{ width: '100%', padding: '10px', marginBottom: '1rem', boxSizing: 'border-box', borderRadius: '8px', border: '1px solid #d1d5db' }}
        />
        <input
          placeholder="Email"
          type="email"
          value={form.email}
          onChange={set('email')}
          style={{ width: '100%', padding: '10px', marginBottom: '1rem', boxSizing: 'border-box', borderRadius: '8px', border: '1px solid #d1d5db' }}
        />
        <input
          placeholder="Mot de passe"
          type="password"
          value={form.password}
          onChange={set('password')}
          style={{ width: '100%', padding: '10px', marginBottom: '1rem', boxSizing: 'border-box', borderRadius: '8px', border: '1px solid #d1d5db' }}
        />

        {error && (
          <p style={{ color: '#ef4444', fontSize: '13px', textAlign: 'center', marginBottom: '1rem' }}>
            {error}
          </p>
        )}

        <button
          onClick={handleRegister}
          disabled={loading}
          style={{ width: '100%', padding: '10px', background: '#111', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
        >
          {loading ? 'Création...' : 'Créer le compte'}
        </button>

        <p style={{ textAlign: 'center', fontSize: '13px', marginTop: '1rem' }}>
          Déjà un compte ?{' '}
          <span style={{ color: '#3b82f6', cursor: 'pointer' }} onClick={() => navigate('/login')}>
            Se connecter
          </span>
        </p>
      </div>
    </div>
  )
}*/

import { useState } from "react";

export default function Register() {
    const [form, setForm] = useState({
        username: "",
        email: "",
        password: "",
    });

    const [response, setResponse] = useState(null);

    const handleChange = (e) => {
        setForm({
            ...form,
            [e.target.name]: e.target.value,
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
              const res = await fetch("/api/auth/register/", {
                  method: "POST",
                  headers: {
                      "Content-Type": "application/json",
                  },
                  body: JSON.stringify(form),
              });

            const data = await res.json();

            console.log("STATUS:", res.status);
            console.log("DATA:", data);

            setResponse(data);
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div style={{ padding: "2rem" }}>
            <h1>Register Test</h1>

            <form onSubmit={handleSubmit}>
                <div>
                    <input
                        type="text"
                        name="username"
                        placeholder="42 login"
                        value={form.username}
                        onChange={handleChange}
                    />
                </div>

                <div>
                    <input
                        type="email"
                        name="email"
                        placeholder="email"
                        value={form.email}
                        onChange={handleChange}
                    />
                </div>

                <div>
                    <input
                        type="password"
                        name="password"
                        placeholder="password"
                        value={form.password}
                        onChange={handleChange}
                    />
                </div>

                <button type="submit">
                    Register
                </button>
            </form>

            {response && (
                <pre>
                    {JSON.stringify(response, null, 2)}
                </pre>
            )}
        </div>
    );
}