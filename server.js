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

        try {
            const cookieBtn = page.getByRole("button", { name: /allow all cookies|permitir todos os cookies|aceitar/i });
            await cookieBtn.first().click({ timeout: 5000 });
        } catch (e) {}

        await page.waitForTimeout(3000);
        const corpo = await page.locator("body").innerText();
        if (/Nenhum anúncio corresponde|não está veiculando/i.test(corpo)) {
            return res.json({ ok: true, raw_text: "0 resultados", count: 0 });
        }

        const heading = page.getByRole("heading", { name: /resultado|result/i });
        await heading.first().waitFor({ timeout: 20000 });

        const text = await heading.first().innerText();
        const match = text.match(/([\d.,]+)/);
        const count = match ? parseInt(match[1].replace(/[.,]/g, ""), 10) : null;

        res.json({ ok: true, raw_text: text, count });
    } catch (err) {
        let pageText = null;
        let pageTitle = null;
        try {
            const page = browser ? (await browser.contexts())[0]?.pages()[0] : null;
            if (page) {
                pageTitle = await page.title();
                pageText = (await page.locator("body").innerText()).substring(0, 1000);
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

// ===== /perfil: lê o nome de exibição da página pública do Instagram pelo @ =====
app.get("/perfil", async (req, res) => {
    const u = (req.query.u || "").toString().trim().replace(/^@/, "");
    if (!u) return res.status(400).json({ ok: false, error: "parâmetro u é obrigatório" });

    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({
            locale: "pt-BR",
            extraHTTPHeaders: { "Accept-Language": "pt-BR,pt;q=0.9" }
        });

        await page.goto(`https://www.instagram.com/${encodeURIComponent(u)}/`, {
            waitUntil: "domcontentloaded",
            timeout: 30000
        });
        await page.waitForTimeout(3000);

        const meta = await page.evaluate(() => ({
            og_title: document.querySelector('meta[property="og:title"]')?.content || null,
            og_description: document.querySelector('meta[property="og:description"]')?.content || null,
            description: document.querySelector('meta[name="description"]')?.content || null
        }));

        res.json({
            ok: true,
            u,
            title: await page.title(),
            ...meta,
            pagina_final: page.url()
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
