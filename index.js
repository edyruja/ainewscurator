import 'dotenv/config';
import express from 'express';
import { Inngest } from 'inngest';
import { serve } from 'inngest/express';
import { tavily } from "@tavily/core";
import FirecrawlApp from "@mendable/firecrawl-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Resend } from 'resend';

const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });
const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);
const inngest = new Inngest({ id: "agent-stiri-ai" });

const buletinZilnic = inngest.createFunction(
    { 
        id: "trimite-ziar-dimineata",
        triggers: [{ cron: "0 8 * * *" }] 
    },
    
    async ({ step }) => {
        
        await step.run("proceseaza-stirile", async () => {
            console.log("⏰ Începem căutarea multiplă...");
            
            // 1. MĂRIM PLASA: Căutăm cele mai bune 5 articole
            const raspuns = await tvly.search("latest news and updates about AI agentic workflows", {
                searchDepth: "advanced", timeRange: "w", maxResults: 5, 
                excludeDomains: ["youtube.com", "tiktok.com", "facebook.com", "instagram.com", "digisport.ro", "gsp.ro", "stirileprotv.ro", "protv.ro"] 
            });

            // 2. DOCUMENTUL TEMPORAR: Aici vom lipi toate rezumatele la un loc
            let continutEmail = "";
            let articoleGasite = 0; // Ținem o numărătoare ca să știm câte au trecut filtrul

            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

            // 3. BUCLA MAGICA: Agentul ia fiecare link pe rând și îl procesează
            for (const rezultat of raspuns.results) {
                console.log(`\n📄 Procesăm: ${rezultat.title}`);
                
                try {
                    const rezultatScrape = await firecrawl.scrapeUrl(rezultat.url, { formats: ['markdown'] });
                    const textArticol = rezultatScrape.markdown || (rezultatScrape.data && rezultatScrape.data.markdown);
                    
                    // Dacă pagina e goală sau blocată, îi spunem codului cu "continue" să treacă automat la următorul link
                    if (!textArticol) {
                        console.log("➡️ Fără text, sărim peste.");
                        continue; 
                    }

                    const prompt = `You are a personal AI news curator.
                    The user's core interests include: software development (Java, MATLAB, SQL), AI and agentic workflows, robotics and embedded systems, football analytics (specifically U Cluj and CFR Cluj), and contemporary trap/hip-hop music.

                    Task:
                    1. Read the provided text and score it from 1 to 10 based on how well it matches the user's interests.
                    2. If the score is 7 or above, provide the score, followed by a 3-bullet point summary in English, and a bolded '**Why it matters:**' sentence.
                    3. If the score is below 7, simply output: "Skipped: Not relevant enough to user interests (Score: X/10)".

                    Textul de analizat:
                    ${textArticol}`;
                    
                    const result = await model.generateContent(prompt);
                    const raspunsAI = result.response.text();

                    // 4. FILTRAREA: Dacă a primit notă bună, îl lipim în documentul temporar
                    if (!raspunsAI.includes("Skipped")) {
                        console.log("⭐ Articol relevant adăugat la ziar!");
                        articoleGasite++;
                        
                        // Adăugăm în textul lung un bloc de HTML pentru fiecare articol
                        const textHTML = raspunsAI.replace(/\n/g, '<br>');
                        continutEmail += `
                            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                                <h3 style="margin-top: 0; color: #1e40af;">${rezultat.title}</h3>
                                ${textHTML}
                                <p style="margin-top: 15px; font-size: 0.9em;">
                                    🔗 <a href="${rezultat.url}">Citește tot articolul</a>
                                </p>
                            </div>
                        `;
                    } else {
                        console.log("❌ Articol irelevant, a picat testul filtrării.");
                    }
                } catch (eroare) {
                    console.log(`⚠️ Eroare la procesarea acestui link: ${eroare.message}`);
                }
            } // Aici se termină bucla

            // 5. EXPEDIEREA UNICĂ: La final, trimitem emailul DOAR dacă am găsit măcar o știre bună
            if (articoleGasite > 0) {
                console.log(`\n📤 Trimitem emailul cu ${articoleGasite} articole...`);
                
                await resend.emails.send({
                    from: 'Agent AI <onboarding@resend.dev>',
                    to: 'edy.ruja@gmail.com',
                    subject: `🤖 Ziarul tău AI de azi (${articoleGasite} știri noi)`,
                    html: `
                        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                            <h2 style="color: #2563eb;">Bună dimineața, Ruja Eduard-Andrei!</h2>
                            <p>Agentul tău a citit zeci de pagini și a selectat cele mai bune materiale pentru tine:</p>
                            ${continutEmail}
                        </div>
                    `
                });
                console.log("✅ Ziarul zilnic a fost trimis cu succes!");
            } else {
                console.log("🤷‍♂️ Niciun articol nu a trecut filtrul astăzi. Nu trimitem email ca să nu te deranjăm degeaba.");
            }

            return `Sarcina finalizată. Articole selectate: ${articoleGasite}`;
        });
    }
);

const app = express();
app.use(express.json());
app.use("/api/inngest", serve({ client: inngest, functions: [buletinZilnic] }));
app.listen(3000, () => console.log("🚀 Serverul este pornit pe portul 3000..."));