# Dragon Tiger Casino Backend

A production-ready, real-money multiplayer Dragon Tiger card game backend built with **Node.js**, **Express**, **Socket.io**, **PostgreSQL**, and **Redis**.

---

## Architecture Overview

```
HTTP (Express)       WebSocket (Socket.io)
     │                       │
  /register              JWT Handshake
  /login                 PLACE_BET
  /deposit               REQUEST_STATE
     │                       │
  authService          betManager
  ledgerService        roundManager (state machine)
  walletService        tableManager (auto-scaling)
     │                       │
       PostgreSQL         Redis
    (ledger, bets,     (round state, bet totals,
     rounds, users)     bet dedup cache)
```

### Round Lifecycle (15 seconds total)
```
ROUND_INITIALIZATION → BETTING_OPEN (10s) → BETTING_CLOSE → RESULT_REVEAL (3s) → PAYOUT (2s) → ROUND_COMPLETE → (next round)
```

---

## Prerequisites

- Node.js 18+
- Docker & Docker Compose (for local Postgres + Redis)

---

## Quick Start

### 1. Clone & Install
```bash
cd e:\dragonTigerGame
npm install
```

### 2. Configure Environment
```bash
copy .env.example .env
```
Edit `.env` and set a strong `JWT_SECRET`.

### 3. Start Infrastructure
```bash
docker compose up -d
```
This starts PostgreSQL 15 and Redis 7 with the correct default credentials.

### 4. Run Database Migration
```bash
node db/migrate.js
```

### 5. Start the Server
```bash
# Development (auto-restart)
npm run dev

# Production
npm start
```

The server will be available at `http://localhost:3000`.

---

## API Reference

### `POST /register`
Register a new player.
```json
{ "email": "player@example.com", "username": "dragonking", "password": "SecurePass1!" }
```
Response: `{ "success": true, "playerId": "...", "username": "..." }`

### `POST /login`
Authenticate and receive JWT.
```json
{ "email": "player@example.com", "password": "SecurePass1!" }
```
Response: `{ "token": "...", "playerId": "...", "walletBalance": 0 }`

### `POST /deposit` *(JWT required)*
Simulate a deposit. Adds funds to wallet after a 2s simulated delay.
```json
{ "amount": 1000 }
```
Headers: `Authorization: Bearer <token>`
Response: `{ "success": true, "balance": 1000 }`

### `GET /health`
Server health check. No auth required.

---

## WebSocket Protocol

Connect using:
```
ws://localhost:3000?token=<JWT_TOKEN>
```
Or via Socket.io client:
```js
const socket = io('http://localhost:3000', { auth: { token: '<JWT>' } });
```

### Client → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `PLACE_BET` | `{ type, betId, area, amount, timestamp }` | Place a bet |
| `REQUEST_STATE` | — | Request current round state |
| `TABLE_LEAVE` | — | Leave the table |

**Bet area values:** `dragon` \| `tiger` \| `tie`

### Server → Client Events

| Event | Description |
|-------|-------------|
| `STATE_SYNC` | Full state snapshot on connect/reconnect |
| `ROUND_INITIALIZATION` | New round starting |
| `BETTING_OPEN` | Betting window opened, includes `bettingEndsAt` epoch ms |
| `BETTING_CLOSE` | Betting window closed |
| `RESULT_REVEAL` | Cards revealed with `dragonCard`, `tigerCard`, `winner` |
| `PAYOUT` | Payout complete, includes per-player summary |
| `ROUND_COMPLETE` | Round finished |
| `BET_ACCEPTED` | Bet accepted, includes new `balance` |
| `BET_REJECTED` | Bet rejected, includes `reason` |
| `BALANCE_UPDATE` | Updated wallet balance |
| `TIMER_TICK` | Remaining ms in current phase |

---

## Security Features

| Feature | Implementation |
|---------|----------------|
| Server-side RNG | `crypto.randomInt` — cards generated before betting |
| JWT authentication | All HTTP + WebSocket connections verified |
| Ledger-based wallet | `SUM(amount)` from ledger — no direct balance writes |
| Duplicate bet protection | Redis Set per round (bet ID dedup) |
| Replay attack protection | Reject bets with timestamp older than 5 seconds |
| Server-authoritative timer | 500ms early close to absorb network latency |
| Input validation | Joi schemas on all endpoints and WebSocket messages |

---

## Project Structure

```
src/
├── config/          environment.js, database.js, redis.js
├── auth/            authService.js, authController.js, jwtMiddleware.js
├── websocket/       socketServer.js, connectionManager.js, socketEvents.js
├── game/            tableManager.js, roundManager.js, betManager.js,
│                    resultEngine.js, rngService.js
├── wallet/          walletService.js, ledgerService.js
├── payment/         paymentDemo.js
├── models/          userModel.js, betModel.js, roundModel.js, transactionModel.js
├── services/        timerService.js, validationService.js
└── utils/           logger.js
db/
├── migrations/      001_schema.sql
└── migrate.js
logs/                combined.log, error.log (auto-created)
```

---

## Logs

Log files are written to the `logs/` directory:
- `logs/combined.log` — all log levels
- `logs/error.log` — errors only

---

## Deployment

The backend is stateless and horizontally scalable. Recommended architecture:

```
[Load Balancer] → [Game Server 1..N] → [Redis Cluster] + [PostgreSQL Primary]
```

A `render.yaml` or `Dockerfile` can be added on top of this codebase for cloud deployment.
