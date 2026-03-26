const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const P = require('pino');
const qrcode = require('qrcode-terminal');
const mongoose = require('mongoose');

//--conexion con mongo
mongoose.connect('mongodb://127.0.0.1:27017/botdb')
  .then(() => console.log('🟢 Mongo conectado'))
  .catch(err => console.log('🔴 Error Mongo:', err));

//--modelo
const registroSchema = new mongoose.Schema({
  nombre: String,
  modelo: String,
  coste: Number,
  descripcion: String,
  fecha: { type: Date, default: Date.now }
});

const Registro = mongoose.model('Registro', registroSchema);

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

  const msg = messages[0];
  if (!msg.message) return;

  const MY_JID = '207202224705596@lid';

  //--solo mi numero
  if (msg.key.remoteJid !== MY_JID) {
    console.log('⛔ Ignorado:', msg.key.remoteJid);
    return;
  }

  //--solo mi chat personal
  if (!msg.key.fromMe) return;

  const jid = msg.key.remoteJid;

  const text =
    msg.message.conversation ||
    msg.message.extendedTextMessage?.text ||
    msg.message.imageMessage?.caption ||
    '';

  console.log('✅ Mensaje válido:', text);

    try {
      const partes = text.trim().split(/\s+/);

      console.log('🧪 PARTES:', partes);

      //--Validación de caracteres
      if (partes.length < 4) {
        await sock.sendMessage(jid, {
          text: '⚠️ Formato incorrecto\nEjemplo:\nAxel Volvo $20000 Reparacion completa'
        });
        return;
      }

      const nombre = partes[0];
      const modelo = partes[1];

      //
      const coste = parseFloat(partes[2].replace('$', ''));

      if (isNaN(coste)) {
        await sock.sendMessage(jid, {
          text: '⚠️ Coste inválido (usa número o $numero)'
        });
        return;
      }

      // 
      const descripcion = partes.slice(3).join(' ');

      //--guardado en mongo
      const nuevoRegistro = new Registro({
        nombre,
        modelo,
        coste,
        descripcion
      });

      await nuevoRegistro.save();

      console.log('✅ Guardado en Mongo');

      await sock.sendMessage(jid, {
        text: `✅ Guardado:\n${nombre} - ${modelo} - $${coste}`
      });

    } catch (error) {
      console.log('❌ Error:', error);

      await sock.sendMessage(jid, {
        text: '❌ Error al procesar el mensaje'
      });
    }
  });
}

//--inicio
startBot();