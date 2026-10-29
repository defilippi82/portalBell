import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, deleteDoc, onSnapshot, orderBy } from 'firebase/firestore';
import { getMessaging, getToken } from 'firebase/messaging';

export default function ResidenteView() {
  const [ufData, setUfData] = useState(null);
  const [cargando, setCargando] = useState(true);
  
  // Estados del Residente
  const [estadoCasa, setEstadoCasa] = useState('en_casa'); // 'en_casa' o 'fuera_de_casa'
  const [pushHabilitado, setPushHabilitado] = useState(true);
  
  // Gestión de Sub-usuarios (Máximo 4)
  const [subUsuarios, setSubUsuarios] = useState([]);
  const [nuevoSubNombre, setNuevoSubNombre] = useState('');
  const [nuevoSubRol, setNuevoSubRol] = useState('');

  // Llamadas Entrantes y Chat en tiempo real
  const [llamadaEntrante, setLlamadaEntrante] = useState(null);
  const [mensajesChat, setMensajesChat] = useState([]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');

  // Videollamada activa de seguridad manual
  const [enVideollamada, setEnVideollamada] = useState(false);

  // Historial y Filtro
  const [historial, setHistorial] = useState([]);
  const [filtroFecha, setFiltroFecha] = useState('');

  const mensajesPredeterminados = [
    "Ya bajo",
    "No puedo bajar en este momento",
    "Dejalo en recepción por favor",
    "En 5 minutos bajo"
  ];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let ufUrl = params.get('uf');
    let tokenUrl = params.get('token');

    if (ufUrl && tokenUrl) {
      localStorage.setItem('portal_uf', ufUrl);
      localStorage.setItem('portal_token', tokenUrl);
    }

    const ufGuardada = localStorage.getItem('portal_uf');
    
    if (ufGuardada) {
      buscarDatosUnidad(ufGuardada);
    } else {
      setCargando(false);
    }
  }, []);

  // Escuchar llamadas entrantes de visitantes en tiempo real para esta UF
  useEffect(() => {
    if (!ufData) return;

    const q = query(
      collection(db, 'llamadas'),
      where('edificioId', '==', ufData.edificioId),
      where('uf', '==', ufData.uf),
      where('estado', '==', 'activo')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const docLlamada = snapshot.docs[0];
        setLlamadaEntrante({ id: docLlamada.id, ...docLlamada.data() });
        
        if (Notification.permission === 'granted') {
          new Notification("🔔 ¡Están tocando el timbre!", {
            body: `Tenés una visita en la puerta esperando (${docLlamada.data().tipo}).`
          });
        }
      } else {
        setLlamadaEntrante(null);
        setMensajesChat([]);
      }
    });

    return () => unsubscribe();
  }, [ufData]);

  // Escuchar los mensajes del chat en tiempo real si hay una llamada activa de tipo chat
  useEffect(() => {
    if (!llamadaEntrante || llamadaEntrante.tipo !== 'chat') return;

    const q = query(collection(db, 'llamadas', llamadaEntrante.id, 'mensajes'), orderBy('fecha', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setMensajesChat(msgs);
    });

    return () => unsubscribe();
  }, [llamadaEntrante?.id]);

  const buscarDatosUnidad = async (ufBuscada) => {
    try {
      const q = query(collection(db, 'unidades'), where('uf', '==', ufBuscada));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const docEncontrado = querySnapshot.docs[0];
        setUfData({ id: docEncontrado.id, ...docEncontrado.data() });
        cargarSubUsuarios(docEncontrado.id);
        cargarHistorial(ufBuscada);
      }
    } catch (error) {
      console.error("Error buscando unidad:", error);
    } finally {
      setCargando(false);
    }
  };

  const cargarSubUsuarios = async (unidadId) => {
    try {
      const q = query(collection(db, 'sub_usuarios'), where('unidadId', '==', unidadId));
      const querySnapshot = await getDocs(q);
      setSubUsuarios(querySnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
  };

  const cargarHistorial = async (ufNombre) => {
    try {
      const q = query(collection(db, 'historial'), where('uf', '==', ufNombre));
      const querySnapshot = await getDocs(q);
      setHistorial(querySnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
  };

  // Activar Notificaciones Push del navegador y obtener Token FCM
  const handleTogglePush = async () => {
    if (!pushHabilitado) {
      try {
        if (!('Notification' in window)) {
          alert("Tu navegador no soporta notificaciones push.");
          return;
        }

        const permiso = await Notification.requestPermission();
        if (permiso === 'granted') {
          const messaging = getMessaging();
          const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
          
          if (vapidKey) {
            const currentToken = await getToken(messaging, { vapidKey });
            if (currentToken) {
              console.log("Token FCM obtenido:", currentToken);
            }
          }

          setPushHabilitado(true);
          new Notification("PortalBell", { body: "¡Notificaciones push activadas correctamente!" });
        } else {
          alert("Debes permitir las notificaciones en tu navegador para que suene el timbre.");
        }
      } catch (error) {
        console.error("Error al activar notificaciones push:", error);
        alert("Hubo un error al registrar las notificaciones.");
      }
    } else {
      setPushHabilitado(false);
    }
  };

  const agregarSubUsuario = async (e) => {
    e.preventDefault();
    if (subUsuarios.length >= 4) {
      alert("Alcanzaste el límite máximo de 4 cohabitantes adicionales para tu unidad.");
      return;
    }
    try {
      await addDoc(collection(db, 'sub_usuarios'), {
        unidadId: ufData.id,
        uf: ufData.uf,
        nombre: nuevoSubNombre,
        rol: nuevoSubRol || 'Familiar'
      });
      setNuevoSubNombre('');
      setNuevoSubRol('');
      cargarSubUsuarios(ufData.id);
    } catch (error) {
      console.error("Error al crear subusuario:", error);
    }
  };

  const eliminarSubUsuario = async (id) => {
    if (window.confirm("¿Eliminar este usuario de la unidad?")) {
      await deleteDoc(doc(db, 'sub_usuarios', id));
      cargarSubUsuarios(ufData.id);
    }
  };

  const enviarMensajeRapido = async (msg) => {
    if (llamadaEntrante) {
      // Si hay una llamada activa, enviamos el mensaje directo al chat
      try {
        await addDoc(collection(db, 'llamadas', llamadaEntrante.id, 'mensajes'), {
          remitente: 'residente',
          texto: msg,
          fecha: new Date().toISOString()
        });
      } catch (e) {
        console.error("Error enviando mensaje rápido:", e);
      }
    }
    
    alert(`Mensaje enviado al visitante: "${msg}"`);
    try {
      await addDoc(collection(db, 'historial'), {
        edificioId: ufData.edificioId,
        uf: ufData.uf,
        fecha: new Date().toISOString(),
        resultado: `Respuesta rápida: ${msg}`
      });
      cargarHistorial(ufData.uf);
    } catch (e) {
      console.error(e);
    }
  };

  const enviarMensajeChat = async (e) => {
    e.preventDefault();
    if (!nuevoMensaje.trim() || !llamadaEntrante) return;

    try {
      await addDoc(collection(db, 'llamadas', llamadaEntrante.id, 'mensajes'), {
        remitente: 'residente',
        texto: nuevoMensaje,
        fecha: new Date().toISOString()
      });
      setNuevoMensaje('');
    } catch (error) {
      console.error("Error enviando mensaje:", error);
    }
  };

  const finalizarLlamada = async () => {
    if (!llamadaEntrante) return;
    try {
      const llamadaRef = doc(db, 'llamadas', llamadaEntrante.id);
      await updateDoc(llamadaRef, { estado: 'finalizado' });
      setLlamadaEntrante(null);
    } catch (error) {
      console.error("Error al finalizar llamada:", error);
    }
  };

  if (cargando) return <div style={{ padding: '20px', textAlign: 'center', fontFamily: 'sans-serif' }}>Cargando panel de residente...</div>;

  if (!ufData) return (
    <div style={{ padding: '20px', textAlign: 'center', maxWidth: '400px', margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h2>⚠️ Acceso no configurado</h2>
      <p>No se detectó una Unidad Funcional válida. Por favor, ingresá a través del enlace personalizado que recibiste por WhatsApp.</p>
    </div>
  );

  const historialFiltrado = historial.filter(item => {
    if (!filtroFecha) return true;
    return item.fecha?.startsWith(filtroFecha);
  });

  return (
    <div style={{ padding: '15px', maxWidth: '600px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2>Panel Residente - UF {ufData.uf}</h2>
      <p style={{ color: '#555', fontSize: '14px' }}>
        <strong>Titular:</strong> {ufData.nombre} {ufData.apellido} | <strong>Piso:</strong> {ufData.piso} - <strong>Depto:</strong> {ufData.departamento}
      </p>

      {/* SECCIÓN DE LLAMADA ENTRANTE (ALERTA EN TIEMPO REAL) */}
      {llamadaEntrante && (
        <div style={{ background: '#d4edda', border: '2px solid #28a745', padding: '15px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center' }}>
          <h3 style={{ color: '#155724', margin: '0 0 10px 0' }}>🔔 ¡Están tocando el timbre!</h3>
          <p style={{ fontSize: '14px', marginBottom: '15px' }}>Visita en puerta solicitando: <strong>{llamadaEntrante.tipo === 'video' ? 'Videollamada 📹' : 'Chat Rápido 💬'}</strong></p>

          {llamadaEntrante.tipo === 'chat' ? (
            <div style={{ textAlign: 'left', background: 'white', padding: '10px', borderRadius: '6px', marginBottom: '10px' }}>
              <div style={{ height: '150px', overflowY: 'auto', border: '1px solid #eee', padding: '8px', marginBottom: '10px', background: '#fafafa', borderRadius: '4px' }}>
                {mensajesChat.map((m, i) => (
                  <div key={i} style={{ marginBottom: '8px', textAlign: m.remitente === 'residente' ? 'right' : 'left' }}>
                    <span style={{ display: 'inline-block', background: m.remitente === 'residente' ? '#28a745' : '#e9ecef', color: m.remitente === 'residente' ? 'white' : 'black', padding: '6px 10px', borderRadius: '8px', fontSize: '13px' }}>
                      {m.texto}
                    </span>
                  </div>
                ))}
              </div>
              <form onSubmit={enviarMensajeChat} style={{ display: 'flex', gap: '5px' }}>
                <input 
                  type="text" 
                  placeholder="Escribile al visitante..." 
                  value={nuevoMensaje} 
                  onChange={e => setNuevoMensaje(e.target.value)}
                  style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                />
                <button type="submit" style={{ background: '#28a745', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer' }}>Enviar</button>
              </form>
            </div>
          ) : (
            <div style={{ background: '#000', color: '#fff', height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', marginBottom: '10px' }}>
              [ Videollamada Activa con la Puerta ]
            </div>
          )}

          <button 
            onClick={finalizarLlamada} 
            style={{ background: '#dc3545', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer', width: '100%', marginTop: '5px' }}
          >
            📵 Cortar / Atendido
          </button>
        </div>
      )}

      {/* 1. ESTADO CASA Y NOTIFICACIONES PUSH */}
      <div style={{ background: '#e9ecef', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
        <h3>⚙️ Presencia y Alertas (Timbre)</h3>
        
        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
          <button 
            onClick={() => setEstadoCasa('en_casa')}
            style={{ flex: 1, padding: '10px', background: estadoCasa === 'en_casa' ? '#28a745' : '#ccc', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            🏠 Estoy en Casa
          </button>
          <button 
            onClick={() => setEstadoCasa('fuera_de_casa')}
            style={{ flex: 1, padding: '10px', background: estadoCasa === 'fuera_de_casa' ? '#dc3545' : '#ccc', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}
          >
            🚶‍♂️ Fuera de Casa
          </button>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', background: 'white', padding: '10px', borderRadius: '5px' }}>
          <input 
            type="checkbox" 
            checked={pushHabilitado} 
            onChange={handleTogglePush} 
            style={{ width: '18px', height: '18px' }}
          />
          <span style={{ fontSize: '14px', fontWeight: 'bold' }}>🔔 Activar Notificaciones Push (Sonido de Timbre)</span>
        </label>
      </div>

      {/* SEGURIDAD: BOTÓN DE VIDEOLLAMADA */}
      <div style={{ background: '#d1ecf1', padding: '15px', borderRadius: '8px', marginBottom: '15px', border: '1px solid #bee5eb', textAlign: 'center' }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#0c5460' }}>🛡️ Seguridad y Videollamada</h3>
        <p style={{ fontSize: '13px', color: '#0c5460', marginBottom: '12px' }}>Verificá por cámara a las visitas antes de autorizar el ingreso.</p>
        
        {!enVideollamada ? (
          <button 
            onClick={() => setEnVideollamada(true)} 
            style={{ background: '#17a2b8', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '5px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer' }}
          >
            📹 Abrir Videollamada de Seguridad
          </button>
        ) : (
          <div style={{ background: 'white', padding: '15px', borderRadius: '6px', border: '1px solid #17a2b8' }}>
            <p style={{ fontWeight: 'bold', color: '#28a745' }}>🔴 Videollamada activa con la puerta</p>
            <div style={{ background: '#000', color: '#fff', height: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', marginBottom: '10px' }}>
              [ Cámara de Entrada / Streaming ]
            </div>
            <button 
              onClick={() => setEnVideollamada(false)} 
              style={{ background: '#dc3545', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '4px', cursor: 'pointer' }}
            >
              Colgar Videollamada
            </button>
          </div>
        )}
      </div>

      {/* 2. GESTIÓN DE HASTA 4 COHABITANTES */}
      <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '15px', border: '1px solid #ddd' }}>
        <h3>👥 Cohabitantes de la UF ({subUsuarios.length}/4)</h3>
        
        {subUsuarios.length < 4 && (
          <form onSubmit={agregarSubUsuario} style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <input 
              type="text" 
              placeholder="Nombre y Apellido" 
              value={nuevoSubNombre} 
              onChange={e => setNuevoSubNombre(e.target.value)} 
              required 
              style={{ flex: 2, padding: '8px' }}
            />
            <input 
              type="text" 
              placeholder="Rol (Ej: Hijo, Pareja)" 
              value={nuevoSubRol} 
              onChange={e => setNuevoSubRol(e.target.value)} 
              style={{ flex: 1, padding: '8px' }}
            />
            <button type="submit" style={{ background: '#007bff', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer' }}>
              Agregar
            </button>
          </form>
        )}

        <ul style={{ paddingLeft: '20px', margin: 0 }}>
          {subUsuarios.map(sub => (
            <li key={sub.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span><strong>{sub.nombre}</strong> ({sub.rol})</span>
              <button onClick={() => eliminarSubUsuario(sub.id)} style={{ background: '#dc3545', color: 'white', border: 'none', padding: '2px 6px', borderRadius: '3px', cursor: 'pointer' }}>X</button>
            </li>
          ))}
        </ul>
      </div>

      {/* 3. MENSAJES PREDETERMINADOS */}
      <div style={{ background: '#23ad1e', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
        <h3 style={{ margin: 0, color: '#0c0c0c' }}>💬 Mensajes Predeterminados</h3>
        <p style={{ fontSize: '13px', color: '#0c0c0c' }}>Respuestas rápidas para enviar al visitante:</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {mensajesPredeterminados.map((msg, index) => (
            <button key={index} onClick={() => enviarMensajeRapido(msg)} style={{ padding: '8px', background: '#3877b3', border: '1px solid #28a745', borderRadius: '4px', cursor: 'pointer', textAlign: 'left', fontSize: '12px' }}>
              💬 {msg}
            </button>
          ))}
        </div>
      </div>

      {/* 4. HISTORIAL Y FILTRO POR FECHA */}
      <div style={{ background: '#fff3cd', padding: '15px', borderRadius: '8px', border: '1px solid #ffeeba' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3 style={{ margin: 0 }}>📋 Historial de Timbre</h3>
          <input 
            type="date" 
            value={filtroFecha} 
            onChange={e => setFiltroFecha(e.target.value)}
            style={{ padding: '5px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
        </div>

        <div style={{ maxHeight: '150px', overflowY: 'auto', background: 'white', padding: '8px', borderRadius: '4px' }}>
          {historialFiltrado.length > 0 ? (
            historialFiltrado.map((h, i) => (
              <div key={i} style={{ borderBottom: '1px solid #eee', padding: '5px 0', fontSize: '13px' }}>
                🕒 {h.fecha ? new Date(h.fecha).toLocaleString() : 'Reciente'} - <strong>{h.resultado}</strong>
              </div>
            ))
          ) : (
            <p style={{ textAlign: 'center', color: '#666', fontSize: '13px' }}>No hay registros para la fecha seleccionada.</p>
          )}
        </div>
      </div>
    </div>
  );
}