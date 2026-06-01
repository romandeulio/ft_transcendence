import styles from './Login.module.css'

export default function Login() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>⚽</div>
        <h1 className={styles.title}>BABYFOOT 42</h1>
        <p className={styles.sub}>Connecte-toi pour accéder à la plateforme</p>
        <button className={styles.btn42}>
          Se connecter avec 42
        </button>
        <div className={styles.divider}>ou</div>
        <input className={styles.input} placeholder="Email" type="email" />
        <input className={styles.input} placeholder="Mot de passe" type="password" />
        <button className={styles.btnLogin}>
          Connexion
        </button>
      </div>
    </div>
  )
}
