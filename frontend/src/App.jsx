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
import Register    from './pages/Register'
import LoginSuccess from './pages/LoginSuccess'

//function PrivateRoute({ element }) { return element }
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
  const token = localStorage.getItem("token");
  if (!isTokenValid(token)) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    return <Navigate to="/login" replace />;
  }
  return element;
}

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
                <Route path="/login-success" element={<LoginSuccess />} />
                <Route path="/register"      element={<Register />} />
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
