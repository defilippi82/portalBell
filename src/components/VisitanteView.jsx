import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig/firebase';
import { collection, getDocs, doc, getDoc, query, where, addDoc } from 'firebase/firestore';

export default function VisitanteView() {
  const [edificioId, setEdificioId] = useState(null);
  const [edificioInfo, setEdificioInfo] = useState(null);
  const [unidades, setUnidades] = useState([]);
  
  // Estado de Geolocalización
  const [enRango, setEnRango] = useState(false);
  const [verificandoUbicacion, setVerificandoUbicacion] = useState(true);
  const [distanciaError, setDistanciaError] = useState('');

  // UF Seleccionada y tipo de llamada
  const [ufSeleccionada, setUfSeleccionada] = useState(null);
  const [modoLlamada, setModoLlamada] = useState(null); // 'chat' o 'video'

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

  const cargarDatosEdificioYUnidades = async (idEd) => {
    try {
      const docRef = doc(db, 'edificios', idEd);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const edData = docSnap.data();
        setEdificioInfo(edData);
        verificarGeolocalizacion(edData.lat || -34.3400, edData.lng || -58.8000);
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
        const radioPermitidoMetros = 60;

        const distancia = calcularDistanciaMetros(lat, lng, edificioLat, edificioLng);
        
        if (distancia <= radioPermitidoMetros) {
          setEnRango(true);
        } else {
          setEnRango(false);
          setDistanciaError(`Estás demasiado lejos de la entrada (${Math.round(distancia)}m). Debes estar en la puerta del edificio para llamar.`);
        }
        setVerificandoUbicacion(false);
      },
      (error) => {
        console.error("Error GPS:", error);
        setDistanciaError("No pudimos obtener tu ubicación. Asegurate de dar permisos de GPS en tu navegador.");
        setVerificandoUbicacion(false);
      },
      { enableHighAccuracy: true }
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
      await addDoc(collection(db, 'historial'), {
        edificioId,
        uf: ufSeleccionada.uf,
        tipo: tipo,
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
        <h3>📍 Verificando ubicación en la entrada...</h3>
        <p>Por favor, permití el acceso al GPS.</p>
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
          <p>Destinatario: {ufSeleccionada.nombre} {ufSeleccionada.apellido ? `${ufSeleccionada.apellido.charAt(0)}.` : ''}</p>

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
            <div style={{ marginTop: '20px', padding: '15px', background: 'white', borderRadius: '6px', border: '1px solid #ccc' }}>
              <h4>{modoLlamada === 'video' ? '📹 Videollamada en curso...' : '💬 Chat en curso...'}</h4>
              <p style={{ fontSize: '13px', color: '#666' }}>Conectando con la UF {ufSeleccionada.uf}...</p>
              <button onClick={() => setModoLlamada(null)} style={{ backgroundColor: '#dc3545', color: 'white', padding: '8px 15px', border: 'none', borderRadius: '5px', cursor: 'pointer', marginTop: '15px' }}>
                Colgar / Salir
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}