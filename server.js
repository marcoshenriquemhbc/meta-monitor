const express = require("express");

const app = express();

app.get("/status", (req, res) => {
    res.json({
        ok: true,
        message: "Meta Monitor funcionando"
    });
});

app.listen(80, () => {
    console.log("Servidor iniciado");
});
