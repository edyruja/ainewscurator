import 'dotenv/config';

async function aflaModele() {
    console.log("Interogăm serverele Google pentru lista de modele permise...\n");
    const cheie = process.env.GEMINI_API_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${cheie}`;
    
    try {
        const raspuns = await fetch(url);
        const date = await raspuns.json();
        
        if (date.error) {
            console.log("❌ Eroare legată de cheia API:", date.error.message);
            return;
        }

        console.log("✅ Modelele la care ai acces pentru generare de text sunt:");
        
        // Filtrăm lista pentru a le afișa doar pe cele care suportă "generateContent"
        date.models.forEach(model => {
            if (model.supportedGenerationMethods && model.supportedGenerationMethods.includes("generateContent")) {
                // Afișăm numele curat, fără prefixul "models/"
                console.log(`-> ${model.name.replace('models/', '')}`);
            }
        });

    } catch (eroare) {
        console.log("❌ A apărut o eroare de rețea:", eroare.message);
    }
}

aflaModele();