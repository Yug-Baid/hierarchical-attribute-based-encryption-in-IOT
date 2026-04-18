# Blockchain-Aided HABE — IIoT Access Control

Implementation of Wang et al. (2011) HABE scheme with a Node.js API Gateway
and Hyperledger Besu integration (stubbed, ready to wire).

---

## Project Structure

```
.
├── habe/                        # C + PBC cryptographic engine
│   ├── include/habe.h           # All structs + API prototypes
│   ├── src/
│   │   ├── habe.c               # Setup, CreateDM, CreateUser, Encrypt, Decrypt
│   │   └── utils.c              # H1, H2, HA hash oracles (SHA-256 + PBC)
│   ├── cli/
│   │   └── habe_cli.c           # JSON-in/JSON-out CLI wrapper (child process IPC)
│   ├── demo/
│   │   └── main.c               # Standalone C demo (all PASS)
│   └── Makefile
│
└── api/                         # Node.js API Gateway
    ├── src/
    │   ├── server.js            # Express entry point
    │   ├── services/
    │   │   ├── habe.js          # HABE engine service (child process manager)
    │   │   ├── blockchain.js    # Besu stub (swap for real ethers.js later)
    │   │   └── storage.js       # Local .bin ciphertext storage
    │   ├── routes/
    │   │   ├── admin.js         # POST /admin/setup, GET /admin/health
    │   │   ├── nodes.js         # POST /register, GET /nodes
    │   │   └── data.js          # POST /data, GET /data/:fileId, DELETE
    │   └── middleware/
    │       └── errorHandler.js  # Centralized error + asyncWrap
    ├── test/
    │   └── api.test.js          # End-to-end integration test (no HTTP)
    ├── storage/                 # .bin ciphertext files (git-ignored)
    ├── logs/                    # audit.log (git-ignored)
    ├── .env.example
    └── package.json
```

---

## IIoT Hierarchy (PPT)

```
Root Master (RM) = Company               [HABE engine, not a Besu node]
│
├── Domain Master (DM, depth 1)
│   ├── company/plantA                   [Besu: validator node]
│   └── company/plantB
│
└── Sub-Domain Master (SDM, depth 2)
    ├── company/plantA/areaA1            [Besu: registered node]
    ├── company/plantA/areaA2
    ├── company/plantB/areaB1
    └── company/plantB/areaB2
        └── IoT 1–8                      [no SK — raw data producers]
```

---

## Build

### 1. HABE Engine (C)

```bash
# Dependencies (Ubuntu/Debian)
sudo apt-get install libpbc-dev libgmp-dev libssl-dev

cd habe
make all          # builds habe_demo + habe_cli
make test         # runs C demo (all PASS)
```

### 2. Node.js API

```bash
cd api
npm install
cp .env.example .env
```

---

## Run

### Option A — Integration test (no HTTP server needed)

Tests the full encrypt → storeHash → verify → decrypt pipeline directly
against the service layer.

```bash
cd api
node test/api.test.js
```

Expected output: all `[PASS]`.

### Option B — HTTP server

```bash
cd api
npm start
# or: npm run dev   (auto-restart on file change, Node 18+)
```

---

## API Reference

### Admin

| Method | Path           | Body / Query            | Description                        |
|--------|----------------|-------------------------|------------------------------------|
| POST   | /admin/setup   | —                       | Bootstrap full Plant→Area hierarchy|
| GET    | /admin/health  | —                       | Engine status + uptime             |

### Node Registration

| Method | Path            | Body                                | Description                     |
|--------|-----------------|-------------------------------------|---------------------------------|
| POST   | /register       | `{addr, role, parentAddr?}`        | Register DM or SDM              |
| POST   | /register/user  | `{dmAddr, userAddr, attrPk}`       | Issue user attribute secret key |
| GET    | /nodes          | —                                   | List all registered nodes       |
| GET    | /nodes/:addr    | —                                   | Get specific node               |

`role` values: `"DM"` (Plant-level), `"SDM"` (Area-level)

### Data Lifecycle

| Method | Path             | Body / Query                               | Description               |
|--------|------------------|--------------------------------------------|---------------------------|
| POST   | /data            | `{fileId, plaintext, policy, senderAddr}`  | Encrypt + storeHash + persist |
| GET    | /data/:fileId    | `?usk_ids=id1,id2&clause_idx=0`            | Verify + decrypt          |
| DELETE | /data/:fileId    | `{ownerAddr}`                              | Delete ciphertext         |

#### POST /data — policy format

```json
{
  "fileId": "sensor_001",
  "plaintext": "TEMP=72.4C PRES=101.3",
  "policy": {
    "clauses": [["company/plantA:plant_data"]],
    "dm_pks":  ["company/plantA"]
  },
  "senderAddr": "company/plantA/areaA1"
}
```

#### GET /data/:fileId

```
GET /data/sensor_001?usk_ids=company/plantA|plantA_manager|company/plantA:plant_data&clause_idx=0
```

---

## Data Flow (PPT §Workflow)

```
IoT Device
    │  raw sensor data
    ▼
Area SDM (POST /data)
    │  HABE.Enc(PK, data, π) → CT
    │  SHA-256(CT) → h
    │  storeHash(fileId, h) on Besu
    │  write CT to storage/<fileId>.bin
    ▼
Besu + Local Storage

Operator (GET /data/:fileId)
    │  fetch CT from storage/
    │  getHash(fileId) from Besu      ← Gate 1: h_local == h_chain?
    │  HABE.Dec(CT, SK) → plaintext   ← Gate 2: SK |= π?
    ▼
Plaintext returned
```

---

## Wiring Real Besu (Step 3)

When `BESU_ENABLED=true` in `.env`:

1. Deploy `contracts/HABERegistry.sol` to your Besu network
2. Set `RPC_URL`, `CONTRACT_ADDRESS`, `OPERATOR_PRIVATE_KEY` in `.env`
3. `src/services/blockchain.js` will auto-switch to the ethers.js implementation

The stub and real implementation share the same interface:
`registerNode`, `storeHash`, `getHash`, `auditLog`.

---

## What's Next

| Step | Component                   | Status       |
|------|-----------------------------|--------------|
| 1    | HABE Engine (C + PBC)       | Done         |
| 2    | Node.js API Gateway         | Done         |
| 3    | Solidity Smart Contract     | Next         |
| 4    | Hyperledger Besu node setup | Next         |
| 5    | Wire ethers.js → Besu       | After 3 + 4  |
| 6    | End-to-end system test      | After 5      |