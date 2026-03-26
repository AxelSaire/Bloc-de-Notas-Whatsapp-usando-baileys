const mongoose = require('mongoose');

const registroSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
    trim: true
  },
  modelo: {
    type: String,
    required: true,
    trim: true
  },
  coste: {
    type: Number,
    required: true
  },
  descripcion: {
    type: String,
    required: true,
    trim: true
  },
  fecha: {
    type: Date,
    default: Date.now
  }
});

// 👇 exportar modelo
module.exports = mongoose.model('Registro', registroSchema);