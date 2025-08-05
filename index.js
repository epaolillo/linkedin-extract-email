const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const cliProgress = require('cli-progress');
const { OpenAI } = require('openai');
const axios = require('axios');
require('dotenv').config();

class LinkedInEmailFinder {
    constructor() {
        // Initialize OpenAI client
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
        
        // Load configuration from environment variables
        this.batchSize = parseInt(process.env.BATCH_SIZE) || 5;
        this.delay = parseInt(process.env.DELAY_BETWEEN_REQUESTS) || 2000; // in milliseconds
        this.outputFile = process.env.OUTPUT_FILE || 'email_search_results.csv';
        this.progressFile = process.env.PROGRESS_FILE || 'search_progress.json';
        
        // Initialize progress bar
        this.progressBar = new cliProgress.SingleBar({
            format: 'Progreso |{bar}| {percentage}% | {value}/{total} | ETA: {eta}s | {status}',
            barCompleteChar: '\u2588',
            barIncompleteChar: '\u2591',
            hideCursor: true
        });
    }
    
    /**
     * Load and preprocess LinkedIn connections data
     * @param {string} filePath - Path to the CSV file
     * @returns {Promise<Array>} Array of connection objects
     */
    async loadConnections(filePath) {
        return new Promise((resolve, reject) => {
            const connections = [];
            let skipLines = 0;
            let headerLine = null;
            
            if (!fs.existsSync(filePath)) {
                reject(new Error(`El archivo ${filePath} no existe`));
                return;
            }
            
            // First pass: find the header line (LinkedIn CSV has notes at the beginning)
            const firstPass = fs.createReadStream(filePath)
                .pipe(csv({ skipEmptyLines: true }))
                .on('headers', (headers) => {
                    // Check if this looks like a real header
                    if (headers.includes('First Name') || headers.includes('Full Name')) {
                        headerLine = headers;
                        firstPass.destroy(); // Stop reading
                    }
                })
                .on('error', () => {
                    // If first approach fails, try second pass
                    this.loadConnectionsSecondAttempt(filePath, resolve, reject);
                });
            
            // Give first pass a moment, then try second approach
            setTimeout(() => {
                if (headerLine) {
                    this.loadConnectionsWithHeaders(filePath, resolve, reject);
                } else {
                    this.loadConnectionsSecondAttempt(filePath, resolve, reject);
                }
            }, 100);
        });
    }
    
