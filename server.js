const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;

app.get("/status", (req, res) => {
    res.json({
        ok: true,
        message: "Meta Monitor funcionando"
    });
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor iniciado na porta ${PORT}`);
});
