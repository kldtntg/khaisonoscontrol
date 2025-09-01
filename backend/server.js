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
app.use((req, res, next) => {
  next();
});

// Middleware to require token from frontend
function requireToken(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Missing Sonos token" });
  req.sonosToken = token;
  next();
}

// Get households
app.get("/api/households", requireToken, async (req, res) => {
  try {
    const r = await fetch(
      "https://api.ws.sonos.com/control/api/v1/households",
      {
        headers: {
          Authorization: `Bearer ${req.sonosToken}`,
          accept: "application/json",
        },
      }
    );
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch households" });
  }
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, "../frontend")));

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

// Endpoint to generate Sonos auth URL
app.post("/auth-url", (req, res) => {
  const { redirect_uri, state } = req.body;
  const scope = "playback-control-all";
  const url = `https://api.sonos.com/login/v3/oauth?client_id=${encodeURIComponent(
    CLIENT_ID
  )}&response_type=code&state=${encodeURIComponent(
    state
  )}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(
    redirect_uri
  )}`;
  res.json({ url });
});

// Endpoint to exchange auth code for access token
app.post("/exchange-token", async (req, res) => {
  const { code, redirect_uri } = req.body;

  try {
    const params = new URLSearchParams();
    params.append("grant_type", "authorization_code");
    params.append("code", code);
    params.append("redirect_uri", redirect_uri);

    const response = await fetch(
      "https://api.sonos.com/login/v3/oauth/access",
      {
        method: "POST",
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      }
    );

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

// Get groups for a household
app.get("/api/groups/:householdId", requireToken, async (req, res) => {
  try {
    const { householdId } = req.params;
    const r = await fetch(
      `https://api.ws.sonos.com/control/api/v1/households/${householdId}/groups`,
      {
        headers: {
          Authorization: `Bearer ${req.sonosToken}`,
          accept: "application/json",
        },
      }
    );
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch groups" });
  }
});

// Get player by ID
app.get("/api/players/:playerId", requireToken, async (req, res) => {
  try {
    const { playerId } = req.params;
    const r = await fetch(
      `https://api.ws.sonos.com/control/api/v1/players/${playerId}`,
      {
        headers: {
          Authorization: `Bearer ${req.sonosToken}`,
          accept: "application/json",
        },
      }
    );
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch player" });
  }
});

// Playback commands
app.post(
  "/api/groups/:groupId/playback/:action",
  requireToken,
  async (req, res) => {
    try {
      const { groupId, action } = req.params;
      const r = await fetch(
        `https://api.ws.sonos.com/control/api/v1/groups/${groupId}/playback/${action}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${req.sonosToken}`,
            accept: "application/json",
          },
        }
      );
      res.status(r.status).send(await r.text());
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to send playback command" });
    }
  }
);

// -------------------------------------------------------------------

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
