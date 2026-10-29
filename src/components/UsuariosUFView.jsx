import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig/firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';

export default function UsuariosUFView() {
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminPass, setAdminPass] = useState('');
  
  // Campos del formulario
  const [uf, setUf] = useState('');
  const [piso, setPiso] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [telefono, setTelefono] = useState('');
  const [correo, setCorreo] = useState('');

  // Estado para saber si estamos editando
  const [idEditando, setIdEditando] = useState(null);
  
  const [listaUnidades, setListaUnidades] = useState([]);

  // Cargar unidades desde Firestore
  const cargarUnidades = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'unidades'));
      const docs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setListaUnidades(docs);
    } catch (error) {
      console.error("Error cargando unidades:", error);
    }
  };

  useEffect(() => {
    if (isAdminLoggedIn) {
      cargarUnidades();
    }
  }, [isAdminLoggedIn]);

  const handleAdminLogin = (e) => {
    e.preventDefault();
    const claveCorrecta = import.meta.env.VITE_ADMIN_PASSWORD || 'admin123'; 
    if (adminPass === claveCorrecta) {
      setIsAdminLoggedIn(true);
    } else {
      alert('Contraseña de administrador incorrecta');
    }
  };

  // Crear o Modificar Residente
  const handleGuardarResidente = async (e) => {
    e.preventDefault();
    try {
      if (idEditando) {
        // Actualizar unidad existente
        const docRef = doc(db, 'unidades', idEditando);
        await updateDoc(docRef, {
          uf, piso, departamento, nombre, apellido, telefono, correo
        });
        alert(`UF ${uf} actualizada con éxito.`);
        setIdEditando(null);
      } else {
        // Crear nueva unidad
        const tokenAcceso = btoa(`${uf}_${Date.now()}`);
        await addDoc(collection(db, 'unidades'), {
          uf, piso, departamento, nombre, apellido, telefono, correo,
          token: tokenAcceso,
          fechaAlta: new Date().toISOString()
        });
        alert(`UF ${uf} creada con éxito.`);
      }

      limpiarFormulario();
      cargarUnidades();
    } catch (error) {
      console.error("Error al guardar:", error);
    }
  };

  // Cargar datos en el formulario para editar
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

  // Eliminar unidad
  const handleEliminar = async (id, ufNombre) => {
    if (window.confirm(`¿Estás seguro de que querés borrar la UF ${ufNombre}?`)) {
      try {
        await deleteDoc(doc(db, 'unidades', id));
        alert('Unidad eliminada correctamente.');
        cargarUnidades();
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

  if (!isAdminLoggedIn) {
    return (
      <div style={{ padding: '20px', maxWidth: '400px', margin: '50px auto', textAlign: 'center' }}>
        <h2>Acceso Administrador</h2>
        <form onSubmit={handleAdminLogin} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input 
            type="password" 
            placeholder="Clave Administrador" 
            value={adminPass} 
            onChange={(e) => setAdminPass(e.target.value)} 
            required 
          />
          <button type="submit">Ingresar</button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      <h2>Panel del Administrador</h2>
      
      {/* Formulario */}
      <div style={{ background: '#f9f9f9', padding: '15px', borderRadius: '8px', marginBottom: '25px' }}>
        <h3>{idEditando ? '✏️ Modificar Unidad Funcional' : '➕ Registrar Nueva UF y Propietario'}</h3>
        <form onSubmit={handleGuardarResidente} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
          <input type="text" placeholder="UF (Ej: 2A)" value={uf} onChange={(e) => setUf(e.target.value)} required />
          <input type="text" placeholder="Piso" value={piso} onChange={(e) => setPiso(e.target.value)} required />
          <input type="text" placeholder="Departamento" value={departamento} onChange={(e) => setDepartamento(e.target.value)} required />
          <input type="text" placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          <input type="text" placeholder="Apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} required />
          <input type="text" placeholder="Teléfono (54911...)" value={telefono} onChange={(e) => setTelefono(e.target.value)} required />
          <input type="email" placeholder="Correo" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
          
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button type="submit" style={{ backgroundColor: idEditando ? '#ffc107' : '#007bff', color: idEditando ? 'black' : 'white', padding: '10px 20px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
              {idEditando ? 'Guardar Cambios' : 'Guardar y Generar Acceso'}
            </button>
            {idEditando && (
              <button type="button" onClick={limpiarFormulario} style={{ backgroundColor: '#6c757d', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                Cancelar Edición
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Tabla de Usuarios / Unidades */}
      <h3>Unidades Funcionales Registradas</h3>
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
                    <button 
                      onClick={() => enviarLinkWhatsApp(item)} 
                      title="Enviar Link WhatsApp" 
                      style={{ backgroundColor: '#25D366', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      📲
                    </button>
                    <button 
                      onClick={() => handleEditar(item)} 
                      title="Editar" 
                      style={{ backgroundColor: '#ffc107', color: 'black', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      ✏️
                    </button>
                    <button 
                      onClick={() => handleEliminar(item.id, item.uf)} 
                      title="Eliminar" 
                      style={{ backgroundColor: '#dc3545', color: 'white', border: 'none', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {listaUnidades.length === 0 && (
              <tr>
                <td colSpan="5" style={{ textAlign: 'center', padding: '15px' }}>No hay unidades registradas todavía.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}