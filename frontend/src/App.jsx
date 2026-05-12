import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider }  from './context/AuthContext'
import { NotifProvider } from './context/NotifContext'
import { BetsProvider }  from './context/BetsContext'
import Status from './pages/Status'
import Accueil     from './pages/Accueil'
import Classement  from './pages/Classement'
import Paris       from './pages/Paris'
import Planning    from './pages/Planning'
import Tournois    from './pages/Tournois'
import Profil      from './pages/Profil'
import Parametres  from './pages/Parametres'
import Login       from './pages/Login'

function PrivateRoute({ element }) { return element }

export default function App() {
  return (
    <AuthProvider>
      <NotifProvider>
        <BetsProvider>
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
            </Routes>
          </BrowserRouter>
        </BetsProvider>
      </NotifProvider>
      <Status />
    </AuthProvider>
  )
}