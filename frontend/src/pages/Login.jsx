import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../components/ui/LanguageSwitcher'
import styles from './Login.module.css'
import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const [form, setForm] = useState({
      email: "",
      password: "",
  });
  const [response, setResponse] = useState(null);
  const navigate = useNavigate();
  const handleChange = (e) => {
      setForm({
          ...form,
          [e.target.name]: e.target.value,
      });
  };
  const handleSubmit = async (e) => {
      e.preventDefault();

      try {
            const res = await fetch("/api/auth/login/", {
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
          if (res.ok && data.access) {
            localStorage.setItem("token", data.access);
            console.log("Login OK, token stocké:", data.access);
            //navigate("/profil");
            const me = await fetch("/api/auth/profile/", {
                headers: {
                    Authorization: `Bearer ${data.access}`,
                },
            });

            const user = await me.json();

            console.log(user);

            login(user);

            navigate("/profil");
            }
      } catch (err) {
          console.error(err);
      }
  };
    // Exemple simple pour tester le token
  const handleFetchMe = async () => {
    const token = localStorage.getItem("token");
    if (!token) return alert("Pas de token, login d'abord !");

    try {
      const res = await fetch("/api/me/", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      console.log("Données de l'utilisateur :", data);
      alert(JSON.stringify(data));
    } catch (err) {
      console.error(err);
    }
  };
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
          <button className={styles.btnLogin} type="submit">
            {t('login.submit')}
          </button>
        </form>
        <div className={styles.registerRow}>
          Pas encore de compte ?{' '}
          <Link to="/register" className={styles.registerLink}>S'inscrire</Link>
        </div>
      </div>
      {response && response.access && (
        <pre>Connecté !</pre>
      )}
    </div>
  );
}