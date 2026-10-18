const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 3000;

const normalizar = s =>
    (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

function distancia(a, b) {
    const m = a.length, n = b.length;
    const d = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) d[i][0] = i;
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
}

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

// ===== /checar: alta se algum anunciante tiver nome parecido com o @; baixa caso contrário =====
app.get("/checar", async (req, res) => {
    const u = (req.query.u || "").toString().trim().replace(/^@/, "");
    if (!u) return res.status(400).json({ ok: false, error: "parâmetro u é obrigatório" });

    const handle = normalizar(u);
    const termos = u.split(/[^a-zA-Z0-9]+/).filter(Boolean).join(" ");
    const url = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&media_type=all&q=${encodeURIComponent(termos)}&search_type=keyword_unordered`;

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

        await page.waitForTimeout(6000);
        const corpo = await page.locator("body").innerText();

        const semResultado = /Nenhum anúncio corresponde|não está veiculando/i.test(corpo);
        const totalMatch = corpo.match(/~?([\d.,]+)\s+resultados/i);
        const total = semResultado ? 0 : (totalMatch ? parseInt(totalMatch[1].replace(/[.,]/g, ""), 10) : null);

        const linhas = corpo.split("\n").map(s => s.trim()).filter(Boolean);
        const bateram = semResultado ? [] : linhas.filter(linha => {
            const n = normalizar(linha);
            if (n.length < 6) return false;
            return n.includes(handle) || (n.length >= 8 && distancia(n, handle) <= 3);
        });

        res.json({
            ok: true,
            u,
            probabilidade: bateram.length > 0 ? "alta probabilidade" : "baixa probabilidade",
            total_resultados: total,
            linhas_que_bateram: [...new Set(bateram)].slice(0, 5)
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
