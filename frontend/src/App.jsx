import { useEffect } from 'react';
import { Routes, Route, useLocation, Link } from 'react-router';
import HomePage from './pages/HomePage';
import PropertyPage from './pages/PropertyPage';
import CatalogoPage from './pages/CatalogoPage';
import AdminPage from './pages/AdminPage';
import SetupPage from './pages/SetupPage';
import ImpersonationBanner from './components/ImpersonationBanner';
import PagoPage from './pages/PagoPage';
import MiCuentaPage from './pages/MiCuentaPage';
import PropietarioLoginPage from './pages/PropietarioLoginPage';
import PropietarioPage from './pages/PropietarioPage';

function ScrollAlCambiarRuta() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    // Un efecto sólo puede devolver una función de limpieza (o nada): no retornamos el resultado de scrollTo
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    try {
      document.querySelector(hash)?.scrollIntoView();
    } catch {
      /* hash que no es un selector válido */
    }
  }, [pathname, hash]);
  return null;
}

function NoEncontrada() {
  return (
    <div className="grid min-h-screen place-items-center p-6 text-center">
      <div>
        <p className="text-6xl font-extrabold text-brand-700">404</p>
        <p className="mt-2 text-slate-600">Esta página no existe.</p>
        <Link to="/" className="mt-4 inline-block font-semibold text-brand-700 hover:underline">Volver al inicio</Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <>
      <ScrollAlCambiarRuta />
      {/* Modo "ver como usuario": sólo aparece al impersonar o con sesión de admin en /mi-cuenta y /propietario */}
      <ImpersonationBanner />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/propiedades" element={<CatalogoPage />} />
        <Route path="/propiedad/:id" element={<PropertyPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/admin/propiedades/nueva" element={<AdminPage abrirWizard />} />
        <Route path="/admin/setup" element={<SetupPage />} />
        <Route path="/pago/:codigo" element={<PagoPage />} />
        <Route path="/mi-cuenta" element={<MiCuentaPage />} />
        <Route path="/propietarios/login" element={<PropietarioLoginPage />} />
        <Route path="/propietario" element={<PropietarioPage />} />
        <Route path="*" element={<NoEncontrada />} />
      </Routes>
    </>
  );
}
