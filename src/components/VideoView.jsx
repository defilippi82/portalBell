// src/components/VideoView.jsx
import React from 'react';
import { db } from '../firebaseConfig/firebase';
import { doc, updateDoc } from 'firebase/firestore';

export default function VideoView({ llamadaId, onFinalizar }) {
  const finalizarLlamada = async () => {
    try {
      await updateDoc(doc(db, 'llamadas', llamadaId), { estado: 'finalizado' });
      if (onFinalizar) onFinalizar();
    } catch (error) {
      console.error('Error al finalizar video:', error);
    }
  };

  return (
    <div style={{ textAlign: 'center', padding: '20px', maxWidth: '400px', margin: '0 auto', backgroundColor: '#222', color: '#fff', borderRadius: '8px', fontFamily: 'sans-serif' }}>
      <h3>📹 Videollamada Activa</h3>
      
      <div style={{ height: '250px', backgroundColor: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '15px 0', borderRadius: '6px' }}>
        <span style={{ color: '#aaa' }}>[ Streaming de Video / WebRTC ]</span>
      </div>

      <button
        onClick={finalizarLlamada}
        style={{ padding: '10px 20px', backgroundColor: '#dc3545', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
      >
        Colgar
      </button>
    </div>
  );
}