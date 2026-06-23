import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../components/ui/LanguageSwitcher'
import { isValidEmail, registerErrorMessage } from '../services/authErrors'
import styles from './Register.module.css'

export default function Register() {
  const { t } = useTranslation()
  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    password2: "",
  });
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Validations côté client : message traduit, pas de requête inutile.
    if (!isValidEmail(form.email)) {
      setError(t('register.errors.invalidEmail'));
      return;
    }
    if (form.password !== form.password2) {
      setError(t('register.passwordMismatch'));
      return;
    }
    try {
      const res = await fetch("/api/auth/register/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      // Erreurs de validation : renvoyées en HTTP 200 (data.error === 'validation').
      if (data.error === 'validation') {
        setError(registerErrorMessage(data.fields, t));
      } else if (res.ok && data.message) {
        setResponse(data);
        setTimeout(() => navigate("/login"), 5000);
      } else {
        setError(t('register.networkError'));
      }
    } catch (err) {
      setError(t('register.networkError'));
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.langBar}>
        <LanguageSwitcher />
      </div>
      <div className={styles.card}>
        <div className={styles.logo}>⚽</div>
        <h1 className={styles.title}>{t('register.title')}</h1>
        <p className={styles.sub}>{t('register.subtitle')}</p>

        {response?.message ? (
          <div className={styles.successMsg}>
            {t('register.success')}<br />
            <span className={styles.successSub}>{t('register.successRedirect')}</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form} noValidate>
            <input
              className={styles.input}
              placeholder={t('register.login42')}
              type="text"
              name="username"
              value={form.username}
              onChange={handleChange}
              required
            />
            <input
              className={styles.input}
              placeholder={t('register.email')}
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
            />
            <input
              className={styles.input}
              placeholder={t('register.password')}
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
            />
            <input
              className={styles.input}
              placeholder={t('register.confirmPassword')}
              type="password"
              name="password2"
              value={form.password2}
              onChange={handleChange}
              required
            />
            {error && <div className={styles.errorMsg}>{error}</div>}
            <button className={styles.btnRegister} type="submit">
              {t('register.submit')}
            </button>
          </form>
        )}

        <div className={styles.loginRow}>
          {t('register.alreadyAccount')}{' '}
          <Link to="/login" className={styles.loginLink}>{t('register.loginLink')}</Link>
        </div>
      </div>
    </div>
  );
}
