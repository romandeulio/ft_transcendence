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
        credentials: 'include',
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.error === 'banned' && data.ban) {
          const ban = data.ban
          if (ban.type === 'permanent') {
            navigate('/banned?type=permanent')
          } else {
            navigate(`/banned?type=temporary&until=${encodeURIComponent(ban.until)}`)
          }
          return
        }
        setError(data.detail || data.error || data.non_field_errors?.[0] || t('login.error'))
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

  const bgItems = [
    { icon: '⚽', top: '8%',  left: '5%',  size: 28, delay: 0   },
    { icon: '🥅', top: '15%', left: '88%', size: 32, delay: 1.2 },
    { icon: '🏆', top: '70%', left: '7%',  size: 26, delay: 2.1 },
    { icon: '⚽', top: '80%', left: '85%', size: 30, delay: 0.7 },
    { icon: '🥅', top: '45%', left: '92%', size: 24, delay: 1.8 },
    { icon: '⚽', top: '55%', left: '2%',  size: 22, delay: 3.0 },
    { icon: '🏆', top: '30%', left: '91%', size: 28, delay: 0.4 },
    { icon: '⚽', top: '90%', left: '40%', size: 20, delay: 2.5 },
    { icon: '🥅', top: '5%',  left: '55%', size: 26, delay: 1.5 },
    { icon: '🏆', top: '88%', left: '62%', size: 22, delay: 3.3 },
    { icon: '⚽', top: '22%', left: '18%', size: 24, delay: 0.9 },
    { icon: '🥅', top: '60%', left: '78%', size: 28, delay: 2.7 },
    { icon: '🏆', top: '42%', left: '12%', size: 20, delay: 1.1 },
    { icon: '⚽', top: '35%', left: '75%', size: 26, delay: 3.5 },
    { icon: '🥅', top: '75%', left: '30%', size: 22, delay: 0.3 },
    { icon: '🏆', top: '12%', left: '35%', size: 30, delay: 2.0 },
    { icon: '⚽', top: '65%', left: '50%', size: 18, delay: 1.6 },
    { icon: '🥅', top: '95%', left: '15%', size: 24, delay: 3.8 },
    { icon: '🏆', top: '50%', left: '60%', size: 20, delay: 0.6 },
    { icon: '⚽', top: '25%', left: '48%', size: 22, delay: 2.9 },
  ]

  return (
    <div className={styles.page}>
      {bgItems.map((item, i) => (
        <span
          key={i}
          className={styles.bgItem}
          style={{
            top: item.top,
            left: item.left,
            fontSize: item.size,
            animationDelay: `${item.delay}s`,
          }}
        >
          {item.icon}
        </span>
      ))}
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
