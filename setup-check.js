const fs = require('fs');
require('dotenv').config();

console.log('🔧 Verificando configuración del LinkedIn Email Finder...\n');

// Check Node.js version
const nodeVersion = process.version;
console.log(`✅ Node.js version: ${nodeVersion}`);

// Check if .env file exists
const envExists = fs.existsSync('.env');
console.log(`${envExists ? '✅' : '❌'} Archivo .env: ${envExists ? 'encontrado' : 'no encontrado'}`);

// Check OpenAI API key
const openaiKey = process.env.OPENAI_API_KEY;
console.log(`${openaiKey ? '✅' : '❌'} OPENAI_API_KEY: ${openaiKey ? 'configurada' : 'no configurada'}`);

// Check if Connections.csv exists
const connectionsExists = fs.existsSync('Connections.csv');
console.log(`${connectionsExists ? '✅' : '⚠️'} Archivo Connections.csv: ${connectionsExists ? 'encontrado' : 'no encontrado (puedes usar Connections-example.csv para pruebas)'}`);

// Check dependencies
try {
    require('openai');
    require('csv-parser');
    require('csv-writer');
    require('cli-progress');
    console.log('✅ Dependencias: todas instaladas correctamente');
} catch (error) {
    console.log('❌ Dependencias: faltan algunas dependencias. Ejecuta "npm install"');
}

console.log('\n📋 Estado de la configuración:');

if (envExists && openaiKey) {
    console.log('🟢 Todo listo para usar el script!');
    console.log('\n🚀 Comandos disponibles:');
    console.log('   npm start         - Ejecutar el script principal');
    console.log('   npm run demo      - Ver demo de la barra de progreso');
    console.log('   node setup-check.js - Verificar configuración');
} else {
    console.log('🟡 Configuración incompleta. Sigue estos pasos:');
    if (!envExists) {
        console.log('   1. Copia env.example a .env: cp env.example .env');
    }
    if (!openaiKey) {
        console.log('   2. Edita .env y agrega tu OPENAI_API_KEY');
    }
    if (!connectionsExists) {
        console.log('   3. Agrega tu archivo Connections.csv de LinkedIn');
        console.log('      (o usa Connections-example.csv para pruebas)');
    }
}

console.log('\n📖 Para más información, consulta el README.md'); 