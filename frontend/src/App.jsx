import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
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

function PrivateRoute({ element }) { return element }

export default function App() {
  return (
    <AuthProvider>
      <NotifProvider>
        <BetsProvider>
          <QueueProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/"              element={<Navigate to="/accueil" replace />} />
                <Route path="/accueil"       element={<PrivateRoute element={<Accueil />} />} />
                <Route path="/classement"    element={<PrivateRoute element={<Classement />} />} />
                <Route path="/paris"         element={<PrivateRoute element={<Paris />} />} />
                <Route path="/planning"      element={<PrivateRoute element={<Planning />} />} />
                <Route path="/tournois"      element={<PrivateRoute element={<Tournois />} />} />
                <Route path="/profil"        element={<PrivateRoute element={<Profil />} />} />
                <Route path="/parametres"    element={<PrivateRoute element={<Parametres />} />} />
                <Route path="/login"         element={<Login />} />
                <Route path="/admin"         element={<Admin />} />
                <Route path="/ticket"        element={<Ticket />} />
                <Route path="/status"        element={<Status />} />
              </Routes>
            </BrowserRouter>
          </QueueProvider>
        </BetsProvider>
      </NotifProvider>
    </AuthProvider>
  )
}
