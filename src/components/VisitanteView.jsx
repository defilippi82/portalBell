import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig/firebase';
import { collection, getDocs, doc, getDoc, query, where, addDoc, onSnapshot, orderBy, updateDoc } from 'firebase/firestore';

export default function VisitanteView() {
  const [edificioId, setEdificioId] = useState(null);
  const [edificioInfo, setEdificioInfo] = useState(null);
  const [unidades, setUnidades] = useState([]);
  
  // Estado de Geolocalización
  const [enRango, setEnRango] = useState(false);
  const [verificandoUbicacion, setVerificandoUbicacion] = useState(true);
  const [distanciaError, setDistanciaError] = useState('');
  const [distanciaActualMetros, setDistanciaActualMetros] = useState(null);

  // UF Seleccionada y tipo de llamada
  const [ufSeleccionada, setUfSeleccionada] = useState(null);
  const [modoLlamada, setModoLlamada] = useState(null); // 'chat' o 'video'
  const [llamadaId, setLlamadaId] = useState(null);
  
  // Estados para el Chat en tiempo real
  const [mensajesChat, setMensajesChat] = useState([]);
  const [nuevoMensaje, setNuevoMensaje] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idEdificioUrl = params.get('edificio');

    if (idEdificioUrl) {
      setEdificioId(idEdificioUrl);
      cargarDatosEdificioYUnidades(idEdificioUrl);
    } else {
      setVerificandoUbicacion(false);
      setDistanciaError("No se especificó ningún edificio. Escaneá el código QR correcto en la entrada.");
    }
  }, []);

  // Escuchar el estado de la llamada y los mensajes en tiempo real para el visitante
  useEffect(() => {
    if (!llamadaId) return;

    // 1. Escuchar si el residente finaliza/corta la llamada
    const unsubscribeCall = onSnapshot(doc(db, 'llamadas', llamadaId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.estado === 'finalizado') {
          alert("La llamada fue finalizada por el residente.");
          setModoLlamada(null);
          setLlamadaId(null);
        }
      }
    });

    // 2. Escuchar los mensajes del chat en tiempo real
    const q = query(collection(db, 'llamadas', llamadaId, 'mensajes'), orderBy('fecha', 'asc'));
    const unsubscribeMsgs = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setMensajesChat(msgs);
    });

    return () => {
      unsubscribeCall();
      unsubscribeMsgs();
    };
  }, [llamadaId]);

  const cargarDatosEdificioYUnidades = async (idEd) => {
    try {
      const docRef = doc(db, 'edificios', idEd);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const edData = docSnap.data();
        setEdificioInfo(edData);
        const latEdificio = Number(edData.lat);
        const lngEdificio = Number(edData.lng);

        if (!isNaN(latEdificio) && !isNaN(lngEdificio)) {
          verificarGeolocalizacion(latEdificio, lngEdificio);
        } else {
          setDistanciaError("El edificio no tiene registradas coordenadas GPS válidas.");
          setVerificandoUbicacion(false);
        }
      } else {
        setDistanciaError("El edificio no existe o fue eliminado.");
        setVerificandoUbicacion(false);
        return;
      }

      const q = query(collection(db, 'unidades'), where('edificioId', '==', idEd));
      const querySnapshot = await getDocs(q);
      const lista = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setUnidades(lista);

    } catch (error) {
      console.error("Error cargando datos del edificio:", error);
      setDistanciaError("Error al conectar con la base de datos.");
      setVerificandoUbicacion(false);
    }
  };

  const verificarGeolocalizacion = (edificioLat, edificioLng) => {
    if (!navigator.geolocation) {
      setDistanciaError("Tu navegador no soporta geolocalización.");
      setVerificandoUbicacion(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const radioPermitidoMetros = 150;

        const distancia = calcularDistanciaMetros(lat, lng, edificioLat, edificioLng);
        setDistanciaActualMetros(Math.round(distancia));
        
        if (distancia <= radioPermitidoMetros) {
          setEnRango(true);
        } else {
          setEnRango(false);
          setDistanciaError(`Estás a ${Math.round(distancia)}m del edificio (Máximo permitido: ${radioPermitidoMetros}m). Acercate a la entrada.`);
        }
        setVerificandoUbicacion(false);
      },
      (error) => {
        console.error("Error GPS:", error);
        setDistanciaError("No pudimos obtener tu ubicación GPS. Asegurate de dar permisos en tu navegador.");
        setVerificandoUbicacion(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const calcularDistanciaMetros = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const iniciarLlamadaOchat = async (tipo) => {
    setModoLlamada(tipo);
    try {
      const llamadaRef = await addDoc(collection(db, 'llamadas'), {
        edificioId,
        uf: ufSeleccionada.uf,
        tipo: tipo,
        estado: 'activo',
        fecha: new Date().toISOString()
      });
      setLlamadaId(llamadaRef.id);
    } catch (e) {
      console.error("Error iniciando sesión:", e);
    }
  };

  const enviarMensajeChat = async (e) => {
    e.preventDefault();
    if (!nuevoMensaje.trim() || !llamadaId) return;

    try {
      await addDoc(collection(db, 'llamadas', llamadaId, 'mensajes'), {
        remitente: 'visitante',
        texto: nuevoMensaje,
        fecha: new Date().toISOString()
      });
      setNuevoMensaje('');
    } catch (error) {
      console.error("Error enviando mensaje:", error);
    }
  };

  const colgarLlamada = async () => {
    if (llamadaId) {
      try {
        const llamadaRef = doc(db, 'llamadas', llamadaId);
        await updateDoc(llamadaRef, { estado: 'finalizado' });
      } catch (e) {
        console.error("Error al finalizar llamada:", e);
      }
    }
    setModoLlamada(null);
    setLlamadaId(null);
  };

  if (verificandoUbicacion) {
    return (
      <div style={{ padding: '30px', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h3>📍 Verificando ubicación en la entrada...</h3>
        <p>Por favor, permití el acceso al GPS en tu dispositivo.</p>
      </div>
    );
  }

  if (!enRango) {
    return (
      <div style={{ padding: '30px', textAlign: 'center', maxWidth: '400px', margin: '40px auto', fontFamily: 'sans-serif', background: '#fff3cd', borderRadius: '8px', border: '1px solid #ffeeba' }}>
        <h2>🚫 Fuera de rango</h2>
        <p>{distanciaError}</p>
        <button onClick={() => window.location.reload()} style={{ background: '#007bff', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '5px', cursor: 'pointer', marginTop: '10px' }}>
          🔄 Reintentar
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '500px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2>🚪 Timbre - {edificioInfo?.nombre || 'Edificio'}</h2>
      <p style={{ color: '#28a745', fontSize: '14px', fontWeight: 'bold' }}>✅ Ubicación verificada en puerta</p>

      {!ufSeleccionada ? (
        <div>
          <h3>Seleccioná tu destino:</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginTop: '15px' }}>
            {unidades.map((item) => (
              <button
                key={item.id}
                onClick={() => setUfSeleccionada(item)}
                style={{
                  padding: '15px',
                  backgroundColor: '#f8f9fa',
                  border: '2px solid #007bff',
                  borderRadius: '8px',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  color: '#007bff'
                }}
              >
                UF {item.uf}
                <div style={{ fontSize: '11px', color: '#666', fontWeight: 'normal', marginTop: '4px' }}>
                  Piso {item.piso} - Depto {item.departamento}
                </div>
              </button>
            ))}
            {unidades.length === 0 && (
              <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#666' }}>No hay unidades cargadas en este edificio.</p>
            )}
          </div>
        </div>
      ) : (
        <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '8px', border: '1px solid #ddd', textAlign: 'center' }}>
          <h3>UF Seleccionada: {ufSeleccionada.uf}</h3>
          <p>Destinatario: {ufSeleccionada.piso} {ufSeleccionada.departamento ? `${ufSeleccionada.departamento.charAt(0)}.` : ''}</p>

          {!modoLlamada ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
              <button onClick={() => iniciarLlamadaOchat('video')} style={{ backgroundColor: '#28a745', color: 'white', padding: '12px', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>
                📹 Iniciar Videollamada
              </button>
              <button onClick={() => iniciarLlamadaOchat('chat')} style={{ backgroundColor: '#007bff', color: 'white', padding: '12px', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>
                💬 Iniciar Chat Rápido
              </button>
              <button onClick={() => setUfSeleccionada(null)} style={{ backgroundColor: '#6c757d', color: 'white', padding: '8px', border: 'none', borderRadius: '6px', cursor: 'pointer', marginTop: '10px' }}>
                ⬅️ Elegir otra Unidad
              </button>
            </div>
          ) : (
            <div style={{ marginTop: '20px', padding: '15px', background: 'white', borderRadius: '6px', border: '1px solid #ccc', textAlign: 'left' }}>
              <h4 style={{ textAlign: 'center', margin: '0 0 10px 0' }}>
                {modoLlamada === 'video' ? '📹 Videollamada en curso...' : '💬 Chat Activo con UF ' + ufSeleccionada.uf}
              </h4>

              {modoLlamada === 'chat' ? (
                <div>
                  <div style={{ height: '180px', overflowY: 'auto', border: '1px solid #eee', padding: '8px', marginBottom: '10px', background: '#fafafa', borderRadius: '4px' }}>
                    {mensajesChat.length > 0 ? (
                      mensajesChat.map((m, i) => (
                        <div key={i} style={{ marginBottom: '8px', textAlign: m.remitente === 'visitante' ? 'right' : 'left' }}>
                          <span style={{ display: 'inline-block', background: m.remitente === 'visitante' ? '#007bff' : '#28a745', color: 'white', padding: '6px 10px', borderRadius: '8px', fontSize: '13px' }}>
                            {m.texto}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p style={{ textAlign: 'center', color: '#999', fontSize: '12px' }}>Esperando respuesta del residente...</p>
                    )}
                  </div>
                  <form onSubmit={enviarMensajeChat} style={{ display: 'flex', gap: '5px' }}>
                    <input 
                      type="text" 
                      placeholder="Escribí un mensaje..." 
                      value={nuevoMensaje} 
                      onChange={e => setNuevoMensaje(e.target.value)}
                      style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                    />
                    <button type="submit" style={{ background: '#007bff', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer' }}>Enviar</button>
                  </form>
                </div>
              ) : (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ background: '#000', color: '#fff', height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', marginBottom: '10px' }}>
                    [ Canal de Video / Audio Activo ]
                  </div>
                </div>
              )}

              <button onClick={colgarLlamada} style={{ backgroundColor: '#dc3545', color: 'white', padding: '8px 15px', border: 'none', borderRadius: '5px', cursor: 'pointer', marginTop: '15px', width: '100%' }}>
                Colgar / Salir
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}