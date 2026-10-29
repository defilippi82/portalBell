// src/components/HistorialView.jsx
import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig/firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc, 
  orderBy 
} from 'firebase/firestore';

export default function HistorialView({ usuarioLogueado }) {
  const [historial, setHistorial] = useState([]);
  const [apodoEditando, setApodoEditando] = useState(null);
  const [nuevoApodo, setNuevoApodo] = useState('');

  useEffect(() => {
    if (!usuarioLogueado?.unidadId) return;

    const q = query(
      collection(db, 'llamadas'),
      where('unidadId', '==', usuarioLogueado.unidadId),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const llamadas = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      setHistorial(llamadas);
    });

    return () => unsubscribe();
  }, [usuarioLogueado?.unidadId]);

  // Guardar o actualizar apodo en la llamada
  const guardarApodo = async (id) => {
    if (!nuevoApodo.trim()) return;

    try {
      await updateDoc(doc(db, 'llamadas', id), {
        apodoVisitante: nuevoApodo.trim()
      });
      setApodoEditando(null);
      setNuevoApodo('');
    } catch (error) {
      console.error('Error al actualizar apodo:', error);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '450px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h3>📋 Historial de Visitas</h3>

      {historial.length === 0 ? (
        <p style={{ color: '#888' }}>No hay registros de visitas aún.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {historial.map((item) => (
            <div key={item.id} style={{ padding: '12px', border: '1px solid #e0e0e0', borderRadius: '8px', backgroundColor: '#f9f9f9' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                <strong>
                  {item.apodoVisitante ? `🏷️ ${item.apodoVisitante}` : item.nombreVisitante}
                </strong>
                <span style={{ fontSize: '12px', color: '#888' }}>
                  {item.tipo === 'video' ? '📹 Video' : '💬 Chat'}
                </span>
              </div>

              <div style={{ fontSize: '12px', color: '#555', marginBottom: '8px' }}>
                Atendido por: {item.atendidoPor || 'Sin respuesta'} | Estado: <strong>{item.estado}</strong>
              </div>

              {/* Formulario rápido para asignar apodo */}
              {apodoEditando === item.id ? (
                <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
                  <input
                    type="text"
                    placeholder="Ej: Mamá, Tío..."
                    value={nuevoApodo}
                    onChange={(e) => setNuevoApodo(e.target.value)}
                    style={{ flex: 1, padding: '4px 8px', fontSize: '12px' }}
                  />
                  <button onClick={() => guardarApodo(item.id)} style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: '3px' }}>
                    OK
                  </button>
                  <button onClick={() => setApodoEditando(null)} style={{ padding: '4px 8px', fontSize: '12px', backgroundColor: '#6c757d', color: '#fff', border: 'none', borderRadius: '3px' }}>
                    X
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => { setApodoEditando(item.id); setNuevoApodo(item.apodoVisitante || ''); }} 
                  style={{ background: 'none', border: 'none', color: '#007bff', fontSize: '12px', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  {item.apodoVisitante ? 'Editar Apodo' : '+ Asignar Apodo (ej: Mamá)'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}