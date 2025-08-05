# LinkedIn Email Finder

Script en Node.js para buscar emails de contactos de LinkedIn usando OpenAI con barra de progreso integrada.

## 🚀 Características

- ✅ Búsqueda automática de emails usando **búsquedas web + análisis IA**
- 🔍 **Búsquedas reales en DuckDuckGo** (como el script original de Python)
- 🤖 **Análisis inteligente** de resultados web con OpenAI GPT-4
- 📊 Barra de progreso en tiempo real
- 🔧 Configuración flexible mediante variables de entorno
- 📈 Procesamiento por lotes con límites de velocidad
- 💾 Exportación de resultados a CSV
- 🎯 Filtrado automático de conexiones sin email

## 📋 Requisitos

- Node.js 16+ 
- Clave API de OpenAI
- Archivo CSV de conexiones de LinkedIn

## 🛠 Instalación

1. **Instalar dependencias:**
```bash
npm install
```

2. **Configurar variables de entorno:**
Crea un archivo `.env` basado en `env.example`:
```bash
cp env.example .env
```

3. **Editar el archivo `.env`:**
```env
OPENAI_API_KEY=tu_clave_api_openai_aqui
BATCH_SIZE=5
DELAY_BETWEEN_REQUESTS=2000
OUTPUT_FILE=email_search_results.csv
```

## 📁 Preparar archivo de conexiones

1. Ve a LinkedIn → Mi red → Conexiones
2. Haz clic en "Exportar conexiones" 
3. Descarga el archivo CSV
4. Renombra el archivo a `Connections.csv` y colócalo en la carpeta del proyecto

## 🚀 Uso

### Ejecutar con todas las conexiones:
```bash
npm start
# o
node index.js
```

### Ejecutar con muestra (solo N registros):
```bash
# Procesar solo los primeros 5 registros sin email
node index.js -n 5

# Procesar solo los primeros 10 registros sin email  
node index.js -n 10

# También puedes usar scripts npm predefinidos:
npm run test     # Procesa 3 registros (para pruebas rápidas)
npm run sample   # Procesa 5 registros (muestra pequeña)
```

### Reanudar procesamiento (Resume):
```bash
# Continuar desde donde se cortó anteriormente
node index.js --resume

# Continuar pero solo procesar máximo 5 más
node index.js --resume -n 5

# Scripts npm para resume:
npm run resume         # Continuar procesamiento completo
npm run test-resume    # Continuar pero máximo 3 registros
npm run sample-resume  # Continuar pero máximo 5 registros
```

### Resetear y empezar desde cero:
```bash
# Borrar progreso anterior y empezar desde cero
node index.js --reset

# Resetear y procesar solo 10 registros
node index.js --reset -n 10

# Script npm para reset:
npm run reset    # Borrar progreso y archivos de resultado
```

### Ver ayuda:
```bash
node index.js --help
# o
npm run help
```

## ⚙️ Configuración

| Variable | Descripción | Valor por defecto |
|----------|-------------|-------------------|
| `OPENAI_API_KEY` | Clave API de OpenAI (requerida) | - |
| `BATCH_SIZE` | Número de búsquedas por lote | 5 |
| `DELAY_BETWEEN_REQUESTS` | Pausa entre requests (ms) | 2000 |
| `OUTPUT_FILE` | Archivo de salida CSV | email_search_results.csv |

## 📊 Salida

El script genera un archivo CSV con las siguientes columnas:

- **Name**: Nombre del contacto
- **Company**: Empresa
- **Position**: Cargo/posición
- **Email**: Email encontrado
- **Source**: Fuente de la información
- **Confidence**: Nivel de confianza (HIGH/MEDIUM/LOW)
- **Query**: Consulta realizada
- **AI Response**: Respuesta completa de la IA
- **Web Search Results**: Resultados de búsqueda web obtenidos

## 📋 Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `npm start` | Ejecutar con todas las conexiones |
| `npm run test` | Procesar solo 3 registros (prueba rápida) |
| `npm run sample` | Procesar solo 5 registros (muestra pequeña) |
| `npm run resume` | **🔄 Continuar desde progreso anterior** |
| `npm run test-resume` | **🔄 Continuar pero máximo 3 registros** |
| `npm run sample-resume` | **🔄 Continuar pero máximo 5 registros** |
| `npm run reset` | **🗑️ Resetear progreso y empezar desde cero** |
| `npm run demo` | Ver demo de la barra de progreso |
| `npm run check` | Verificar configuración |
| `npm run help` | Mostrar ayuda completa |

## 🔧 Ejemplo de uso

```javascript
const { LinkedInEmailFinder } = require('./index.js');

const finder = new LinkedInEmailFinder();

// Cargar conexiones
const connections = await finder.loadConnections('Connections.csv');

// Procesar búsquedas (todas las conexiones)
const results = await finder.processConnections(connections);

// Procesar solo una muestra (primeros 5 registros)
const sampleResults = await finder.processConnections(connections, 5);

// Guardar resultados
await finder.saveResults(results);
```

## 🔄 Flujo de trabajo recomendado

### 🎯 **Flujo típico para nuevos usuarios:**
```bash
1. npm run test          # Probar con 3 registros
2. npm run sample        # Si funciona, probar con 5 registros  
3. npm run resume        # Continuar con el resto de conexiones
```

### 🔄 **Flujo para usuarios avanzados:**
```bash
1. node index.js -n 50              # Procesar muestra de 50
2. node index.js --resume -n 100    # Continuar con 100 más
3. node index.js --resume           # Procesar todo el resto
```

### 🆘 **Si el script se interrumpe:**
```bash
# Simplemente reanuda donde se cortó:
npm run resume
```

## 🔄 Proceso técnico (igual que el script original de Python)

1. **Búsqueda web**: Se realiza búsqueda real en DuckDuckGo para encontrar información pública
2. **Análisis IA**: OpenAI analiza los resultados web para extraer emails y fuentes
3. **Validación**: Se valida y extrae el email con nivel de confianza
4. **Guardado**: Se almacenan todos los datos incluyendo resultados de búsqueda
5. **🆕 Progreso**: Se guarda progreso automáticamente cada 5 búsquedas

## 📝 Notas importantes

- ⚠️ El script respeta límites de velocidad para evitar sobrecargar APIs
- 🔍 **Realiza búsquedas web reales** en DuckDuckGo (no solo estimaciones de IA)
- 🔒 Solo busca emails de fuentes públicas y profesionales
- 💰 Cada búsqueda consume tokens de OpenAI (revisa tu límite de API)
- 🎯 Procesa únicamente conexiones que no tienen email
- 🌐 Requiere conexión a internet para búsquedas web

## 🛟 Solución de problemas

### Error: "OPENAI_API_KEY no está configurada"
- Verifica que el archivo `.env` existe y contiene tu clave API

### Error: "El archivo Connections.csv no existe"
- Asegúrate de tener el archivo CSV de LinkedIn en la carpeta del proyecto

### Errores de API
- Verifica que tu clave de OpenAI es válida y tiene créditos disponibles
- Reduce el `BATCH_SIZE` si hay muchos errores de límite de velocidad

## 📊 Estadísticas

Al finalizar, el script muestra:
- Total de conexiones procesadas
- Emails encontrados
- Búsquedas con fuentes
- Resultados de alta confianza  
- Tasa de éxito general

## 🔄 Versión

v1.0.0 - Conversión completa del script original de Python a Node.js 