import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import VisitanteView from './components/VisitanteView';
import ResidenteView from './components/ResidenteView';
import UsuariosUFView from './components/UsuariosUFView';

// Componente para detectar si hay una sesión de residente guardada
function HomeRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    const ufGuardada = localStorage.getItem('portal_uf');
    const tokenGuardado = localStorage.getItem('portal_token');

    // Si el usuario ya abrió su link de residente en este celu, lo mandamos directo a su panel
    if (ufGuardada && tokenGuardado) {
      navigate(`/residente?uf=${ufGuardada}&token=${tokenGuardado}`, { replace: true });
    }
  }, [navigate]);

  return <VisitanteView />;
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/timbre" element={<VisitanteView />} />
        <Route path="/visitante" element={<VisitanteView />} />
        <Route path="/residente" element={<ResidenteView />} />
        <Route path="/administrador" element={<UsuariosUFView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}