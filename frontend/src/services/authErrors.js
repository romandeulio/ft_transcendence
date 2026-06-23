// Validation et traduction des erreurs d'authentification.
//
// Le backend renvoie des messages d'erreur en texte (champ `error`/`detail`
// pour login/2FA, erreurs DRF par champ pour register). On les mappe ici vers
// des clés i18n pour afficher des messages traduits, avec un repli générique.
// ⚠️ Les chaînes ci-dessous doivent rester synchronisées avec users/views.py
// et users/serializers.py côté backend.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(value) {
  return EMAIL_RE.test((value || '').trim())
}

// login + 2FA : code d'erreur stable renvoyé dans data.error (HTTP 200).
const LOGIN_ERROR_KEYS = {
  invalid_credentials: 'login.error',
  not_activated:       'login.errors.notActivated',
  invalid_code:        'login.errors.codeInvalid',
  code_expired:        'login.errors.codeExpired',
  send_error:          'login.errors.codeSendError',
}

export function loginErrorMessage(data, t) {
  const key = LOGIN_ERROR_KEYS[data?.error]
  return key ? t(key) : t('login.error')
}

// register : erreurs DRF par champ { champ: [message, ...] } (dans data.fields).
const REGISTER_FIELD_KEYS = {
  'Not a valid 42 login':    'register.errors.invalid42Login',
  'Username already in use': 'register.errors.usernameTaken',
  'Invalid email format':    'register.errors.invalidEmail',
  'Email already in use':    'register.errors.emailTaken',
  "Passwords don't match":   'register.passwordMismatch',
}

export function registerErrorMessage(fields, t) {
  if (!fields || typeof fields !== 'object') return t('register.errors.generic')
  // Ordre de priorité des champs pour le message affiché.
  for (const field of ['username', 'email', 'password', 'password2', 'non_field_errors']) {
    const val = fields[field]
    if (!val) continue
    const msg = Array.isArray(val) ? val[0] : val
    if (REGISTER_FIELD_KEYS[msg]) return t(REGISTER_FIELD_KEYS[msg])
    // Messages du validateur de mot de passe Django (variables) → message générique.
    if (field === 'password') return t('register.errors.weakPassword')
  }
  return t('register.errors.generic')
}
