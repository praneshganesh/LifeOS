# Saavi Chat API

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

## Hosted on Fly.io (TestFlight + external testers)

Config lives in `server/fly.toml` (app `saavi-chat-pranesh`, region **Singapore `sin`** — closest Fly region to UAE that still accepts new VMs).

### 1. Install Fly CLI

```bash
brew install flyctl
fly auth login
```

### 2. Create the app (once)

```bash
fly apps create saavi-chat-pranesh
```

If the name is taken, pick another (e.g. `saavi-chat-pranesh-api`) and update `app = "..."` in `server/fly.toml`.

### 3. Set secrets (once)

Use your OpenAI key from `.env`. Generate a random API token so strangers cannot burn your key:

```bash
openssl rand -hex 24
```

```bash
fly secrets set \
  OPENAI_API_KEY="sk-..." \
  CHAT_API_TOKEN="paste-the-hex-token-here" \
  --app saavi-chat-pranesh
```

### 4. Deploy

From the repo root:

```bash
npm run deploy:chat-api
```

When it finishes, confirm health:

```bash
curl https://saavi-chat-pranesh.fly.dev/health
```

Chat endpoint: `https://saavi-chat-pranesh.fly.dev/chat`

### 5. Point the app at it

**Local dev** — add to `.env`:

```
EXPO_PUBLIC_CHAT_API_URL=https://saavi-chat-pranesh.fly.dev/chat
EXPO_PUBLIC_CHAT_API_TOKEN=paste-the-same-token
```

Restart Expo after changing `EXPO_PUBLIC_*`.

**TestFlight / EAS builds**:

```bash
npx eas-cli secret:create --scope project --name EXPO_PUBLIC_CHAT_API_URL --value "https://saavi-chat-pranesh.fly.dev/chat"
npx eas-cli secret:create --scope project --name EXPO_PUBLIC_CHAT_API_TOKEN --value "paste-the-same-token"
```

Then rebuild iOS.

### Notes

- Native iOS/Android apps omit `Origin`, so CORS allowlists are not required for TestFlight.
- Fly **auto-stops** when idle (~$0 when nobody is talking). First request after idle may take a few seconds (cold start).
- To change region or app name, edit `server/fly.toml` before deploy.

## Privacy

Inventory JSON in the request is a **summary** (names, rooms, prices you already stored). Do not send photos. Auth/sync is separate and not required for Talk.
