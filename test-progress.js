const cliProgress = require('cli-progress');

// Demo script to show the progress bar in action
async function demoProgressBar() {
    console.log('🚀 Demostración de la barra de progreso\n');
    
    const progressBar = new cliProgress.SingleBar({
        format: 'Progreso |{bar}| {percentage}% | {value}/{total} | ETA: {eta}s | {status}',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true
    });
    
    const total = 20;
    progressBar.start(total, 0, {
        status: 'Iniciando demo...'
    });
    
    const names = [
        'Juan Pérez',
        'María García', 
        'Carlos López',
        'Ana Martínez',
        'Pedro González',
        'Laura Rodríguez',
        'Miguel Sánchez',
        'Isabel Fernández',
        'José Ruiz',
        'Carmen Jiménez',
        'Antonio Moreno',
        'Pilar Álvarez',
        'Francisco Romero',
        'Rosa Navarro',
        'Manuel Torres',
        'Teresa Gil',
        'David Vázquez',
        'Cristina Serrano',
        'Javier Blanco',
        'Mónica Castro'
    ];
    
    for (let i = 0; i < total; i++) {
        // Simulate email search delay
        await new Promise(resolve => setTimeout(resolve, 500));
        
        progressBar.update(i + 1, {
            status: `Buscando: ${names[i]}`
        });
    }
    
    progressBar.stop();
    console.log('\n✅ Demo completada! Así se ve la barra de progreso en el script real.');
    console.log('📊 Resumen: 20/20 búsquedas simuladas');
}

// Run demo if script is executed directly
if (require.main === module) {
    demoProgressBar();
}

module.exports = { demoProgressBar }; 