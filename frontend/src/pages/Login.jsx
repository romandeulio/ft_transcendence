import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../components/ui/LanguageSwitcher'
import styles from './Login.module.css'
import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  const handleChange = (e) => {
    setError(null)
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      const res = await fetch('/api/auth/login/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.detail || data.non_field_errors?.[0] || t('login.error'))
        return
      }
      if (data.access) {
        localStorage.setItem('token', data.access)
        const me = await fetch('/api/auth/profile/', {
          headers: { Authorization: `Bearer ${data.access}` },
        })
        const user = await me.json()
        login(user)
        navigate('/profil')
      }
    } catch {
      setError(t('login.networkError'))
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.langBar}>
        <LanguageSwitcher />
      </div>
      <div className={styles.card}>
        <div className={styles.logo}>⚽</div>
        <h1 className={styles.title}>{t('login.title')}</h1>
        <p className={styles.sub}>{t('login.subtitle')}</p>
        <a href="https://api.intra.42.fr/oauth/authorize?client_id=u-s4t2ud-29dcfe906e0f8b18e2511684727174672ce9648b697ddb278b04095f22bdebae&redirect_uri=https%3A%2F%2Flocalhost%2Fapi%2Fauth%2Foauth%2F42%2Fcallback%2F&response_type=code">
          <button className={styles.btn42}>{t('login.loginWith42')}</button>
        </a>
        <div className={styles.divider}>{t('login.or')}</div>
        <form onSubmit={handleSubmit}>
          <input
            className={styles.input}
            placeholder={t('login.email')}
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
          />
          <input
            className={styles.input}
            placeholder={t('login.password')}
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
          />
          {error && <div className={styles.error}>{error}</div>}
          <button className={styles.btnLogin} type="submit">
            {t('login.submit')}
          </button>
        </form>
        <div className={styles.registerRow}>
          {t('login.noAccount')}{' '}
          <Link to="/register" className={styles.registerLink}>{t('login.registerLink')}</Link>
        </div>
      </div>
    </div>
  )
}