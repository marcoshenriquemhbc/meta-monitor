const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 3000;

const normalizar = s => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

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

        // Sem anúncios: a biblioteca mostra um aviso em vez do título de resultados
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

// ===== /resolve (diagnóstico): busca o anunciante pelo nome, abre a página dele e procura view_all_page_id =====
app.get("/resolve", async (req, res) => {
    const q = (req.query.q || "").toString().trim().replace(/^@/, "");
    if (!q) return res.status(400).json({ ok: false, error: "parâmetro q é obrigatório" });

    const url = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&media_type=all&q=${encodeURIComponent(q)}&search_type=keyword_unordered`;
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

        await page.waitForTimeout(8000);

        // procura um link de anunciante cujo texto bata com o nome/username
        const palavras = q.split(/[^a-zA-Z0-9]+/).filter(Boolean);
        const re = new RegExp(palavras.join("[\\s_.\\-]*"), "i");
        const link = page.locator("a").filter({ hasText: re }).first();

        if ((await link.count()) === 0) {
            return res.json({ ok: true, q, page_id: null, status: "anunciante não apareceu na busca" });
        }

        const href = await link.getAttribute("href");
        const destino = new URL(href || "", "https://www.facebook.com").href;

        await page.goto(destino, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(6000);

        const conteudo = await page.content();
        const m = conteudo.match(/view_all_page_id=(\d+)/);
        const links = await page.$$eval("a", as =>
            as.map(a => a.href).filter(h => h && (h.includes("view_all_page_id") || h.includes("ads/library"))).slice(0, 10)
        );

        res.json({
            ok: true,
            q,
            page_id: m ? m[1] : null,
            status: m ? "encontrado" : "view_all_page_id não encontrado na página do anunciante",
            pagina_final: page.url(),
            titulo: await page.title(),
            links_relevantes: links
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
