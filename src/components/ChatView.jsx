// src/components/ChatView.jsx
import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig/firebase';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp, 
  doc, 
  updateDoc 
} from 'firebase/firestore';

export default function ChatView({ llamadaId, remitenteNombre, onFinalizar }) {
  const [mensajes, setMensajes] = useState([]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');

  // 1. Escuchar mensajes en tiempo real dentro de la llamada
  useEffect(() => {
    if (!llamadaId) return;

    const q = query(
      collection(db, 'llamadas', llamadaId, 'mensajes'),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const lista = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      setMensajes(lista);
    });

    return () => unsubscribe();
  }, [llamadaId]);

  // 2. Enviar mensaje
  const enviarMensaje = async (e) => {
    e.preventDefault();
    if (!nuevoMensaje.trim()) return;

    try {
      await addDoc(collection(db, 'llamadas', llamadaId, 'mensajes'), {
        texto: nuevoMensaje.trim(),
        remitente: remitenteNombre,
        timestamp: serverTimestamp()
      });
      setNuevoMensaje('');
    } catch (error) {
      console.error('Error al enviar mensaje:', error);
    }
  };

  // 3. Finalizar / Colgar chat
  const finalizarChat = async () => {
    try {
      await updateDoc(doc(db, 'llamadas', llamadaId), {
        estado: 'finalizado'
      });
      if (onFinalizar) onFinalizar();
    } catch (error) {
      console.error('Error al finalizar chat:', error);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '400px', maxWidth: '400px', margin: '0 auto', border: '1px solid #ccc', borderRadius: '8px', fontFamily: 'sans-serif', backgroundColor: '#fff' }}>
      
      {/* Cabecera del Chat */}
      <div style={{ padding: '10px 15px', backgroundColor: '#007bff', color: '#fff', borderTopLeftRadius: '8px', borderTopRightRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>💬 Chat Activo</span>
        <button onClick={finalizarChat} style={{ backgroundColor: '#dc3545', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
          Finalizar
        </button>
      </div>

      {/* Listado de Mensajes */}
      <div style={{ flex: 1, padding: '15px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: '#f9f9f9' }}>
        {mensajes.map((m) => {
          const esMio = m.remitente === remitenteNombre;
          return (
            <div key={m.id} style={{ alignSelf: esMio ? 'flex-end' : 'flex-start', maxWidth: '75%' }}>
              <div style={{ fontSize: '11px', color: '#666', marginBottom: '2px', textAlign: esMio ? 'right' : 'left' }}>
                {m.remitente}
              </div>
              <div style={{ padding: '8px 12px', borderRadius: '8px', backgroundColor: esMio ? '#dcf8c6' : '#fff', border: '1px solid #ddd', fontSize: '14px' }}>
                {m.texto}
              </div>
            </div>
          );
        })}
      </div>

      {/* Input para escribir */}
      <form onSubmit={enviarMensaje} style={{ display: 'flex', padding: '10px', borderTop: '1px solid #ccc', backgroundColor: '#fff' }}>
        <input
          type="text"
          placeholder="Escribí un mensaje..."
          value={nuevoMensaje}
          onChange={(e) => setNuevoMensaje(e.target.value)}
          style={{ flex: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '4px', outline: 'none' }}
        />
        <button type="submit" style={{ marginLeft: '8px', padding: '8px 15px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Enviar
        </button>
      </form>

    </div>
  );
}