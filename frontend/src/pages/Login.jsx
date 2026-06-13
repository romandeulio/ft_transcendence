import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../components/ui/LanguageSwitcher'
import styles from './Login.module.css'
import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { authFetch } from '../services/api'

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
        credentials: 'same-origin',
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.detail || data.non_field_errors?.[0] || t('login.error'))
        return
      }
      const me = await authFetch('/api/auth/profile/')
      if (!me.ok) throw new Error('Profile unavailable')
      const user = await me.json()
      login(user)
      navigate('/accueil')
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
        <button className={styles.btn42} onClick={() => {window.location.href = "/api/auth/oauth/42/login/";}}>
          {t('login.loginWith42')}
        </button>
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
