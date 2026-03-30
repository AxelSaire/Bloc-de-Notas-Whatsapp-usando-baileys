
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

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');

  const sock = makeWASocket({
    auth: state,
    logger: P({ level: 'silent' }),
  });

  sock.ev.on('creds.update', saveCreds);

  //--conexion
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

    if (text.toLowerCase() === 'excel') {
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

    // --guardar
    try {
      const partes = text.trim().split(/\s+/);

      if (partes.length < 4) {
        await sock.sendMessage(jid, {
          text: '⚠️ Formato incorrecto\nEjemplo:\nAxel Volvo $20000 Reparacion completa'
        }, { quoted: msg });
        continue;
      }

      const nombre = partes[0];
      const modelo = partes[1];
      const coste = parseFloat(partes[2].replace('$', ''));

      if (isNaN(coste)) {
        await sock.sendMessage(jid, { text: '⚠️ Coste inválido' }, { quoted: msg });
        continue;
      }

      const descripcion = partes.slice(3).join(' ');

      const nuevoRegistro = new Registro({ nombre, modelo, coste, descripcion });
      await nuevoRegistro.save();

      console.log('✅ Guardado en Mongo');

      await sock.sendMessage(jid, {
        text: `✅ Guardado:\n${nombre} - ${modelo} - $${coste}`
      }, { quoted: msg });

    } catch (error) {
      console.error('❌ Error:', error);
      await sock.sendMessage(jid, { text: '❌ Error al guardar' });
    }
  }
});
}

//--iniciar
startBot();