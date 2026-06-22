import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { AuthProvider }  from './context/AuthContext'
import { NotifProvider } from './context/NotifContext'
import { BetsProvider }  from './context/BetsContext'
import { QueueProvider } from './context/QueueContext'
import Status from './pages/Status'
import Accueil     from './pages/Accueil'
import Classement  from './pages/Classement'
import Paris       from './pages/Paris'
import Planning    from './pages/Planning'
import Tournois    from './pages/Tournois'
import Profil      from './pages/Profil'
import Parametres  from './pages/Parametres'
import Login       from './pages/Login'
import Admin       from './pages/Admin'
import Ticket      from './pages/Ticket'
import Register    from './pages/Register'
import LoginSuccess from './pages/LoginSuccess'
import Banned         from './pages/Banned'
import Achievements   from './pages/Achievements'
import PrivacyPolicy  from './pages/PrivacyPolicy'
import TermsOfService from './pages/TermsOfService'
import ActivateAccount from './pages/ActivateAccount'

function isTokenValid(token) {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

function PrivateRoute({ element }) {
    const { user, authChecked } = useAuth()
    // On attend la validation du token avant de décider, sinon une session
    // résiduelle (cookie d'un user supprimé) afficherait brièvement la page.
    if (!authChecked) return null
    return user ? <QueueProvider><BetsProvider>{element}</BetsProvider></QueueProvider> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <NotifProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/"              element={<Navigate to="/profil" replace />} />
            <Route path="/accueil"       element={<PrivateRoute element={<Accueil />} />} />
            <Route path="/classement"    element={<PrivateRoute element={<Classement />} />} />
            <Route path="/paris"         element={<PrivateRoute element={<Paris />} />} />
            <Route path="/planning"      element={<PrivateRoute element={<Planning />} />} />
            <Route path="/tournois"      element={<PrivateRoute element={<Tournois />} />} />
            <Route path="/profil"        element={<PrivateRoute element={<Profil />} />} />
            <Route path="/achievements" element={<PrivateRoute element={<Achievements />} />} />
            <Route path="/parametres"    element={<PrivateRoute element={<Parametres />} />} />
            <Route path="/login"         element={<Login />} />
            <Route path="/login-success" element={<LoginSuccess />} />
            <Route path="/register"      element={<Register />} />
            <Route path="/banned"        element={<Banned />} />
            <Route path="/admin"         element={<Admin />} />
            <Route path="/ticket"        element={<PrivateRoute element={<Ticket />} />} />
            <Route path="/status"        element={<PrivateRoute element={<Status />} />} />
            <Route path="/privacy-policy"   element={<PrivateRoute element={<PrivacyPolicy />} />} />
            <Route path="/terms-of-service" element={<PrivateRoute element={<TermsOfService />} />} />
            <Route path="/activate/:uidb64/:token" element={<ActivateAccount />} />
          </Routes>
        </BrowserRouter>
      </NotifProvider>
    </AuthProvider>
  )
}
