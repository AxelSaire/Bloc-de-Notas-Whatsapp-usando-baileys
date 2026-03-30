const ExcelJS = require('exceljs');
const path = require('path');
const Registro = require('./models/Registro'); 

async function exportarExcel() {
  const registros = await Registro.find();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Registros');

  // --Columnas
  sheet.columns = [
    { header: 'Nombre', key: 'nombre', width: 20 },
    { header: 'Modelo', key: 'modelo', width: 20 },
    { header: 'Coste', key: 'coste', width: 15 },
    { header: 'Descripción', key: 'descripcion', width: 30 },
    { header: 'Fecha', key: 'fecha', width: 25 }
  ];

  // --Insertar datos
  registros.forEach(r => {
    sheet.addRow({
      nombre: r.nombre,
      modelo: r.modelo,
      coste: r.coste,
      descripcion: r.descripcion,
      fecha: r.fecha
    });
  });

  const filePath = path.join(__dirname, 'registros.xlsx');

  await workbook.xlsx.writeFile(filePath);

  return filePath;
}

module.exports = { exportarExcel };