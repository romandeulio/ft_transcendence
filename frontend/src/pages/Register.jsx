import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import styles from './Register.module.css'

export default function Register() {
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
    if (form.password !== form.password2) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    try {
      const res = await fetch("/api/auth/register/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      setResponse(data);
      if (res.ok) {
        setTimeout(() => navigate("/login"), 2000);
      } else {
        setError(data.detail || JSON.stringify(data));
      }
    } catch (err) {
      setError("Erreur réseau, réessaie plus tard.");
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>⚽</div>
        <h1 className={styles.title}>BABYFOOT 42</h1>
        <p className={styles.sub}>Crée ton compte pour rejoindre la plateforme</p>

        {response?.message ? (
          <div className={styles.successMsg}>
            {response.message}<br />
            <span className={styles.successSub}>Redirection vers la connexion…</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            <input
              className={styles.input}
              placeholder="Login 42"
              type="text"
              name="username"
              value={form.username}
              onChange={handleChange}
              required
            />
            <input
              className={styles.input}
              placeholder="Email"
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
            />
            <input
              className={styles.input}
              placeholder="Mot de passe"
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
            />
            <input
              className={styles.input}
              placeholder="Confirmer le mot de passe"
              type="password"
              name="password2"
              value={form.password2}
              onChange={handleChange}
              required
            />
            {error && <div className={styles.errorMsg}>{error}</div>}
            <button className={styles.btnRegister} type="submit">
              Créer mon compte
            </button>
          </form>
        )}

        <div className={styles.loginRow}>
          Déjà un compte ?{' '}
          <Link to="/login" className={styles.loginLink}>Se connecter</Link>
        </div>
      </div>
    </div>
  );
}
