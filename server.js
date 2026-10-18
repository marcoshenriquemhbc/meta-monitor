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
        const page = await browser.newPage({
            locale: "pt-BR",
            extraHTTPHeaders: { "Accept-Language": "pt-BR,pt;q=0.9" }
        });

        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

        // Tenta aceitar cookies se aparecer o banner
        try {
            const cookieBtn = page.getByRole("button", { name: /allow all cookies|permitir todos os cookies|aceitar/i });
            await cookieBtn.first().click({ timeout: 5000 });
        } catch (e) {
            // banner não apareceu, segue o jogo
        }

        // Espera até 20s por heading com "resultado" OU "result"
        const heading = page.getByRole("heading", { name: /resultado|result/i });
        await heading.first().waitFor({ timeout: 20000 });

        const text = await heading.first().innerText();
        const match = text.match(/(\d+)/);
        const count = match ? parseInt(match[1], 10) : null;

        res.json({ ok: true, raw_text: text, count });
    } catch (err) {
        // MODO DIAGNÓSTICO: captura o que a página realmente mostrou
        let pageText = null;
        let pageTitle = null;
        try {
            const page = browser ? (await browser.contexts())[0]?.pages()[0] : null;
            if (page) {
                pageTitle = await page.title();
                pageText = await page.locator("body").innerText();
                pageText = pageText.substring(0, 1000); // limita o tamanho
            }
        } catch (e) {}

        res.status(500).json({
            ok: false,
            error: err.message,
            debug_title: pageTitle,
            debug_body_preview: pageText
        });
    } finally {
        if (browser) await browser.close();
    }
});

// ===== /resolve: descobre o page_id a partir do nome ou username (com diagnóstico) =====
app.get("/resolve", async (req, res) => {
    const q = (req.query.q || "").toString().trim();
    if (!q) return res.status(400).json({ ok: false, error: "parâmetro q é obrigatório" });

    const url = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&search_type=page&q=${encodeURIComponent(q)}`;
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({
            locale: "pt-BR",
            extraHTTPHeaders: { "Accept-Language": "pt-BR,pt;q=0.9" }
        });

        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

        try {
            const cookieBtn = page.getByRole("button", { name: /allow all cookies|permitir todos os cookies|aceitar/i });
            await cookieBtn.first().click({ timeout: 5000 });
        } catch (e) {}

        // dá tempo para o JavaScript da página montar os resultados
        await page.waitForTimeout(8000);

        const debug = await page.evaluate(() => {
            const links = [...document.querySelectorAll("a")];
            return {
                title: document.title,
                total_links: links.length,
                links_com_page_id: links.filter(a => (a.href || "").includes("view_all_page_id")).length,
                amostra_hrefs: links.map(a => a.href).filter(h => h && h.includes("ads/library")).slice(0, 5),
                body_preview: document.body.innerText.substring(0, 600)
            };
        });

        const candidatos = await page.$$eval('a[href*="view_all_page_id="]', links => {
            const map = new Map();
            for (const a of links) {
                const m = a.href.match(/view_all_page_id=(\d+)/);
                if (!m) continue;
                const id = m[1];
                const nome = (a.innerText || "").split("\n")[0].trim();
                if (!map.has(id) || (!map.get(id).page_name && nome)) {
                    map.set(id, { page_id: id, page_name: nome });
                }
            }
            return [...map.values()];
        });

        res.json({ ok: true, q, candidatos, debug });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    } finally {
        if (browser) await browser.close();
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor iniciado na porta ${PORT}`);
});
