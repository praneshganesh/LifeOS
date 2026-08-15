# LifeOS Chat API

Chat and Talk send every user turn to a cheap model (`gpt-4o-mini` by default) via a proxy. Inventory stays on-device; only chat text + a short item summary leave the device. The OpenAI key never ships in the app.

## Cost

At default `gpt-4o-mini` rates (~$0.15 / 1M input, $0.60 / 1M output), a typical turn is ~600–900 tokens ≈ **$0.0001–$0.0002**. Roughly **25 turns ≈ $0.01**.

The proxy logs `costUsd` + running `sessionUsd` each request. Local `GET /health` also returns session totals; production health omits spend.

Guards (defaults): **30 requests/minute** and **200/day per IP**, 64 KB body cap, 20s OpenAI timeout. Optional `CHAT_API_TOKEN` rejects requests without `Authorization: Bearer …`.

## Local

```bash
cp .env.example .env
# OPENAI_API_KEY=...
npm run chat-api
npx expo start
```

Web / Simulator: `EXPO_PUBLIC_CHAT_API_URL=http://localhost:8787/chat`  
Physical phone on Wi‑Fi: `http://<mac-lan-ip>:8787/chat` (`ipconfig getifaddr en0`), then restart Expo.

## Hosted (B0) — deferred

Stay on **local** `npm run chat-api` until a device off this Wi‑Fi needs Talk.

When you host: **Render or Fly**, not Vercel. Scaling notes and the decision table live in `docs/ROADMAP.md` (B0). Fly config is already in `server/fly.toml`; Render is dashboard + `node server/chat.mjs` (set `OPENAI_API_KEY`, optional `CHAT_API_TOKEN`). Then:

```
EXPO_PUBLIC_CHAT_API_URL=https://<host>/chat
EXPO_PUBLIC_CHAT_API_TOKEN=<same as CHAT_API_TOKEN if set>
```

Restart Expo after changing `EXPO_PUBLIC_*`.


## Privacy

Inventory JSON in the request is a **summary** (names, rooms, prices you already stored). Do not send photos. Auth/sync (B1–B2) is separate and not required for Talk.
