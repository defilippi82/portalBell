import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebaseConfig/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, deleteDoc, onSnapshot, orderBy } from 'firebase/firestore';
import { getMessaging, getToken } from 'firebase/messaging';

export default function ResidenteView() {
  const [ufData, setUfData] = useState(null);
  const [cargando, setCargando] = useState(true);
  
  // Estados del Residente
  const [estadoCasa, setEstadoCasa] = useState('en_casa');
  const [pushHabilitado, setPushHabilitado] = useState(true);
  
  // Gestión de Sub-usuarios (Cohabitantes con WhatsApp y Token)
  const [subUsuarios, setSubUsuarios] = useState([]);
  const [nuevoSubNombre, setNuevoSubNombre] = useState('');
  const [nuevoSubRol, setNuevoSubRol] = useState('');
  const [nuevoSubTelefono, setNuevoSubTelefono] = useState('');

  // Llamadas Entrantes y Chat en tiempo real
  const [llamadaEntrante, setLlamadaEntrante] = useState(null);
  const [mensajesChat, setMensajesChat] = useState([]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');

  // Videollamada activa (WebRTC simulado / Local Stream con la cámara del celu)
  const [enVideollamada, setEnVideollamada] = useState(false);
  const localVideoRef = useRef(null);
  const mediaStreamRef = useRef(null);

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

  // Escuchar llamadas entrantes de visitantes en tiempo real
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
        const datosLlamada = { id: docLlamada.id, ...docLlamada.data() };
        setLlamadaEntrante(datosLlamada);

        // Si la llamada entrante es de video, activamos automáticamente la videollamada
        if (datosLlamada.tipo === 'video') {
          iniciarCamaraSeguridad();
        }
        
        if (Notification.permission === 'granted') {
          new Notification("🔔 ¡Están tocando el timbre!", {
            body: `Tenés una visita en la puerta esperando (${datosLlamada.tipo}).`
          });
        }
      } else {
        setLlamadaEntrante(null);
        setMensajesChat([]);
        detenerCamaraSeguridad();
      }
    });

    return () => unsubscribe();
  }, [ufData]);

  // Escuchar mensajes del chat en tiempo real
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

  // Funciones de Cámara / Videollamada real
  const iniciarCamaraSeguridad = async () => {
    setEnVideollamada(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      mediaStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Error al acceder a la cámara/micrófono:", err);
      alert("No se pudo acceder a la cámara. Asegurate de dar permisos en tu navegador.");
    }
  };

  const detenerCamaraSeguridad = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    setEnVideollamada(false);
  };

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
            await getToken(messaging, { vapidKey });
          }
          setPushHabilitado(true);
        }
      } catch (error) {
        console.error("Error push:", error);
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
      const tokenSub = btoa(`sub_${ufData.uf}_${Date.now()}`);
      await addDoc(collection(db, 'sub_usuarios'), {
        unidadId: ufData.id,
        uf: ufData.uf,
        nombre: nuevoSubNombre,
        rol: nuevoSubRol || 'Familiar',
        telefono: nuevoSubTelefono,
        token: tokenSub
      });
      setNuevoSubNombre('');
      setNuevoSubRol('');
      setNuevoSubTelefono('');
      cargarSubUsuarios(ufData.id);
    } catch (error) {
      console.error("Error al crear cohabitante:", error);
    }
  };

  const enviarWhatsAppSubUsuario = (sub) => {
    const urlApp = `${window.location.origin}/residente?uf=${ufData.uf}&token=${sub.token}`;
    const texto = `¡Hola ${sub.nombre}! Acá tenés tu acceso personal al timbre inteligente de la UF ${ufData.uf}. Ingresá y agregalo a la pantalla de inicio de tu celu: ${urlApp}`;
    const urlWA = `https://api.whatsapp.com/send?phone=${sub.telefono}&text=${encodeURIComponent(texto)}`;
    window.open(urlWA, '_blank');
  };

  const eliminarSubUsuario = async (id) => {
    if (window.confirm("¿Eliminar este cohabitante?")) {
      await deleteDoc(doc(db, 'sub_usuarios', id));
      cargarSubUsuarios(ufData.id);
    }
  };

  const enviarMensajeRapido = async (msg) => {
    if (llamadaEntrante) {
      try {
        await addDoc(collection(db, 'llamadas', llamadaEntrante.id, 'mensajes'), {
          remitente: 'residente',
          texto: msg,
          fecha: new Date().toISOString()
        });
      } catch (e) {
        console.error(e);
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
    if (llamadaEntrante) {
      try {
        const llamadaRef = doc(db, 'llamadas', llamadaEntrante.id);
        await updateDoc(llamadaRef, { estado: 'finalizado' });
      } catch (error) {
        console.error("Error al finalizar llamada:", error);
      }
    }
    setLlamadaEntrante(null);
    detenerCamaraSeguridad();
  };

  if (cargando) return <div style={{ padding: '20px', textAlign: 'center', fontFamily: 'sans-serif' }}>Cargando panel de residente...</div>;

  if (!ufData) return (
    <div style={{ padding: '20px', textAlign: 'center', maxWidth: '400px', margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h2>⚠️ Acceso no configurado</h2>
      <p>No se detectó una Unidad Funcional válida. Ingresá a través del enlace personalizado que recibiste por WhatsApp.</p>
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

      {/* SECCIÓN DE LLAMADA ENTRANTE (EN TIEMPO REAL) */}
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
            <div style={{ background: '#000', borderRadius: '6px', overflow: 'hidden', marginBottom: '10px', position: 'relative' }}>
              <video ref={localVideoRef} autoPlay playsInline muted style={{ width: '100%', height: '200px', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', bottom: '10px', left: '10px', background: 'rgba(0,0,0,0.6)', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                🔴 Videollamada Activa
              </div>
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
        <h3>⚙️ Presencia y Alertas</h3>
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
          <input type="checkbox" checked={pushHabilitado} onChange={handleTogglePush} style={{ width: '18px', height: '18px' }} />
          <span style={{ fontSize: '14px', fontWeight: 'bold' }}>🔔 Activar Notificaciones Push</span>
        </label>
      </div>

      {/* SEGURIDAD: BOTÓN DE VIDEOLLAMADA MANUAL */}
      <div style={{ background: '#d1ecf1', padding: '15px', borderRadius: '8px', marginBottom: '15px', border: '1px solid #bee5eb', textAlign: 'center' }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#0c5460' }}>🛡️ Seguridad y Videollamada</h3>
        <p style={{ fontSize: '13px', color: '#0c5460', marginBottom: '12px' }}>Verificá la cámara de la entrada cuando desees.</p>
        
        {!enVideollamada ? (
          <button 
            onClick={iniciarCamaraSeguridad} 
            style={{ background: '#17a2b8', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '5px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer' }}
          >
            📹 Abrir Videollamada de Seguridad
          </button>
        ) : (
          <div style={{ background: 'white', padding: '15px', borderRadius: '6px', border: '1px solid #17a2b8' }}>
            <video ref={localVideoRef} autoPlay playsInline muted style={{ width: '100%', height: '180px', objectFit: 'cover', borderRadius: '4px', marginBottom: '10px' }} />
            <button 
              onClick={detenerCamaraSeguridad} 
              style={{ background: '#dc3545', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '4px', cursor: 'pointer', width: '100%' }}
            >
              Cerrar Cámara
            </button>
          </div>
        )}
      </div>

      {/* 2. GESTIÓN DE COHABITANTES CON WHATSAPP */}
      <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '15px', border: '1px solid #ddd' }}>
        <h3>👥 Cohabitantes de la UF ({subUsuarios.length}/4)</h3>
        
        {subUsuarios.length < 4 && (
          <form onSubmit={agregarSubUsuario} style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <input type="text" placeholder="Nombre y Apellido" value={nuevoSubNombre} onChange={e => setNuevoSubNombre(e.target.value)} required style={{ flex: 2, padding: '8px' }} />
            <input type="text" placeholder="Rol (Ej: Pareja, Hijo)" value={nuevoSubRol} onChange={e => setNuevoSubRol(e.target.value)} style={{ flex: 1, padding: '8px' }} />
            <input type="text" placeholder="Celular (54911...)" value={nuevoSubTelefono} onChange={e => setNuevoSubTelefono(e.target.value)} required style={{ flex: 1.5, padding: '8px' }} />
            <button type="submit" style={{ background: '#007bff', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer' }}>Agregar</button>
          </form>
        )}

        <ul style={{ paddingLeft: '20px', margin: 0 }}>
          {subUsuarios.map(sub => (
            <li key={sub.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', background: 'white', padding: '6px', borderRadius: '4px' }}>
              <span><strong>{sub.nombre}</strong> ({sub.rol}) - 📞 {sub.telefono}</span>
              <div style={{ display: 'flex', gap: '5px' }}>
                <button onClick={() => enviarWhatsAppSubUsuario(sub)} title="Enviar link por WhatsApp" style={{ background: '#25D366', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>📲</button>
                <button onClick={() => eliminarSubUsuario(sub.id)} style={{ background: '#dc3545', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>🗑️</button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* 3. MENSAJES PREDETERMINADOS */}
      <div style={{ background: '#e2f0d9', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
        <h3 style={{ margin: '0 0 5px 0' }}>💬 Mensajes Predeterminados</h3>
        <p style={{ fontSize: '13px', color: '#555' }}>Respuestas rápidas para enviar al visitante:</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {mensajesPredeterminados.map((msg, index) => (
            <button key={index} onClick={() => enviarMensajeRapido(msg)} style={{ padding: '8px', background: '#17a2b8', border: '1px solid #28a745', borderRadius: '4px', cursor: 'pointer', textAlign: 'left', fontSize: '12px' }}>
              💬 {msg}
            </button>
          ))}
        </div>
      </div>

      {/* 4. HISTORIAL Y FILTRO POR FECHA */}
      <div style={{ background: '#fff3cd', padding: '15px', borderRadius: '8px', border: '1px solid #ffeeba' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3 style={{ margin: 0 }}>📋 Historial de Timbre</h3>
          <input type="date" value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)} style={{ padding: '5px', borderRadius: '4px', border: '1px solid #ccc' }} />
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