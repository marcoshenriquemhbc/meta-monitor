const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.send("OK");
});

app.get("/status", (req, res) => {
    res.json({ ok: true, message: "Meta Monitor funcionando" });
});

app.get("/count", async (req, res) => {
    const { url } = req.query;

    if (!url || !url.includes("facebook.com/ads/library")) {
        return res.status(400).json({ error: "Parâmetro 'url' inválido ou ausente" });
    }

    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();

        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

        // Espera até 15s por qualquer heading que contenha "resultado"
        const heading = page.getByRole("heading", { name: /resultado/i });
        await heading.first().waitFor({ timeout: 15000 });

        const text = await heading.first().innerText();
        // Extrai o número de dentro do texto, ex: "~3 resultados" -> 3
        const match = text.match(/(\d+)/);
        const count = match ? parseInt(match[1], 10) : null;

        res.json({
            ok: true,
            raw_text: text,
            count: count
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    } finally {
        if (browser) await browser.close();
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor iniciado na porta ${PORT}`);
});
