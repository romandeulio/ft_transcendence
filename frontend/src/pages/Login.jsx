import styles from './Login.module.css'

export default function Login() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>⚽</div>
        <h1 className={styles.title}>BABYFOOT 42</h1>
        <p className={styles.sub}>Connecte-toi pour accéder à la plateforme</p>
        <a href="https://api.intra.42.fr/oauth/authorize?client_id=u-s4t2ud-29dcfe906e0f8b18e2511684727174672ce9648b697ddb278b04095f22bdebae&redirect_uri=https%3A%2F%2Flocalhost%2Fprofil&response_type=code">
        <button className={styles.btn42}>
          Se connecter avec 42
        </button>
        </a>
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
