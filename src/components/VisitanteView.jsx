import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig/firebase';
import { collection, getDocs, addDoc } from 'firebase/firestore';

export default function VisitanteView() {
  const [unidades, setUnidades] = useState([]);
  const [cargandoUnidades, setCargandoUnidades] = useState(true);
  
  // Estado de Geolocalización
  const [enRango, setEnRango] = useState(false);
  const [verificandoUbicacion, setVerificandoUbicacion] = useState(true);
  const [distanciaError, setDistanciaError] = useState('');

  // UF Seleccionada para llamar
  const [ufSeleccionada, setUfSeleccionada] = useState(null);
  const [modoLlamada, setModoLlamada] = useState(null); // 'chat' o 'video'

  // Coordenadas de referencia del edificio (Ejemplo: Reemplazar con las coordenadas reales de la puerta)
  const EDIFICIO_LAT = -34.3400; // Coordenada de ejemplo (Escobar / Zona Norte)
  const EDIFICIO_LNG = -58.8000;
  const RADIO_PERMITIDO_METROS = 500000; // Rango de tolerancia en metros poner 500000 para pruebas, luego reducir a 50 o 100 metros

  useEffect(() => {
    verificarGeolocalizacion();
    cargarUnidadesEdificio();
  }, []);

  const verificarGeolocalizacion = () => {
    if (!navigator.geolocation) {
      setDistanciaError("Tu navegador no soporta geolocalización.");
      setVerificandoUbicacion(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        
        const distancia = calcularDistanciaMetros(lat, lng, EDIFICIO_LAT, EDIFICIO_LNG);
        
        if (distancia <= RADIO_PERMITIDO_METROS) {
          setEnRango(true);
        } else {
          setEnRango(false);
          setDistanciaError(`Estás demasiado lejos de la entrada (${Math.round(distancia)}m). Debes estar en la puerta para llamar.`);
        }
        setVerificandoUbicacion(false);
      },
      (error) => {
        console.error("Error GPS:", error);
        setDistanciaError("No pudimos obtener tu ubicación. Asegurate de dar permisos de GPS.");
        setVerificandoUbicacion(false);
      },
      { enableHighAccuracy: true }
    );
  };

  // Fórmula de Haversine para calcular distancia en metros entre dos puntos GPS
  const calcularDistanciaMetros = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Radio de la tierra en metros
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const cargarUnidadesEdificio = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'unidades'));
      const lista = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUnidades(lista);
    } catch (error) {
      console.error("Error al cargar unidades:", error);
    } finally {
      setCargandoUnidades(false);
    }
  };

  const iniciarLlamadaOchat = async (tipo) => {
    setModoLlamada(tipo);
    try {
      // Registrar evento en el historial
      await addDoc(collection(db, 'historial'), {
        uf: ufSeleccionada.uf,
        tipo: tipo, // 'chat' o 'video'
        fecha: new Date().toISOString(),
        resultado: `Llamada iniciada por visitante (${tipo})`
      });
    } catch (e) {
      console.error("Error registrando historial:", e);
    }
  };

  if (verificandoUbicacion) {
    return (
      <div style={{ padding: '30px', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h3>📍 Verificando tu ubicación en la puerta...</h3>
        <p>Por favor, permití el acceso al GPS en tu celular.</p>
      </div>
    );
  }

  // Si no está en rango, bloqueamos el acceso al timbre por seguridad
  if (!enRango) {
    return (
      <div style={{ padding: '30px', textAlign: 'center', maxWidth: '400px', margin: '40px auto', fontFamily: 'sans-serif', background: '#fff3cd', borderRadius: '8px', border: '1px solid #ffeeba' }}>
        <h2>🚫 Fuera de rango</h2>
        <p>{distanciaError}</p>
        <button onClick={verificarGeolocalizacion} style={{ background: '#007bff', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '5px', cursor: 'pointer', marginTop: '10px' }}>
          🔄 Reintentar Ubicación
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '500px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h2>🚪 Timbre Inteligente - PortalBell</h2>
      <p style={{ color: '#28a745', fontSize: '14px', fontWeight: 'bold' }}>✅ Ubicación verificada en puerta</p>

      {!ufSeleccionada ? (
        <div>
          <h3>Seleccioná la Unidad Funcional a llamar:</h3>
          {cargandoUnidades ? (
            <p>Cargando departamentos...</p>
          ) : (
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
                    color: '#007bff',
                    transition: '0.2s'
                  }}
                >
                  UF {item.uf}
                  <div style={{ fontSize: '11px', color: '#666', fontWeight: 'normal', marginTop: '4px' }}>
                    Piso {item.piso} - {item.departamento}
                  </div>
                </button>
              ))}
              {unidades.length === 0 && (
                <p style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#666' }}>No hay unidades registradas en el sistema.</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '8px', border: '1px solid #ddd', textAlign: 'center' }}>
          <h3>UF Seleccionada: {ufSeleccionada.uf}</h3>
          <p>Destinatario: {ufSeleccionada.departamento} {ufDataNombreSeguro(ufSeleccionada)}</p>

          {!modoLlamada ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
              <button 
                onClick={() => iniciarLlamadaOchat('video')} 
                style={{ backgroundColor: '#28a745', color: 'white', padding: '12px', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                📹 Iniciar Videollamada
              </button>
              <button 
                onClick={() => iniciarLlamadaOchat('chat')} 
                style={{ backgroundColor: '#007bff', color: 'white', padding: '12px', border: 'none', borderRadius: '6px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                💬 Iniciar Chat Rápido
              </button>
              <button 
                onClick={() => setUfSeleccionada(null)} 
                style={{ backgroundColor: '#6c757d', color: 'white', padding: '8px', border: 'none', borderRadius: '6px', cursor: 'pointer', marginTop: '10px' }}
              >
                ⬅️ Elegir otra Unidad
              </button>
            </div>
          ) : (
            <div style={{ marginTop: '20px', padding: '15px', background: 'white', borderRadius: '6px', border: '1px solid #ccc' }}>
              <h4>{modoLlamada === 'video' ? '📹 Videollamada en curso...' : '💬 Chat en curso...'}</h4>
              <p style={{ fontSize: '13px', color: '#666' }}>Conectando con el residente de la UF {ufSeleccionada.uf}. Aguarde un momento.</p>
              
              <button 
                onClick={() => setModoLlamada(null)} 
                style={{ backgroundColor: '#dc3545', color: 'white', padding: '8px 15px', border: 'none', borderRadius: '5px', cursor: 'pointer', marginTop: '15px' }}
              >
                Colgar / Salir
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Función auxiliar interna para mostrar apellido de forma segura
function ufDataNombreSeguro(item) {
  return item.apellido ? `${item.apellido.charAt(0)}.` : '';
}