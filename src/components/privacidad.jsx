import React from 'react';

export const Privacidad = () => {
  return (
    <div className="privacidad">
      <h1>Política de Privacidad de PortalBell</h1>

      <h2>1. Introducción</h2>
      <p>
        Bienvenido a PortalBell (en adelante, la "Plataforma"), parte del ecosistema Portal Barrios. 
        Esta Política de Privacidad describe cómo recopilamos, utilizamos, almacenamos y protegemos 
        la información personal de los residentes, propietarios, invitados y personal de seguridad. 
        Al utilizar nuestra aplicación o ingresar a barrios administrados a través de ella, 
        aceptás las prácticas descritas en este documento.
      </p>

      <h2>2. Información que Recopilamos</h2>
      <h3>Información de Cuenta y Perfil</h3>
      <p>
        Recopilamos datos de identificación directa como nombre completo, DNI, dirección dentro del barrio, 
        correo electrónico, número de teléfono y rol asignado (propietario, inquilino, visitante o guardia).
      </p>

      <h3>Gestión de Accesos y Códigos QR</h3>
      <p>
        Para la generación de invitaciones e ingresos mediante código QR, registramos los datos de los visitantes 
        autorizados (nombre, DNI, patente de vehículos si aplica) junto con los registros de fecha y hora de entrada y salida.
      </p>

      <h3>Notificaciones Push y Dispositivos</h3>
      <p>
        Recopilamos identificadores únicos de dispositivo (tokens de notificación push), dirección IP, tipo de navegador 
        y sistema operativo para asegurar el envío en tiempo real de alertas de ingreso, timbres virtuales y avisos comunitarios.
      </p>

      <h2>3. Uso de la Información</h2>
      <p>
        Utilizamos la información recopilada exclusivamente para:
      </p>
      <ul>
        <li>Gestionar el control de accesos, generación e identificación de códigos QR en tiempo real.</li>
        <li>Enviar notificaciones push sobre visitas, reservas de amenidades y avisos de la administración.</li>
        <li>Permitir la reserva y control de uso de amenidades y espacios comunes del barrio.</li>
        <li>Mantener la auditoría de seguridad y trazabilidad de ingresos para la administración del barrio.</li>
        <li>Prevenir accesos no autorizados, fraudes o incidentes de seguridad.</li>
      </ul>

      <h2>4. Compartir Información</h2>
      <p>
        No vendemos ni comercializamos tus datos personales. La información solo se comparte en los siguientes casos:
      </p>
      <ul>
        <li>Con la administración del barrio o personal de guardia para la validación de accesos e identidad.</li>
        <li>Con proveedores de infraestructura en la nube (como bases de datos e infraestructura de notificaciones) bajo estrictos estándares de confidencialidad.</li>
        <li>Cuando sea requerido por autoridades judiciales o administrativas en virtud de la legislación vigente.</li>
      </ul>

      <h2>5. Derechos del Usuario (Ley 25.326)</h2>
      <p>
        De acuerdo con la Ley de Protección de Datos Personales de Argentina (Ley N° 25.326), tenés derecho a:
      </p>
      <ul>
        <li>Acceder en forma gratuita a tus datos personales almacenados en la Plataforma.</li>
        <li>Solicitar la actualización, rectificación o supresión de los datos si resultan inexactos o desactualizados.</li>
        <li>Solicitar la eliminación de tu cuenta y datos asociados cuando finalice tu vínculo con el barrio.</li>
      </ul>
      <p>
        El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto (Ley 25.326). La Agencia de Acceso a la Información Pública (AAIP) es el órgano de control de la presente ley.
      </p>

      <h2>6. Seguridad de los Datos</h2>
      <p>
        Implementamos medidas técnicas y organizativas (cifrado de datos, tokens temporales para QR y autenticación segura) 
        para resguardar tu información frente a accesos no autorizados, pérdida o alteración.
      </p>

      <h2>7. Cambios en la Política</h2>
      <p>
        Podemos actualizar esta política para reflejar mejoras operativas o cambios normativos. 
        Te notificaremos sobre cambios significativos a través de la aplicación o por correo electrónico.
      </p>

      <h2>8. Contacto</h2>
      <p>
        Para ejercer tus derechos de acceso, rectificación o supresión de datos, podés contactarnos en:
      </p>
      <p>
        <strong>Federico De Filippi</strong> - Desarrollador de PortalBell / Portal Barrios<br />
        Correo electrónico: <a href="mailto:f.defilippi@gmail.com">f.defilippi@gmail.com</a>
      </p>
    </div>
  );
};