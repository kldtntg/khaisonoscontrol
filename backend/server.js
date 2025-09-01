import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(bodyParser.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, "../frontend")));

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

let SONOS_TOKEN = null;
let TOKEN_EXPIRES_AT = null;
let REFRESH_TOKEN = null;

// Helper: Check if token is valid
function isTokenValid() {
  return SONOS_TOKEN && TOKEN_EXPIRES_AT && new Date() < TOKEN_EXPIRES_AT;
}

// Helper: Refresh Sonos token
async function refreshToken() {
  if (!REFRESH_TOKEN) throw new Error("No refresh token available");

  const params = new URLSearchParams();
  params.append("grant_type", "refresh_token");
  params.append("refresh_token", REFRESH_TOKEN);

  const response = await fetch("https://api.sonos.com/login/v3/oauth/access", {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(data));

  SONOS_TOKEN = data.access_token;
  REFRESH_TOKEN = data.refresh_token || REFRESH_TOKEN;
  TOKEN_EXPIRES_AT = new Date(Date.now() + data.expires_in * 1000);
}

// Helper: Make API request to Sonos, auto-refresh if needed
async function sonosApi(path, options = {}) {
  if (!isTokenValid()) {
    await refreshToken();
  }

  options.headers = {
    ...options.headers,
    Authorization: `Bearer ${SONOS_TOKEN}`,
    Accept: "application/json",
  };

  const res = await fetch(`https://api.ws.sonos.com/control/api/v1${path}`, options);
  const data = await res.json();
  return data;
}

// ------------------ Endpoints ------------------

// Step 1: Get Sonos auth URL
app.post("/auth-url", (req, res) => {
  const { redirect_uri, state } = req.body;
  const scope = "playback-control-all";
  const url = `https://api.sonos.com/login/v3/oauth?client_id=${encodeURIComponent(
    CLIENT_ID
  )}&response_type=code&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(
    scope
  )}&redirect_uri=${encodeURIComponent(redirect_uri)}`;
  res.json({ url });
});

// Step 2: Exchange auth code for access token
app.post("/exchange-token", async (req, res) => {
  const { code, redirect_uri } = req.body;

  try {
    const params = new URLSearchParams();
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", redirect_uri);

    const response = await fetch("https://api.sonos.com/login/v3/oauth/access", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);

    SONOS_TOKEN = data.access_token;
    REFRESH_TOKEN = data.refresh_token;
    TOKEN_EXPIRES_AT = new Date(Date.now() + data.expires_in * 1000);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to exchange code" });
  }
});

// Step 3: Frontend calls for Sonos data
app.get("/api/households", async (req, res) => {
  try {
    const data = await sonosApi("/households");
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch households" });
  }
});

app.get("/api/groups/:householdId", async (req, res) => {
  try {
    const data = await sonosApi(`/households/${req.params.householdId}/groups`);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch groups" });
  }
});

app.get("/api/players/:playerId", async (req, res) => {
  try {
    const data = await sonosApi(`/players/${req.params.playerId}`);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch player" });
  }
});

app.post("/api/groups/:groupId/playback/:action", async (req, res) => {
  try {
    const r = await sonosApi(`/groups/${req.params.groupId}/playback/${req.params.action}`, { method: "POST" });
    res.json(r);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send playback command" });
  }
});

// ------------------ Start server ------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
