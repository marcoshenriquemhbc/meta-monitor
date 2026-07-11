const express = require("express");

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
    res.json({
        status: "online",
        service: "Meta Monitor"
    });
});

app.post("/count", async (req, res) => {
    const { pageId } = req.body;

    if (!pageId) {
        return res.status(400).json({
            error: "pageId é obrigatório"
        });
    }

    // Por enquanto apenas testando a API
    return res.json({
        success: true,
        pageId,
        ads: 0
    });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Meta Monitor iniciado na porta ${PORT}`);
});
