// src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import VisitanteView from './components/VisitanteView';
import ResidenteView from './components/ResidenteView';
import HistorialView from './components/HistorialView';
import UsuariosUFView from './components/UsuariosUFView';

export default function App() {
  const usuarioMock = {
    uid: 'user_123',
    nombre: 'Federico',
    unidadId: '2_A',
    prioridad: 1,
    esPrincipal: true
  };

  return (
    <Router>
      <Routes>
        <Route path="/" element={<VisitanteView />} />
        <Route path="/timbre" element={<VisitanteView />} />
        <Route path="/residente" element={<ResidenteView usuarioLogueado={usuarioMock} />} />
        <Route path="/historial" element={<HistorialView usuarioLogueado={usuarioMock} />} />
        <Route path="/administrador" element={<UsuariosUFView usuarioLogueado={usuarioMock} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}