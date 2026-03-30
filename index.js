const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const P = require('pino');
const qrcode = require('qrcode-terminal');
const mongoose = require('mongoose');
const fs = require('fs');

// 📦 Importaciones
const Registro = require('./models/Registro');
const { exportarExcel } = require('./exportar');

// =======================
// 🟢 CONEXIÓN MONGO
// =======================
mongoose.connect('mongodb://127.0.0.1:27017/botdb')
  .then(() => console.log('🟢 Mongo conectado'))
  .catch(err => console.log('🔴 Error Mongo:', err));

function parseInput(text) {
  const regex = /\{([^}]+)\}|(\S+)/g;
  const partes = [];

  let match;
  while ((match = regex.exec(text)) !== null) {
    partes.push(match[1] || match[2]);
  }

  return partes;
}
async function generarCodigoUnico() {
  let codigo;
  let existe = true;

  while (existe) {
    codigo = Math.floor(100000 + Math.random() * 900000).toString();

    const registro = await Registro.findOne({ codigo });
    if (!registro) existe = false;
  }

  return codigo;
}
async function cancelarRegistro(codigo) {
  const registro = await Registro.findOneAndUpdate(
    { codigo },
    { estado: 'pagado' },
    { new: true }
  );

  return registro;
}
async function descontar(codigo, desc) {
  let descuento = desc.toString().replace('$', '').trim();
  const registro = await Registro.findOneAndUpdate(
    { codigo },
    { descuento: descuento },
    { new: true }
  );

  return registro;
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
  });

  sock.ev.on('creds.update', saveCreds);

  //-- establecer conexion
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('📲 Escanea este QR:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      console.log('✅ Bot conectado');
    }

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      console.log('❌ Conexión cerrada');

      if (shouldReconnect) {
        console.log('🔄 Reconectando...');
        startBot();
      } else {
        console.log('⚠️ Sesión inválida');
      }
    }
  });

  //--validacion chats

sock.ev.on('messages.upsert', async ({ messages, type }) => {
  if (type !== 'notify') return;

  for (const msg of messages) {
    if (!msg.message) continue;

    // ✅ Un solo JID dinámico, consistente
    const MY_JID = sock.user.id.replace(/:\d+/, '');
    const my_id = '207202224705596@lid';
    //console.log("este es mi j_id", MY_JID);
    if (msg.key.remoteJid !== my_id) {
      console.log('⛔ Ignorado:', msg.key.remoteJid);
      continue;
    }

    const jid = MY_JID; // ya es el correcto

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      '';

    console.log('📩 Texto:', text);

    if (text.toLowerCase() === '/excel') {
      try {
        const filePath = await exportarExcel();
        console.log('Enviando Excel a', jid);

        // ✅ Leer como Buffer, no como URL
        const fileBuffer = fs.readFileSync(filePath);

        await sock.sendMessage(
          jid,
          {
            document: fileBuffer,
            mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            fileName: 'registros.xlsx'
          },
          { quoted: msg }
        );

        console.log('📤 Excel enviado');
      } catch (err) {
        console.error('❌ Error exportando:', err);
        await sock.sendMessage(jid, { text: '❌ Error al exportar Excel' });
      }

      continue;
    }
      if (text.toLowerCase() === '/help') {

      await sock.sendMessage(
        jid,
        {
          text: `📌 *Instrucciones de uso*

        *Formato para registrar*:
        _{NOMBRE} {MODELO} $PRECIO {DESCRIPCION}_

        Actualizar pago:
        _/act CODIGO_

        Aplicar descuento:
        _/disc CODIGO $DESCUENTO_`
        },
        { quoted: msg }
      );

      continue;
    }
    if (text.toLowerCase().startsWith('/act')) {
    const partes = text.split(' ');
    const codigo = partes[1];

    if (!codigo) {
      await sock.sendMessage(jid, {
        text: '⚠️ Usa: /act 123456'
      });
      continue;
    }

    const registro = await cancelarRegistro(codigo);

    if (!registro) {
      await sock.sendMessage(jid, {
        text: '❌ Registro no encontrado'
      });
      continue;
    }

    await sock.sendMessage(
      jid,
      {
        text: ` Registro ${codigo} pagado`
      },
      { quoted: msg }
    );

    continue;
  }
  if (text.toLowerCase().startsWith('/disc')) {
    const partes = text.trim().split(/\s+/);

    const codigo = partes[1];
    const descuentoRaw = partes[2];

    if (!codigo || !descuentoRaw) {
      await sock.sendMessage(jid, {
        text: '⚠️ Usa: /disc 123456 $600'
      }, { quoted: msg });
      continue;
    }

    const descuento = parseFloat(descuentoRaw.replace('$', ''));

    if (isNaN(descuento)) {
      await sock.sendMessage(jid, {
        text: '⚠️ Descuento inválido'
      });
      continue;
    }

    // 🔍 Buscar registro
    const registro = await descontar(codigo, descuentoRaw);

    if (!registro) {
      await sock.sendMessage(jid, {
        text: '❌ Registro no encontrado'
      });
      continue;
    }

    await sock.sendMessage(
      jid,
      {
        text: `💸 Descuento aplicado\nID: ${codigo}\nNuevo descuento: $${descuento}`
      },
      { quoted: msg }
    );

    continue;
  }
    // --guardar
    try {
      const partes = parseInput(text);

      if (partes.length < 4) {
        await sock.sendMessage(jid, {
          text: 'Necesitas ayuda escribe /help'
        }, { quoted: msg });
        continue;
      }

      const nombre = partes[0].trim();
      const modelo = partes[1].trim();
      const coste = parseFloat(partes[2].replace('$', ''));
      const descripcion = partes.slice(3).join(' ').trim();

      if (!nombre || !modelo || !descripcion) {
        await sock.sendMessage(jid, {
          text: '⚠️ Nombre, modelo y descripción no pueden estar vacíos'
        });
        continue;
      }

      if (isNaN(coste)) {
        await sock.sendMessage(jid, { text: '⚠️ Coste inválido' }, { quoted: msg });
        continue;
      }
      const codigo = await generarCodigoUnico();


      const nuevoRegistro = new Registro({ codigo, nombre, modelo, coste, descripcion });
      await nuevoRegistro.save();

      console.log('✅ Guardado en Mongo');

      await sock.sendMessage(jid, {
        text: `✅ Guardado: *${codigo}* \n ${nombre}`
      }, { quoted: msg });

    } catch (error) {
      console.error('❌ Error:', error);
      await sock.sendMessage(jid, { text: '❌ Error al guardar' });
    }
  }
});
}

//--inicio
startBot();