const express = require("express");
const fetch = require("node-fetch");
const bodyParser = require("body-parser");
require("dotenv").config();
const path = require("path");


const app = express();
app.use(bodyParser.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, "../frontend")));

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

console.log('khai', process.env.CLIENT_ID, process.env.CLIENT_SECRET)

// Endpoint to generate Sonos auth URL
app.post("/auth-url", (req, res) => {
  const { redirect_uri, state } = req.body;
  const scope = "playback-control-all";
  const url = `https://api.sonos.com/login/v3/oauth?client_id=${encodeURIComponent(CLIENT_ID)}&response_type=code&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirect_uri)}`;
  res.json({ url });
});

app.post("/exchange-token", async (req, res) => {
  const { code, redirect_uri } = req.body;
  console.log('khai', code, redirect_uri)

  try {
    const params = new URLSearchParams();
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", redirect_uri);

    const response = await fetch("https://api.sonos.com/login/v3/oauth/access", {
      method: "POST",
      headers: {
        "Authorization": "Basic " + Buffer.from(
          process.env.CLIENT_ID + ":" + process.env.CLIENT_SECRET
        ).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Sonos token error:", data);
      return res.status(response.status).json(data);
    }

    res.json(data);

  } catch (err) {
    console.error("Exchange token failed:", err);
    res.status(500).json({ error: "Failed to exchange code" });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));