    /**
     * Load connections with known headers
     */
    loadConnectionsWithHeaders(filePath, resolve, reject) {
        const connections = [];
        
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                // Skip rows that don't have proper data
                if (!row['First Name'] && !row['Full Name'] && Object.keys(row).length < 3) {
                    return;
                }
                
                // Normalize the data to standard format
                const cleanedRow = this.normalizeConnectionData(row);
                if (cleanedRow) {
                    connections.push(cleanedRow);
                }
            })
            .on('end', () => {
                console.log(`✅ Cargadas ${connections.length} conexiones desde ${filePath}`);
                resolve(connections);
            })
            .on('error', (error) => {
                reject(error);
            });
    }
    
    /**
     * Alternative loading method for different CSV formats
     */
    loadConnectionsSecondAttempt(filePath, resolve, reject) {
        const fs = require('fs');
        const lines = fs.readFileSync(filePath, 'utf8').split('\n');
        const connections = [];
        
        // Find the header line
        let headerIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('First Name') || lines[i].includes('Full Name')) {
                headerIndex = i;
                break;
            }
        }
        
        if (headerIndex === -1) {
            reject(new Error('No se pudo encontrar el encabezado del CSV'));
            return;
        }
        
        // Parse from header line onwards
        const headerLine = lines[headerIndex];
        const headers = headerLine.split(',').map(h => h.replace(/"/g, '').trim());
        
        for (let i = headerIndex + 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const values = this.parseCSVLine(line);
            if (values.length >= headers.length - 1) { // Allow for some missing values
                const row = {};
                headers.forEach((header, index) => {
                    row[header] = values[index] || '';
                });
                
                const cleanedRow = this.normalizeConnectionData(row);
                if (cleanedRow) {
                    connections.push(cleanedRow);
                }
            }
        }
        
        console.log(`✅ Cargadas ${connections.length} conexiones desde ${filePath}`);
        resolve(connections);
    }
    
    /**
     * Parse a CSV line handling quoted values
     */
    parseCSVLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        
        values.push(current.trim()); // Add the last value
        return values;
    }
    
    /**
     * Normalize connection data to standard format
     */
    normalizeConnectionData(row) {
        // Skip invalid rows
        if (!row || typeof row !== 'object') return null;
        
        // Extract name information
        let fullName = '';
        let firstName = '';
        let lastName = '';
        
        if (row['Full Name']) {
            fullName = row['Full Name'].trim();
            const nameParts = fullName.split(' ');
            firstName = nameParts[0] || '';
            lastName = nameParts.slice(1).join(' ') || '';
        } else if (row['First Name'] || row['Last Name']) {
            firstName = (row['First Name'] || '').trim();
            lastName = (row['Last Name'] || '').trim();
            fullName = `${firstName} ${lastName}`.trim();
        }
        
        // Skip if no name
        if (!fullName || fullName.length < 2) return null;
        
        // Extract other fields
        const email = row['Email Address'] || row['Email'] || '';
        const company = row['Company'] || '';
        const position = row['Position'] || '';
        
        return {
            'Full Name': fullName,
            'First Name': firstName,
            'Last Name': lastName,
            'Email': email,
            'Company': company,
            'Position': position,
            'Connected On': row['Connected On'] || '',
            'URL': row['URL'] || ''
        };
    }
    
    /**
     * Load previous progress from file
     * @returns {Object} Progress object with processed names and results
     */
    loadProgress() {
        try {
            if (fs.existsSync(this.progressFile)) {
                const progressData = fs.readFileSync(this.progressFile, 'utf8');
                const progress = JSON.parse(progressData);
                return {
                    processedNames: new Set(progress.processedNames || []),
                    results: progress.results || [],
                    startTime: progress.startTime || null,
                    lastUpdate: progress.lastUpdate || null
                };
            }
        } catch (error) {
            console.error('⚠️ Error cargando progreso previo:', error.message);
        }
        
        return {
            processedNames: new Set(),
            results: [],
            startTime: null,
            lastUpdate: null
        };
    }
    
    /**
     * Save current progress to file
     * @param {Set} processedNames - Set of processed names
     * @param {Array} results - Array of results so far
     * @param {string} startTime - When processing started
     */
    saveProgress(processedNames, results, startTime) {
        try {
            const progress = {
                processedNames: Array.from(processedNames),
                results: results,
                startTime: startTime,
                lastUpdate: new Date().toISOString(),
                totalProcessed: processedNames.size
            };
            
            fs.writeFileSync(this.progressFile, JSON.stringify(progress, null, 2));
        } catch (error) {
            console.error('⚠️ Error guardando progreso:', error.message);
        }
    }
    
    /**
     * Reset progress (delete progress file)
     */
    resetProgress() {
        try {
            if (fs.existsSync(this.progressFile)) {
                fs.unlinkSync(this.progressFile);
                console.log('🔄 Progreso previo reseteado');
            }
            if (fs.existsSync(this.outputFile)) {
                fs.unlinkSync(this.outputFile);
                console.log('🔄 Archivo de resultados reseteado');
            }
        } catch (error) {
            console.error('⚠️ Error reseteando progreso:', error.message);
        }
    }
    
    /**
     * Filter out already processed connections
     * @param {Array} connections - All connections
     * @param {Set} processedNames - Set of already processed names
     * @returns {Array} Filtered connections
     */
    filterProcessedConnections(connections, processedNames) {
        return connections.filter(conn => {
            const fullName = conn['Full Name'];
            const key = this.generateConnectionKey(fullName, conn['Company']);
            return !processedNames.has(key);
        });
    }
    
    /**
     * Generate unique key for a connection
     * @param {string} name - Person's name
     * @param {string} company - Company name
     * @returns {string} Unique key
     */
    generateConnectionKey(name, company = '') {
        return `${name}|${company}`.toLowerCase().trim();
    }
    
    /**
     * Search for email address using web search + AI analysis (like original Python script)
     * @param {string} name - Person's name
     * @param {string} company - Company name (optional)
     * @param {string} position - Position/title (optional)
     * @returns {Promise<Object>} Search result object
     */
    async searchEmail(name, company = null, position = null) {
        let query = `Find business email for ${name}`;
        if (company) {
            query += ` who works at ${company}`;
        }
        if (position) {
            query += ` as ${position}`;
        }
        
        try {
            
            // Step 1: Perform web search (like DuckDuckGo in original script)
            const searchResults = await this.performWebSearch(name, company, position);
            
            // Step 2: Use AI to analyze search results and extract email
            const prompt = `
                You are an expert email researcher who analyzes web search results to find business email addresses.
                
                Search Query: ${query}
                
                Web Search Results:
                ${searchResults}
                
                Instructions:
                - Search for professional email addresses from publicly available sources
                - Focus on company websites and professional directories  
                - Always include sources in responses
                - Respect privacy and only return publicly available business email addresses
                - Extract email addresses from the search results provided
                - Return your response in this exact format:
                
                EMAIL: [email address if found, or "NOT_FOUND"]
                SOURCE: [specific URL or source from search results]
                CONFIDENCE: [HIGH/MEDIUM/LOW]
                REASONING: [brief explanation of how you found the email]
                
                Analyze the search results above for: ${name}${company ? ` at ${company}` : ''}${position ? ` (${position})` : ''}
            `;
            
            const response = await this.openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "You are a professional email researcher who finds business emails from web search results. Always be thorough and include sources."
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                max_tokens: 800,
                temperature: 0.3
            });
            
            const responseText = response.choices[0].message.content;
            
            return {
                name: name,
                company: company,
                position: position,
                query: query,
                response: responseText,
                source: this.extractSource(responseText),
                email: this.extractEmail(responseText),
                confidence: this.extractConfidence(responseText),
                searchResults: searchResults.substring(0, 500) + '...' // Include partial search results
            };
            
        } catch (error) {
            console.error(`❌ Error buscando email para ${name}:`, error.message);
            return {
                name: name,
                company: company,
                position: position,
                query: query,
                response: error.message,
                source: '',
                email: '',
                confidence: 'LOW',
                searchResults: ''
            };
        }
    }
    
    /**
     * Perform web search using DuckDuckGo (similar to original Python script)
     * @param {string} name - Person's name
     * @param {string} company - Company name (optional)
     * @param {string} position - Position/title (optional)
     * @returns {Promise<string>} Search results text
     */
    async performWebSearch(name, company, position) {
        try {
            // Build search query similar to original script
            let searchQuery = `"${name}" email`;
            if (company) {
                searchQuery += ` "${company}"`;
            }
            if (position) {
                searchQuery += ` "${position}"`;
            }
            
            // Use DuckDuckGo instant answer API (no-tracking, similar to phi's DuckDuckGo tool)
            const searchUrl = 'https://api.duckduckgo.com/';
            const params = {
                q: searchQuery,
                format: 'json',
                no_html: '1',
                skip_disambig: '1',
                safesearch: 'moderate'
            };
            
            const response = await axios.get(searchUrl, { 
                params,
                timeout: 10000,
                headers: {
                    'User-Agent': 'LinkedInEmailFinder/1.0'
                }
            });
            
            let results = '';
            
            // Extract relevant information from DuckDuckGo response
            if (response.data.Abstract) {
                results += `Abstract: ${response.data.Abstract}\n`;
            }
            
            if (response.data.RelatedTopics && response.data.RelatedTopics.length > 0) {
                results += '\nRelated Information:\n';
                response.data.RelatedTopics.slice(0, 5).forEach((topic, index) => {
                    if (topic.Text) {
                        results += `${index + 1}. ${topic.Text}\n`;
                        if (topic.FirstURL) {
                            results += `   Source: ${topic.FirstURL}\n`;
                        }
                    }
                });
            }
            
            if (response.data.Answer) {
                results += `\nDirect Answer: ${response.data.Answer}\n`;
            }
            
            // If no substantial results, try alternative search approach
            if (results.trim().length < 50) {
                return await this.alternativeWebSearch(name, company, position);
            }
            
            return results || 'No specific web search results found.';
            
        } catch (error) {
            console.error(`⚠️ Web search error for ${name}:`, error.message);
            // Fallback to alternative search
            return await this.alternativeWebSearch(name, company, position);
        }
    }
    
    /**
     * Alternative web search method when primary fails
     * @param {string} name - Person's name
     * @param {string} company - Company name (optional)
     * @param {string} position - Position/title (optional)
     * @returns {Promise<string>} Simulated search context
     */
    async alternativeWebSearch(name, company, position) {
        // Provide context for AI analysis when web search fails
        let context = `Search context for: ${name}`;
        if (company) {
            context += `\nCompany: ${company}`;
            context += `\nPossible email patterns for ${company}: firstname.lastname@${company.toLowerCase().replace(/\s/g, '')}.com, firstname@${company.toLowerCase().replace(/\s/g, '')}.com`;
        }
        if (position) {
            context += `\nPosition: ${position}`;
        }
        
        context += `\nNote: Direct web search was not available. AI should use professional email patterns and company information to make educated guesses.`;
        
        return context;
    }
    
    /**
     * Extract source URLs from the AI response
     * @param {string} response - AI response text
     * @returns {string} Extracted source
     */
    extractSource(response) {
        const sourceMatch = response.match(/SOURCE:\s*([^\n\r]+)/i);
        return sourceMatch ? sourceMatch[1].trim() : '';
    }
    
    /**
     * Extract email address from the response
     * @param {string} response - AI response text
     * @returns {string} Extracted email
     */
    extractEmail(response) {
        const emailMatch = response.match(/EMAIL:\s*([^\n\r]+)/i);
        if (emailMatch) {
            const emailText = emailMatch[1].trim();
            if (emailText === 'NOT_FOUND') {
                return '';
            }
            
            // Additional regex to extract actual email format
            const emailRegex = /[\w\.-]+@[\w\.-]+\.\w+/;
            const regexMatch = emailText.match(emailRegex);
            return regexMatch ? regexMatch[0] : emailText;
        }
        return '';
    }
    
    /**
     * Extract confidence level from the response
     * @param {string} response - AI response text
     * @returns {string} Confidence level
     */
    extractConfidence(response) {
        const confidenceMatch = response.match(/CONFIDENCE:\s*([^\n\r]+)/i);
        return confidenceMatch ? confidenceMatch[1].trim() : 'LOW';
    }
    
    /**
     * Process connections in batches to find missing emails
     * @param {Array} connections - Array of connection objects
     * @param {number|null} sampleSize - Limit processing to first N records (null = process all)
     * @param {boolean} resume - Whether to resume from previous progress
     * @returns {Promise<Array>} Array of search results
     */
    async processConnections(connections, sampleSize = null, resume = false) {
        // Load previous progress if resuming
        let progress = { processedNames: new Set(), results: [], startTime: null, lastUpdate: null };
        if (resume) {
            progress = this.loadProgress();
            if (progress.processedNames.size > 0) {
                console.log(`\n🔄 Reanudando desde progreso anterior (${progress.processedNames.size} ya procesadas)`);
                if (progress.lastUpdate) {
                    console.log(`   Última actualización: ${new Date(progress.lastUpdate).toLocaleString()}`);
                }
            }
        }
        
        // Filter connections without emails (check both 'Email' and 'Email Address' fields)
        let missingEmails = connections.filter(conn => {
            const email = conn.Email || conn['Email Address'] || '';
            return !email || email.trim() === '' || email === 'N/A';
        });
        
        // Filter out already processed connections if resuming
        if (resume && progress.processedNames.size > 0) {
            const beforeFilter = missingEmails.length;
            missingEmails = this.filterProcessedConnections(missingEmails, progress.processedNames);
            const skipped = beforeFilter - missingEmails.length;
            if (skipped > 0) {
                console.log(`   ⏭️ Saltando ${skipped} conexiones ya procesadas`);
            }
        }
        
        // Apply sample size limit if specified
        if (sampleSize && sampleSize > 0) {
            missingEmails = missingEmails.slice(0, sampleSize);
        }
        
        const total = missingEmails.length;
        const totalMissing = connections.filter(conn => {
            const email = conn.Email || conn['Email Address'] || '';
            return !email || email.trim() === '' || email === 'N/A';
        }).length;
        
        if (sampleSize && sampleSize > 0) {
            console.log(`\n🔍 Procesando ${total} de ${totalMissing} conexiones sin email (muestra de ${sampleSize})...`);
        } else {
            console.log(`\n🔍 Procesando ${total} conexiones sin email...`);
        }
        
        if (resume && progress.processedNames.size > 0) {
            console.log(`   📊 Total ya procesadas anteriormente: ${progress.processedNames.size}`);
        }
        
        if (total === 0) {
            if (resume && progress.processedNames.size > 0) {
                console.log('✅ No hay conexiones nuevas para procesar - reanudación completa');
                return progress.results;
            } else if (sampleSize && sampleSize > 0) {
                console.log('✅ No hay conexiones para procesar en la muestra especificada');
            } else {
                console.log('✅ Todas las conexiones ya tienen email');
            }
            return progress.results;
        }
        
        // Initialize results with previous results if resuming
        const results = resume ? [...progress.results] : [];
        const currentSession = [];
        const startTime = progress.startTime || new Date().toISOString();
        
        // Check if we need to write CSV headers (first time or file doesn't exist)
        const csvExists = this.csvFileExists();
        const isFirstSession = !resume || !csvExists;
        let isFirstResult = isFirstSession;
        
        if (isFirstSession && total > 0) {
            console.log('📝 Iniciando archivo CSV con headers...');
        } else if (resume && csvExists) {
            console.log('📝 Continuando en archivo CSV existente...');
        }
        
        // Initialize progress bar
        this.progressBar.start(total, 0, {
            status: 'Iniciando búsqueda...'
        });
        
        // Process in batches
        for (let i = 0; i < total; i += this.batchSize) {
            const batch = missingEmails.slice(i, i + this.batchSize);
            
            // Process batch sequentially to respect rate limits
            for (const [batchIndex, connection] of batch.entries()) {
                const globalIndex = i + batchIndex;
                
                this.progressBar.update(globalIndex, {
                    status: `Buscando: ${connection['Full Name'] || connection['First Name'] + ' ' + connection['Last Name']}`
                });
                
                const result = await this.searchEmail(
                    connection['Full Name'] || `${connection['First Name']} ${connection['Last Name']}`,
                    connection['Company'],
                    connection['Position']
                );
                
                currentSession.push(result);
                results.push(result);
                
                // 🆕 GUARDADO INCREMENTAL - Guarda inmediatamente al CSV
                await this.saveResultIncremental(result, isFirstResult);
                if (isFirstResult) {
                    isFirstResult = false; // Solo la primera vez escribe headers
                }
                
                // Add to processed names
                const connectionKey = this.generateConnectionKey(
                    connection['Full Name'], 
                    connection['Company']
                );
                progress.processedNames.add(connectionKey);
                
                // Save progress every 5 results or at the end
                if (currentSession.length % 5 === 0 || 
                    (currentSession.length > 0 && globalIndex === total - 1)) {
                    this.saveProgress(progress.processedNames, results, startTime);
                }
                
                // Update progress with save confirmation
                this.progressBar.update(globalIndex + 1, {
                    status: `💾 Guardado: ${connection['Full Name'] || connection['First Name'] + ' ' + connection['Last Name']}`
                });
                
                // Rate limiting delay
                if (globalIndex < total - 1) {
                    await this.sleep(this.delay);
                }
            }
            
            // Update progress after batch
            const processed = Math.min(i + this.batchSize, total);
            this.progressBar.update(processed, {
                status: `Completado: ${processed}/${total} (CSV actualizado)`
            });
        }
        
        this.progressBar.stop();
        
        // Final progress save
        this.saveProgress(progress.processedNames, results, startTime);
        
        console.log(`\n✅ Procesamiento completado: ${currentSession.length} búsquedas nuevas realizadas`);
        if (resume && progress.results.length > currentSession.length) {
            console.log(`   📊 Total acumulado: ${results.length} búsquedas (${results.length - currentSession.length} anteriores + ${currentSession.length} nuevas)`);
        }
        console.log(`\n💾 Todos los resultados ya están guardados en ${this.outputFile}`);
        console.log(`   🔄 Si el script se interrumpió, todos los resultados procesados están preservados`);
        
        return results;
    }
    
    /**
     * Save results to CSV file
     * @param {Array} results - Array of search results
     * @param {boolean} append - Whether to append to existing file (for resume)
     * @returns {Promise<void>}
     */
    async saveResults(results, append = false) {
        try {
            const csvWriter = createCsvWriter({
                path: this.outputFile,
                header: [
                    { id: 'name', title: 'Name' },
                    { id: 'company', title: 'Company' },
                    { id: 'position', title: 'Position' },
                    { id: 'email', title: 'Email' },
                    { id: 'source', title: 'Source' },
                    { id: 'confidence', title: 'Confidence' },
                    { id: 'query', title: 'Query' },
                    { id: 'response', title: 'AI Response' },
                    { id: 'searchResults', title: 'Web Search Results' }
                ],
                append: append
            });
            
            await csvWriter.writeRecords(results);
            
            if (append && results.length > 0) {
                console.log(`\n💾 ${results.length} nuevos resultados agregados a ${this.outputFile}`);
            } else {
                console.log(`\n💾 Resultados guardados en ${this.outputFile}`);
            }
            
        } catch (error) {
            console.error('❌ Error guardando resultados:', error.message);
        }
    }
    
    /**
     * Save a single result incrementally to CSV
     * @param {Object} result - Single search result
     * @param {boolean} isFirstResult - Whether this is the first result (write headers)
     * @returns {Promise<void>}
     */
    async saveResultIncremental(result, isFirstResult = false) {
        try {
            const csvWriter = createCsvWriter({
                path: this.outputFile,
                header: [
                    { id: 'name', title: 'Name' },
                    { id: 'company', title: 'Company' },
                    { id: 'position', title: 'Position' },
                    { id: 'email', title: 'Email' },
                    { id: 'source', title: 'Source' },
                    { id: 'confidence', title: 'Confidence' },
                    { id: 'query', title: 'Query' },
                    { id: 'response', title: 'AI Response' },
                    { id: 'searchResults', title: 'Web Search Results' }
                ],
                append: !isFirstResult
            });
            
            await csvWriter.writeRecords([result]);
            
        } catch (error) {
            console.error('⚠️ Error guardando resultado incremental:', error.message);
        }
    }
    
    /**
     * Check if CSV file exists and has content
     * @returns {boolean} True if file exists and has content
     */
    csvFileExists() {
        try {
            if (fs.existsSync(this.outputFile)) {
                const stats = fs.statSync(this.outputFile);
                return stats.size > 0;
            }
            return false;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Sleep function for rate limiting
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Parse command line arguments
function parseCommandLineArgs() {
    const args = process.argv.slice(2);
    const options = {
        sampleSize: null,
        showHelp: false,
        resume: false,
        reset: false
    };
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        if (arg === '-n' && i + 1 < args.length) {
            const sampleSize = parseInt(args[i + 1]);
            if (isNaN(sampleSize) || sampleSize <= 0) {
                console.error('❌ Error: El valor de -n debe ser un número positivo');
                process.exit(1);
            }
            options.sampleSize = sampleSize;
            i++; // Skip next argument since we consumed it
        } else if (arg === '-h' || arg === '--help') {
            options.showHelp = true;
        } else if (arg === '-r' || arg === '--resume') {
            options.resume = true;
        } else if (arg === '--reset') {
            options.reset = true;
        } else if (arg.startsWith('-')) {
            console.error(`❌ Error: Parámetro desconocido: ${arg}`);
            console.log('Usa: node index.js [-n número] [-r|--resume] [--reset] [-h|--help]');
            process.exit(1);
        }
    }
    
    return options;
}

// Show help information
function showHelp() {
    console.log(`
🚀 LinkedIn Email Finder - Ayuda

Uso:
  node index.js [opciones]

Opciones:
  -n número       Procesar solo los primeros N registros sin email
  -r, --resume    Reanudar procesamiento anterior (continúa donde se cortó)
  --reset         Resetear progreso y empezar desde cero
  -h, --help      Mostrar esta ayuda

Ejemplos:
  node index.js                 # Procesar todas las conexiones sin email
  node index.js -n 5            # Procesar solo los primeros 5 registros sin email
  node index.js --resume        # Continuar procesamiento previo
  node index.js --reset -n 10   # Resetear y procesar 10 registros desde cero
  node index.js --resume -n 5   # Continuar y procesar máximo 5 más

Flujo típico:
  1. node index.js -n 5         # Probar con muestra pequeña
  2. node index.js --resume     # Continuar con el resto si funciona bien

Configuración:
  Las opciones se configuran en el archivo .env:
  - OPENAI_API_KEY: Tu clave API de OpenAI (requerida)
  - BATCH_SIZE: Número de búsquedas por lote (default: 5)
  - DELAY_BETWEEN_REQUESTS: Pausa entre requests en ms (default: 2000)
  - OUTPUT_FILE: Archivo de salida CSV (default: email_search_results.csv)
  - PROGRESS_FILE: Archivo de progreso (default: search_progress.json)
`);
}

// Main execution function
async function main() {
    try {
        // Parse command line arguments
        const options = parseCommandLineArgs();
        
        if (options.showHelp) {
            showHelp();
            return;
        }
        
        console.log('🚀 LinkedIn Email Finder - Iniciando...\n');
        
        // Check for required environment variables
        if (!process.env.OPENAI_API_KEY) {
            console.error('❌ Error: OPENAI_API_KEY no está configurada en las variables de entorno');
            process.exit(1);
        }
        
        // Initialize the email finder
        const finder = new LinkedInEmailFinder();
        
        // Handle reset option
        if (options.reset) {
            finder.resetProgress();
        }
        
        // Show mode information
        if (options.resume) {
            console.log('🔄 Modo reanudación: continuando desde progreso anterior');
        }
        if (options.sampleSize) {
            console.log(`🎯 Modo muestra: procesando solo los primeros ${options.sampleSize} registros sin email`);
        }
        if (options.reset) {
            console.log('🔄 Progreso reseteado: empezando desde cero');
        }
        console.log('');
        
        // Load connections
        console.log('📂 Cargando conexiones de LinkedIn...');
        const connections = await finder.loadConnections('Connections.csv');
        
        // Process connections and find emails
        const results = await finder.processConnections(connections, options.sampleSize, options.resume);
        
        if (results.length > 0) {
            // Results are already saved incrementally, no need to save again
            
            // Print summary
            const emailsFound = results.filter(r => r.email && r.email.length > 0).length;
            const sourcesFound = results.filter(r => r.source && r.source.length > 0).length;
            const highConfidence = results.filter(r => r.confidence === 'HIGH').length;
            
            console.log('\n📊 Resumen de Búsqueda de Emails:');
            console.log(`   Total de conexiones procesadas: ${results.length}`);
            console.log(`   Emails encontrados: ${emailsFound}`);
            console.log(`   Búsquedas con fuentes: ${sourcesFound}`);
            console.log(`   Resultados de alta confianza: ${highConfidence}`);
            console.log(`   Tasa de éxito: ${((emailsFound / results.length) * 100).toFixed(1)}%`);
            console.log(`\n📁 Archivo de resultados: ${finder.outputFile}`);
            console.log(`   💡 Los resultados se guardaron automáticamente durante el procesamiento`);
        } else {
            console.log('✅ No hay conexiones para procesar');
        }
        
    } catch (error) {
        console.error('❌ Ocurrió un error:', error.message);
        process.exit(1);
    }
}

// Run the main function if this script is executed directly
if (require.main === module) {
    main();
}

module.exports = { LinkedInEmailFinder }; 