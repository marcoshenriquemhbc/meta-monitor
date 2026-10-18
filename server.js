const express = require("express");
const { chromium } = require("playwright");
const { execFile } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

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

// ===== /perfil: tira print da página pública do Instagram e lê o texto com OCR (Tesseract) =====
app.get("/perfil", async (req, res) => {
    const u = (req.query.u || "").toString().trim().replace(/^@/, "");
    if (!u) return res.status(400).json({ ok: false, error: "parâmetro u é obrigatório" });

    let browser;
    const shotPath = path.join(os.tmpdir(), `perfil_${Date.now()}.png`);
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({
            locale: "pt-BR",
            viewport: { width: 1280, height: 900 },
            extraHTTPHeaders: { "Accept-Language": "pt-BR,pt;q=0.9" }
        });

        await page.goto(`https://www.instagram.com/${encodeURIComponent(u)}/`, {
            waitUntil: "domcontentloaded",
            timeout: 30000
        });
        await page.waitForTimeout(4000);

        const og_title = await page.evaluate(() =>
            document.querySelector('meta[property="og:title"]')?.content || null
        );

        await page.screenshot({ path: shotPath, fullPage: false });

        const texto = await new Promise((resolve, reject) => {
            execFile("tesseract", [shotPath, "stdout", "-l", "por+eng"], (err, stdout) =>
                err ? reject(err) : resolve(stdout)
            );
        });

        const linhas = texto.split("\n").map(s => s.trim()).filter(Boolean);

        res.json({
            ok: true,
            u,
            og_title,
            ocr_linhas: linhas,
            pagina_final: page.url()
        });
    } catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    } finally {
        fs.unlink(shotPath, () => {});
        if (browser) await browser.close();
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor iniciado na porta ${PORT}`);
});
