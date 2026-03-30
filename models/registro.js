const mongoose = require('mongoose');

const registroSchema = new mongoose.Schema({
  codigo: {
    type: String,
    unique: true
  },
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
  descuento: { 
    type: Number,
    default: 0 
  },
  descripcion: {
    type: String,
    required: true,
    trim: true
  },
  estado: {
    type: String,
    default: 'activo' // por defecto
  },
  fecha: {
    type: Date,
    default: Date.now
  }
});

// 👇 exportar modelo
module.exports = mongoose.model('Registro', registroSchema);