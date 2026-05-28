import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Shell from '../components/layout/Shell'
import Topbar from '../components/layout/Topbar'
import Toggle from '../components/ui/Toggle'
import styles from './Parametres.module.css'

const TABS = ['Profil', 'Sécurité', 'Notifications', 'Langue & affichage', 'Compte', "Notice d'utilisation"]

const NOTIF_ITEMS = [
  { id: 'turn',    label: "C'est ton tour au baby" },
  { id: 'bet',     label: 'Résultat de pari' },
  { id: 'tourney', label: 'Tournoi — rappel' },
  { id: 'season',  label: 'Fin de saison' },
  { id: 'invite',  label: 'Demande de partie' },
]

const NOTICE_SECTIONS = [
  {
    title: '🏓 Jouer un match',
    body: "Rejoins la file d'attente depuis la page \"File d'attente\". Choisis ton mode (Chill ou Compétition), ton format (1v1, 2v2 ou Seul), puis attends qu'un adversaire soit disponible. Une notification te prévient quand ton match commence.",
  },
  {
    title: '🪙 Les jetons',
    body: 'Tu gagnes des jetons en jouant et en gagnant des matchs. Tu peux les utiliser pour parier sur les matchs des autres joueurs depuis la page Paris. Les jetons gagnés sur les paris sont crédités immédiatement.',
  },
  {
    title: '🏆 Les tournois',
    body: "Les tournois sont organisés par le BDE. Tu peux t'inscrire seul (liste d'attente pour former une équipe) ou avec un partenaire. Le format est en équipe de 2. Le bracket est révélé au démarrage du tournoi.",
  },
  {
    title: "📊 L'ELO",
    body: "L'ELO est ton score de classement. Il augmente quand tu gagnes et diminue quand tu perds. Les matchs en mode Chill n'affectent pas l'ELO. Le classement 1v1 et 2v2 sont indépendants.",
  },
  {
    title: "📅 Le Planning",
    body: "Depuis la page File d'attente, tu peux voir les matchs en cours et à venir. Le crayon dans ton créneau te permet de modifier ou annuler ton match. Tu peux aussi parier sur les matchs des autres en passant ta souris dessus.",
  },
]

const TAB_PARAM_MAP = { notice: "Notice d'utilisation" }

export default function Parametres() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const initialTab = TAB_PARAM_MAP[searchParams.get('tab')] ?? 'Profil'
  const [activeTab, setActiveTab] = useState(initialTab)

  useEffect(() => {
    const tab = TAB_PARAM_MAP[searchParams.get('tab')]
    if (tab) setActiveTab(tab)
  }, [searchParams])
  const [tfa,       setTfa]       = useState(false)
  const [oauth,     setOauth]     = useState(true)
  const [notifs,    setNotifs]    = useState({ turn:true, bet:true, tourney:false, season:true, invite:true })
  const [lang,      setLang]      = useState('FR')
  const [email,     setEmail]     = useState('')

  const toggleNotif = (id) => setNotifs(prev => ({ ...prev, [id]: !prev[id] }))

  return (
    <Shell>
      <Topbar title="Paramètres" titleSize={30} />
      <div className={styles.content}>
        <div className={styles.nav}>
          {TABS.map(tab => (
            <button
              key={tab}
              className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className={styles.panel}>
          {activeTab === 'Profil' && (
            <div>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Photo de profil</div>
                <div className={styles.avatarRow}>
                  <div className={styles.avatarPreview}>LT</div>
                  <div className={styles.avatarBtns}>
                    <button className={styles.btnSecondary}>Modifier</button>
                    <button className={styles.btnDanger}>Supprimer</button>
                  </div>
                </div>
              </div>
              <div className={styles.section}>
                <label className={styles.label}>Login 42</label>
                <input className={styles.inputLocked} value={user?.login ?? ''} readOnly />
              </div>
              <div className={styles.section}>
                <label className={styles.label}>Email</label>
                <input className={styles.input} value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <button className={styles.btnPrimary}>Sauvegarder les modifications</button>
            </div>
          )}

          {activeTab === 'Sécurité' && (
            <div>
              <div className={styles.section}>
                <button className={styles.btnSecondary}>Changer le mot de passe</button>
              </div>
              <div className={styles.toggleRow}>
                <div>
                  <div className={styles.toggleLabel}>Authentification 2FA</div>
                  <div className={styles.toggleSub}>Code par application ou SMS</div>
                </div>
                <Toggle on={tfa} onChange={setTfa} />
              </div>
              <div className={styles.toggleRow}>
                <div>
                  <div className={styles.toggleLabel}>OAuth 42</div>
                  <div className={styles.toggleSub}>Connexion via compte 42</div>
                </div>
                <Toggle on={oauth} onChange={setOauth} />
              </div>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Sessions actives</div>
                <button className={styles.btnDanger}>Déconnecter tout</button>
              </div>
            </div>
          )}

          {activeTab === 'Notifications' && (
            <div>
              {NOTIF_ITEMS.map(n => (
                <div key={n.id} className={styles.toggleRow}>
                  <div className={styles.toggleLabel}>{n.label}</div>
                  <Toggle on={notifs[n.id]} onChange={() => toggleNotif(n.id)} />
                </div>
              ))}
            </div>
          )}

          {activeTab === 'Langue & affichage' && (
            <div>
              <div className={styles.section}>
                <div className={styles.sectionTitle}>Langue</div>
                <div className={styles.langBtns}>
                  {['FR', 'EN', 'AR'].map(l => (
                    <button
                      key={l}
                      className={`${styles.langBtn} ${lang === l ? styles.langActive : ''}`}
                      onClick={() => setLang(l)}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.section}>
                <label className={styles.label}>Fuseau horaire</label>
                <input className={styles.input} defaultValue="Europe/Paris (UTC+2)" />
              </div>
            </div>
          )}

          {activeTab === 'Compte' && (
            <div>
              <div className={styles.section}>
                <button className={styles.btnSecondary}>Exporter mes données (RGPD) → JSON</button>
              </div>
              <div className={styles.section}>
                <a href="#" className={styles.link}>Politique de confidentialité</a>
              </div>
              <div className={styles.dangerZone}>
                <div className={styles.dangerTitle}>Zone dangereuse</div>
                <div className={styles.dangerRow}>
                  <div>
                    <div className={styles.dangerLabel}>Réinitialiser mes stats</div>
                    <div className={styles.dangerSub}>Supprime ton historique de matchs et ELO</div>
                  </div>
                  <button className={styles.btnDanger}>Réinitialiser</button>
                </div>
                <div className={styles.dangerRow}>
                  <div>
                    <div className={styles.dangerLabel}>Supprimer mon compte</div>
                    <div className={styles.dangerSub}>Confirmation envoyée par email</div>
                  </div>
                  <button className={styles.btnDangerFill}>Supprimer</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "Notice d'utilisation" && (
            <div>
              <div className={styles.noticeIntro}>
                Bienvenue sur Transcendance — le système de gestion des matchs de baby-foot de la promo 42.
                Voici comment utiliser le site.
              </div>
              {NOTICE_SECTIONS.map((s, i) => (
                <div key={i} className={styles.noticeSection}>
                  <div className={styles.noticeTitle}>{s.title}</div>
                  <div className={styles.noticeBody}>{s.body}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Shell>
  )
}
