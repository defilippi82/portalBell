// src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import VisitanteView from './components/VisitanteView';
import ResidenteView from './components/ResidenteView';
import UsuariosUFView from './components/UsuariosUFView';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<VisitanteView />} />
        <Route path="/timbre" element={<VisitanteView />} />
        <Route path="/visitante" element={<VisitanteView />} />
        <Route path="/residente" element={<ResidenteView />} />
        <Route path="/administrador" element={<UsuariosUFView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}