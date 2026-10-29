import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebaseConfig/firebase';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';

export default function UsuariosUFView() {
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPass, setAdminPass] = useState('');
  
  // Gestión de Edificios y GPS
  const [edificios, setEdificios] = useState([]);
  const [edificioSeleccionado, setEdificioSeleccionado] = useState('');
  const [nombreNuevoEdificio, setNombreNuevoEdificio] = useState('');
  const [direccionEdificio, setDireccionEdificio] = useState('');
  const [latitud, setLatitud] = useState('');
  const [longitud, setLongitud] = useState('');
  const [obteniendoGps, setObteniendoGps] = useState(false);

  // Campos del formulario de Unidades Funcionales
  const [uf, setUf] = useState('');
  const [piso, setPiso] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [telefono, setTelefono] = useState('');
  const [correo, setCorreo] = useState('');

  const [idEditando, setIdEditando] = useState(null);
  const [listaUnidades, setListaUnidades] = useState([]);

  useEffect(() => {
    if (isAdminLoggedIn) {
      cargarEdificios();
    }
  }, [isAdminLoggedIn]);

  useEffect(() => {
    if (edificioSeleccionado) {
      cargarUnidades(edificioSeleccionado);
    } else {
      setListaUnidades([]);
    }
  }, [edificioSeleccionado]);

  // Login con Firebase Auth
  const handleAdminLogin = async (e) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, adminEmail, adminPass);
      setIsAdminLoggedIn(true);
    } catch (error) {
      console.error("Error de autenticación:", error);
      alert('Correo o contraseña incorrectos.');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setIsAdminLoggedIn(false);
    setEdificios([]);
    setEdificioSeleccionado('');
  };

  const cargarEdificios = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'edificios'));
      const docs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setEdificios(docs);
      if (docs.length > 0 && !edificioSeleccionado) {
        setEdificioSeleccionado(docs[0].id);
      }
    } catch (error) {
      console.error("Error cargando edificios:", error);
    }
  };

  // Capturar coordenadas GPS actuales desde el navegador/celular
  const obtenerUbicacionGps = () => {
    if (!navigator.geolocation) {
      alert("Tu navegador no soporta geolocalización.");
      return;
    }
    setObteniendoGps(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitud(position.coords.latitude);
        setLongitud(position.coords.longitude);
        setObteniendoGps(false);
        alert("¡Ubicación GPS capturada con éxito!");
      },
      (error) => {
        console.error("Error GPS:", error);
        alert("No se pudo obtener la ubicación. Asegurate de dar permisos de GPS.");
        setObteniendoGps(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const crearEdificio = async (e) => {
    e.preventDefault();
    if (!nombreNuevoEdificio) return;
    
    if (!latitud || !longitud) {
      alert("Por favor, capturá las coordenadas GPS de la entrada del edificio para habilitar el QR.");
      return;
    }

    try {
      const docRef = await addDoc(collection(db, 'edificios'), {
        nombre: nombreNuevoEdificio,
        direccion: direccionEdificio,
        lat: parseFloat(latitud),
        lng: parseFloat(longitud),
        adminId: auth.currentUser?.uid,
        fechaCreacion: new Date().toISOString()
      });
      alert(`Edificio "${nombreNuevoEdificio}" creado con éxito.`);
      setNombreNuevoEdificio('');
      setDireccionEdificio('');
      setLatitud('');
      setLongitud('');
      cargarEdificios();
      setEdificioSeleccionado(docRef.id);
    } catch (error) {
      console.error("Error al crear edificio:", error);
    }
  };

  const cargarUnidades = async (edId) => {
    try {
      const q = query(collection(db, 'unidades'), where('edificioId', '==', edId));
      const querySnapshot = await getDocs(q);
      const docs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setListaUnidades(docs);
    } catch (error) {
      console.error("Error cargando unidades:", error);
    }
  };

  const handleGuardarResidente = async (e) => {
    e.preventDefault();
    if (!edificioSeleccionado) {
      alert("Seleccioná o creá un edificio primero.");
      return;
    }

    try {
      if (idEditando) {
        const docRef = doc(db, 'unidades', idEditando);
        await updateDoc(docRef, { uf, piso, departamento, nombre, apellido, telefono, correo });
        alert(`UF ${uf} actualizada con éxito.`);
        setIdEditando(null);
      } else {
        const tokenAcceso = btoa(`${uf}_${Date.now()}`);
        await addDoc(collection(db, 'unidades'), {
          edificioId: edificioSeleccionado,
          uf, piso, departamento, nombre, apellido, telefono, correo,
          token: tokenAcceso,
          fechaAlta: new Date().toISOString()
        });
        alert(`UF ${uf} creada con éxito.`);
      }

      limpiarFormulario();
      cargarUnidades(edificioSeleccionado);
    } catch (error) {
      console.error("Error al guardar:", error);
    }
  };

  const handleEditar = (item) => {
    setIdEditando(item.id);
    setUf(item.uf || '');
    setPiso(item.piso || '');
    setDepartamento(item.departamento || '');
    setNombre(item.nombre || '');
    setApellido(item.apellido || '');
    setTelefono(item.telefono || '');
    setCorreo(item.correo || '');
  };

  const handleEliminar = async (id, ufNombre) => {
    if (window.confirm(`¿Estás seguro de que querés borrar la UF ${ufNombre}?`)) {
      try {
        await deleteDoc(doc(db, 'unidades', id));
        alert('Unidad eliminada correctamente.');
        cargarUnidades(edificioSeleccionado);
      } catch (error) {
        console.error("Error al eliminar:", error);
      }
    }
  };

  const limpiarFormulario = () => {
    setIdEditando(null);
    setUf(''); setPiso(''); setDepartamento('');
    setNombre(''); setApellido(''); setTelefono(''); setCorreo('');
  };

  const enviarLinkWhatsApp = (item) => {
    const urlApp = `${window.location.origin}/residente?uf=${item.uf}&token=${item.token}`;
    const texto = `¡Hola ${item.nombre}! Ya tenés activo tu acceso al timbre inteligente de la UF ${item.uf}. Ingresá desde tu celu e instalalo como app: ${urlApp}`;
    const urlWA = `https://api.whatsapp.com/send?phone=${item.telefono}&text=${encodeURIComponent(texto)}`;
    window.open(urlWA, '_blank');
  };

  const obtenerUrlTimbreEdificio = () => {
    return `${window.location.origin}/visitante?edificio=${edificioSeleccionado}`;
  };

  if (!isAdminLoggedIn) {
    return (
      <div style={{ padding: '20px', maxWidth: '400px', margin: '50px auto', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h2>Acceso Administrador</h2>
        <form onSubmit={handleAdminLogin} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input 
            type="email" 
            placeholder="Correo electrónico" 
            value={adminEmail} 
            onChange={(e) => setAdminEmail(e.target.value)} 
            required 
            style={{ padding: '8px' }}
          />
          <input 
            type="password" 
            placeholder="Contraseña" 
            value={adminPass} 
            onChange={(e) => setAdminPass(e.target.value)} 
            required 
            style={{ padding: '8px' }}
          />
          <button type="submit" style={{ padding: '10px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Ingresar</button>
        </form>
      </div>
    );
  }

  const edificioActualObj = edificios.find(e => e.id === edificioSeleccionado);

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2>Panel de Administración Multiedificio</h2>
        <button onClick={handleLogout} style={{ background: '#dc3545', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer' }}>Cerrar Sesión</button>
      </div>
      
      {/* SECCIÓN EDIFICIOS */}
      <div style={{ background: '#e9ecef', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
        <h3>🏢 Seleccionar o Crear Edificio</h3>
        <select 
          value={edificioSeleccionado} 
          onChange={(e) => setEdificioSeleccionado(e.target.value)}
          style={{ padding: '10px', fontSize: '16px', borderRadius: '4px', width: '100%', marginBottom: '15px' }}
        >
          <option value="">-- Seleccioná un Edificio --</option>
          {edificios.map(ed => (
            <option key={ed.id} value={ed.id}>{ed.nombre} ({ed.direccion || 'Sin dirección'})</option>
          ))}
        </select>

        <form onSubmit={crearEdificio} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input type="text" placeholder="Nombre del nuevo edificio" value={nombreNuevoEdificio} onChange={e => setNombreNuevoEdificio(e.target.value)} required style={{ padding: '8px', flex: 2 }} />
            <input type="text" placeholder="Dirección" value={direccionEdificio} onChange={e => setDireccionEdificio(e.target.value)} style={{ padding: '8px', flex: 2 }} />
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', background: '#fff', padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }}>
            <button type="button" onClick={obtenerUbicacionGps} style={{ background: '#17a2b8', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
              {obteniendoGps ? '📍 Obteniendo GPS...' : '📍 Capturar Ubicación GPS Actual'}
            </button>
            <input type="text" placeholder="Latitud" value={latitud} onChange={e => setLatitud(e.target.value)} required style={{ padding: '6px', width: '120px' }} />
            <input type="text" placeholder="Longitud" value={longitud} onChange={e => setLongitud(e.target.value)} required style={{ padding: '6px', width: '120px' }} />
          </div>

          <button type="submit" style={{ background: '#28a745', color: 'white', border: 'none', padding: '10px 15px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginTop: '5px' }}>
            ➕ Registrar Nuevo Edificio
          </button>
        </form>
      </div>

      {edificioSeleccionado && (
        <>
          {/* SECCIÓN QR */}
          <div style={{ background: '#e2f0d9', padding: '15px', borderRadius: '8px', marginBottom: '20px', textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 5px 0' }}>📱 Código QR Puerta: {edificioActualObj?.nombre}</h3>
            <p style={{ margin: '0 0 15px 0', fontSize: '13px', color: '#555' }}>Escanealo en la entrada del edificio para validar el acceso por geolocalización.</p>
            
            <div style={{ background: 'white', display: 'inline-block', padding: '15px', borderRadius: '8px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(obtenerUrlTimbreEdificio())}`} 
                alt="QR de acceso al edificio" 
                style={{ display: 'block', margin: '0 auto 12px auto' }}
              />
              <a 
                href={`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(obtenerUrlTimbreEdificio())}`} 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ background: '#007bff', color: 'white', padding: '8px 15px', textDecoration: 'none', borderRadius: '4px', fontWeight: 'bold', fontSize: '13px', display: 'inline-block' }}
              >
                📥 Descargar QR en Alta Resolución
              </a>
            </div>
          </div>

          {/* FORMULARIO UF */}
          <div style={{ background: '#f9f9f9', padding: '15px', borderRadius: '8px', marginBottom: '25px' }}>
            <h3>{idEditando ? '✏️ Modificar Unidad Funcional' : '➕ Registrar Nueva UF'}</h3>
            <form onSubmit={handleGuardarResidente} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
              <input type="text" placeholder="UF (Ej: 2A)" value={uf} onChange={(e) => setUf(e.target.value)} required style={{ padding: '8px' }} />
              <input type="text" placeholder="Piso" value={piso} onChange={(e) => setPiso(e.target.value)} required style={{ padding: '8px' }} />
              <input type="text" placeholder="Departamento" value={departamento} onChange={(e) => setDepartamento(e.target.value)} required style={{ padding: '8px' }} />
              <input type="text" placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required style={{ padding: '8px' }} />
              <input type="text" placeholder="Apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} required style={{ padding: '8px' }} />
              <input type="text" placeholder="Teléfono (54911...)" value={telefono} onChange={(e) => setTelefono(e.target.value)} required style={{ padding: '8px' }} />
              <input type="email" placeholder="Correo" value={correo} onChange={(e) => setCorreo(e.target.value)} required style={{ padding: '8px' }} />
              
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="submit" style={{ backgroundColor: idEditando ? '#ffc107' : '#007bff', color: idEditando ? 'black' : 'white', padding: '10px 20px', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                  {idEditando ? 'Guardar Cambios' : 'Guardar y Generar Acceso'}
                </button>
                {idEditando && (
                  <button type="button" onClick={limpiarFormulario} style={{ backgroundColor: '#6c757d', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* TABLA DE UNIDADES */}
          <h3>Unidades Funcionales de {edificioActualObj?.nombre}</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', background: 'white', border: '1px solid #ddd' }}>
              <thead>
                <tr style={{ backgroundColor: '#f2f2f2' }}>
                  <th style={{ padding: '10px', border: '1px solid #ddd' }}>UF</th>
                  <th style={{ padding: '10px', border: '1px solid #ddd' }}>Ubicación</th>
                  <th style={{ padding: '10px', border: '1px solid #ddd' }}>Propietario</th>
                  <th style={{ padding: '10px', border: '1px solid #ddd' }}>Contacto</th>
                  <th style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {listaUnidades.map((item) => (
                  <tr key={item.id}>
                    <td style={{ padding: '10px', border: '1px solid #ddd', fontWeight: 'bold' }}>{item.uf}</td>
                    <td style={{ padding: '10px', border: '1px solid #ddd' }}>Piso {item.piso} - Depto {item.departamento}</td>
                    <td style={{ padding: '10px', border: '1px solid #ddd' }}>{item.nombre} {item.apellido}</td>
                    <td style={{ padding: '10px', border: '1px solid #ddd' }}>
                      📞 {item.telefono}<br/>
                      ✉️ {item.correo}
                    </td>
                    <td style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
                        <button onClick={() => enviarLinkWhatsApp(item)} title="Enviar Link WhatsApp" style={{ backgroundColor: '#25D366', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer' }}>📲</button>
                        <button onClick={() => handleEditar(item)} title="Editar" style={{ backgroundColor: '#ffc107', color: 'black', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer' }}>✏️</button>
                        <button onClick={() => handleEliminar(item.id, item.uf)} title="Eliminar" style={{ backgroundColor: '#dc3545', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer' }}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {listaUnidades.length === 0 && (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '15px', color: '#666' }}>No hay unidades registradas en este edificio todavía.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}