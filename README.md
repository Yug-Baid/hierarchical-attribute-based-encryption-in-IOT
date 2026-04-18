# Blockchain-Aided HABE — IIoT Access Control

Hierarchical Attribute-Based Encryption for Industrial IoT, with on-chain
integrity verification via Hyperledger Besu. Implements Wang et al. (2011)
"Hierarchical Attribute-Based Encryption and Scalable User Revocation for
Sharing Data in Cloud Servers", *Computers & Security 30 (2011) 320–331*.

---

## Overview

IoT sensor data is encrypted at the edge (SDM/Area level) under an
attribute-based access policy before leaving the trusted boundary. The
ciphertext hash is anchored on a private Besu blockchain. Authorized
operators decrypt using secret keys derived from a 3-level hierarchy
(Company → Plant → Area). Two independent gates enforce security:

- **Gate 1 (Besu):** SHA-256(CT_local) must match the on-chain hash before
  decryption is attempted. Detects any storage-layer tampering.
- **Gate 2 (HABE):** The bilinear pairing computation only recovers the
  correct plaintext if the operator's secret key satisfies the access policy.
  Wrong key → garbage output → 403.

Before a key can be issued, a third gate enforces attribute eligibility via a
**Public Bulletin** — a server-side record created once per user that combines
deterministic absolute attributes (granted by role) with probabilistic ML
scores (pre-computed from user context). Key issuance is a fast synchronous
bulletin lookup; no ML inference occurs at request time.

Secret keys never leave the HABE engine process. No key material is stored
on-chain or in any database.

---

## Folder Structure

```
Intern_Crypto/
├── habe/
│   ├── include/
│   │   └── habe.h                 # Structs + API prototypes
│   ├── src/
│   │   ├── habe.c                 # Setup, CreateDM, CreateUser, Encrypt, Decrypt
│   │   └── utils.c                # H1, H2, HA hash oracles
│   ├── cli/
│   │   └── habe_cli.c             # JSON stdin/stdout IPC wrapper
│   ├── demo/
│   │   └── main.c                 # Standalone C demo
│   └── Makefile
│
├── api/
│   ├── src/
│   │   ├── server.js              # Express entry point
│   │   ├── services/
│   │   │   ├── habe.js            # Child process manager for habe_cli
│   │   │   ├── blockchain.js      # Auto-switches stub ↔ Besu via BESU_ENABLED
│   │   │   ├── blockchain.besu.js # Real ethers.js v6 implementation
│   │   │   ├── storage.js         # Local .bin ciphertext read/write
│   │   │   ├── eligibility.js     # Flask client for /predict (legacy runtime gate)
│   │   │   └── bulletin.js        # Bulletin store: creation, lookup, UNION_ATTRS
│   │   ├── routes/
│   │   │   ├── admin.js           # /admin/setup, /admin/health
│   │   │   ├── nodes.js           # /register, /register/user, /nodes
│   │   │   ├── bulletin.js        # /bulletin/register, /bulletin/:userAddr
│   │   │   └── data.js            # /data — encrypt, decrypt, delete
│   │   └── middleware/
│   │       └── errorHandler.js
│   ├── test/
│   │   ├── api.test.js            # Service-layer integration (27 tests)
│   │   ├── e2e.test.js            # Full HTTP end-to-end (12 tests)
│   │   └── benchmark.js           # Latency measurements
│   ├── storage/                   # .bin ciphertext files
│   ├── bulletins.json             # Bulletin store (server-side, not user-visible)
│   ├── logs/                      # audit.log
│   ├── .env
│   └── package.json
│
├── ml/
│   ├── venv/                      # Python virtual environment (git-ignored)
│   ├── generate_data.py           # Synthetic training data generator (6 attr types)
│   ├── train_model.py             # Train + evaluate Random Forest model
│   ├── eligibility_service.py     # Flask microservice: /predict, /score, /health
│   ├── model.joblib               # Trained RF model artifact
│   ├── model_meta.json            # Feature list + model metadata
│   └── ml_test.py                 # Standalone eligibility service tests (47 tests)
│
└── blockchain/
    ├── contracts/
    │   └── HABERegistry.sol       # registerNode, storeHash, getHash, auditLog
    ├── scripts/
    │   ├── deploy.js              # Compile + deploy, writes deployment.json
    │   └── generate-extra-data.js # QBFT extraData for genesis (run once)
    ├── test/
    │   └── contract.test.js       # Direct ethers.js contract tests (9 tests)
    ├── config/
    │   ├── qbft-config.json       # Input for besu operator generate-blockchain-config
    │   ├── genesis.json           # QBFT genesis, chainId=1337
    │   ├── node_key               # RM node private key
    │   └── deployment.json        # Contract address + ABI (written by deploy.js)
    ├── data/node1/                # Besu chain data (git-ignored)
    └── besu-start.sh
```

---

## Architecture

```
                        Node.js API Gateway
                       ┌──────────────────────────────────────────────┐
                       │                                              │
  HTTP clients ──────► │  /admin/*  /bulletin/*  /register/*  /data/*│
                       │      │          │              │         │   │
                       │  habe.js  bulletin.js   blockchain.js storage│
                       │      │          │         (ethers.js)  (.bin)│
                       └──────┼──────────┼──────────────┼────────────┘
                              │          │              │
                   stdin/stdout JSON  HTTP/REST     JSON-RPC
                              │          │              │
                       ┌──────┴──┐  ┌────┴────────────┐  ┌──────────────────┐
                       │habe_cli │  │eligibility_svc  │  │ Hyperledger Besu │
                       │ (C+PBC) │  │(Flask+RF, :5001)│  │ HABERegistry.sol │
                       └─────────┘  └─────────────────┘  └──────────────────┘
```

The API spawns `habe_cli` as a single persistent child process and
communicates via newline-delimited JSON on stdin/stdout. All HABE operations
are serialized through a request queue — concurrent API calls never
interleave. Besu is accessed via ethers.js v6 using a deployed
`HABERegistry` contract on a private QBFT network (chainId=1337).

The eligibility service is called **once per user** at bulletin registration
time (POST /bulletin/register). It is not called at key issuance time —
eligibility checks at that point are synchronous bulletin lookups with no
external I/O.

---

## Key Hierarchy

```
Company (Root Master)
├── Plant A (Domain Master, depth 1)
│   ├── Area A1 (Sub-Domain Master, depth 2)
│   │   ├── IoT 1, IoT 2   ← no secret key, push raw data only
│   └── Area A2
│       ├── IoT 3, IoT 4
└── Plant B (Domain Master, depth 1)
    ├── Area B1
    │   ├── IoT 5, IoT 6
    └── Area B2
        ├── IoT 7, IoT 8
```

Key delegation follows the hierarchy strictly. A Plant A key satisfies any
Plant A policy. An Area A1 key satisfies any Area A1 policy. A Plant B key
cannot satisfy a Plant A policy — the pairing math produces garbage, Gate 2
rejects it.

Public key strings double as node identifiers throughout the system:
`"company/plantA"`, `"company/plantA/areaA1"`, etc.

---

## ML Eligibility Layer — Public Bulletin Design

Wang et al.'s CreateUser specifies that "the DM first checks whether U is
eligible for attribute a" before issuing a secret key. This check is
implemented via a **Public Bulletin** stored server-side, following the
spirit of the paper's bulletin-board model.

### Attribute Types

Six IIoT-semantically graded attribute types are defined, ordered by
sensitivity:

| Attribute | Sensitivity | IIoT Meaning | Min Role |
|---|---|---|---|
| `sensor_data` | 1 | Raw sensor readings (temp, pressure, flow) | technician |
| `telemetry_data` | 2 | Aggregated time-series, device health metrics | technician |
| `maintenance_data` | 3 | Equipment logs, fault history, calibration records | engineer |
| `plant_data` | 4 | Production metrics, process parameters | engineer |
| `control_data` | 5 | Actuator commands, setpoints, PLC configs | manager |
| `admin_data` | 6 | User roles, key registry, audit config | admin only |

### Bulletin Schema

```json
{
  "userAddr":       "operator1",
  "dmAddr":         "company/plantA/areaA1",
  "absolute_attrs": ["company/plantA/areaA1:sensor_data"],
  "ml_scores": {
    "company/plantA/areaA1:sensor_data":      0.95,
    "company/plantA/areaA1:telemetry_data":   0.86,
    "company/plantA/areaA1:maintenance_data": 0.24,
    "company/plantA/areaA1:plant_data":       0.26,
    "company/plantA/areaA1:control_data":     0.25,
    "company/plantA/areaA1:admin_data":       0.21
  },
  "context": {
    "role": "technician",
    "location": "areaA1",
    "device_trust": "high",
    "past_violations": 0
  },
  "createdAt": "2026-04-11T20:32:27.882Z"
}
```

### UNION_ATTRS and Eligibility

```
UNION_ATTRS = absolute_attrs ∪ { attr | ml_scores[attr] >= THRESHOLD[attr] }
eligible    = attrPk ∈ UNION_ATTRS
```

**Absolute attributes** are granted deterministically by role — no ML score
required:

| Role | Absolute Attributes |
|---|---|
| technician | `sensor_data` |
| engineer | `sensor_data`, `telemetry_data` |
| manager | `sensor_data`, `telemetry_data`, `maintenance_data`, `plant_data` |
| admin | all six |

**Probabilistic attributes** are gated by per-type ML confidence thresholds:

| Attribute | Threshold | Probabilistic zone for |
|---|---|---|
| `sensor_data` | 0.45 | — (typically covered by absolute) |
| `telemetry_data` | 0.50 | technician (location + trust dependent) |
| `maintenance_data` | 0.55 | engineer (high trust required) |
| `plant_data` | 0.60 | engineer (location dependent) |
| `control_data` | 0.70 | manager (business hours + on-location) |
| `admin_data` | 0.85 | effectively unreachable via ML for non-admin |

### Bulletin Lifecycle

```
POST /bulletin/register  (called once per user, by provisioner)
         ↓
ML service POST /score — runs RF inference for all 6 attrs in one call
         ↓
Compute absolute_attrs from role (deterministic)
         ↓
Store bulletin to bulletins.json
         ↓
POST /register/user  (called per key request, no ML involved)
         ↓
Read bulletin from store (sync file read)
         ↓
Compute UNION_ATTRS
         ↓
attrPk ∈ UNION_ATTRS?
  YES → habe.createUser(dmAddr, userAddr, attrPk)
  NO  → 403 + blockchain.auditLog('userKeyDenied', ...)
```

### ML Model

- **Algorithm:** Random Forest, 100 trees, max_depth=12, class_weight=balanced
- **Features (8):** `role_encoded`, `location_match`, `time_hour`,
  `is_business_hours`, `device_trust_encoded`, `past_violations`,
  `attr_sensitivity`, `hierarchy_depth`
- **Training data:** 6300 synthetic samples (6000 random + 300 targeted
  augmentation at the off-hours boundary), 4% label noise
- **Trained on:** `generate_data.py` → `train_model.py` → `model.joblib`
- **Inference:** called once at bulletin creation via `/score` endpoint;
  never called at key issuance time

---

## HABE Construction (Wang et al. §5)

The scheme operates over a Type A symmetric bilinear pairing
`ê: G1 × G1 → GT` with a BDH-hard group of prime order q.

**Setup:** Pick `mk0 ∈ Zq`, `P0 ∈ G1`, set `Q0 = mk0·P0`. Publish
`(P0, Q0)`. Keep `mk0` secret at the Root Master.

**CreateDM (depth d):** Accumulate
`SKd = Σ_{k=0}^{d-1} mk_k · P_{k+1}` where `P_k = H1(DM_k PK)`.
Each level adds one term. The Q-tuple `(Q0, Q1, ..., Qd)` where
`Qk = mkk·P0` is passed down the chain.

**CreateUser:** Issue `SKi,u,a = SKi + mki·mku·Pa` where
`mku = HA(user_pk)` and `Pa = H1(mki_str || ":" || attr_pk)`.

**Encrypt (DNF policy):** For each conjunctive clause `CCi` at depth `d`:
```
U0        = r·P0
U_chain_k = r·H1(ancestor_pk_{k+1})   for k = 0..d-2
U_attr    = r·Σ Pa_j
V         = plaintext ⊕ H2(ê(Q0, nA·r·P1))
```
where `nA = lcm(n1,...,nN)` and `P1 = H1(depth-1 DM pk)`.

**Decrypt:** Recover `ê(Q0, nA·r·P1)` by computing:
```
term1 = ê(U0, coeff·Σ SKi,u,aj)
term2 = ê(id_key, coeff·U_attr)       ← cancels attr contribution
chain = Π ê(U_chain_k, nA·Q_{k+1})   ← cancels ancestor chain
result = term1 / term2 / chain
```
All intermediate terms cancel algebraically, leaving exactly
`ê(Q0, nA·r·P1)`. Apply `H2` and XOR with `V` to recover plaintext.
Decryption requires **O(1) bilinear map operations** regardless of policy
complexity (Muller et al. 2008 DNF construction).

Hash oracles use SHA-256 as the ROM instantiation:
- `H1: {0,1}* → G1` via `element_from_hash`
- `H2: GT → {0,1}^32` via SHA-256 of serialized GT element
- `HA: {0,1}* → Zq` via SHA-256 reduced mod q

**Security:** IND-CPA secure under the BDH assumption in the Random Oracle
Model. Collusion resistant — users cannot combine partial keys to satisfy a
policy none of them individually satisfies (Wang et al. §6.2, Appendix A).

---

## Smart Contract

`HABERegistry.sol` is a minimal append-only registry deployed on a private
QBFT network. It has four functions:

```
registerNode(addr, role, parentAddr)   Record DM/SDM node + hierarchy edge
storeHash(fileId, hash, meta)          Anchor SHA-256(CT), append-only
getHash(fileId)                        Read hash for Gate 1 verification
auditLog(eventName, data)              Emit indexed on-chain audit event
```

The contract enforces append-only semantics (`require(!hashes[fileId].exists)`)
and requires `msg.sender == admin` for `registerNode`. No access control
logic lives on-chain — that is entirely HABE's responsibility.

The contract is compiled with `evmVersion: 'london'` to avoid the `PUSH0`
opcode introduced in Shanghai, which Besu 26.x rejects in certain genesis
configurations.

---

## Data Flow

**Write path (IoT → storage):**

1. IoT device sends raw sensor data to its Area SDM.
2. SDM calls `POST /data` with plaintext and access policy.
3. API calls `habe_encrypt` → CT hex.
4. API computes `SHA-256(CT)` and calls `blockchain.storeHash(fileId, hash)`.
5. Besu mines the transaction (block confirmation ~2s on QBFT with 2s period).
6. API writes CT to `storage/<fileId>.bin`.
7. Returns `{ fileId, ctHash, txHash }` to caller.

**Read path (operator → plaintext):**

1. Operator calls `GET /data/:fileId?usk_ids=...&clause_idx=0`.
2. API reads CT from `storage/<fileId>.bin`.
3. **Gate 1:** `blockchain.getHash(fileId)` → compare `SHA-256(CT_local)` with
   chain hash. Mismatch → `409 Conflict`, abort.
4. **Gate 2:** `habe_decrypt(CT, SK)` → check result is valid printable ASCII.
   Garbage output (wrong key) → `403 Forbidden`.
5. Return plaintext to operator.

**User provisioning path (admin → bulletin → key):**

1. Provisioner calls `POST /bulletin/register` with user context.
2. API calls Flask `/score` once — RF inference for all 6 attrs in one call.
3. Bulletin (absolute_attrs + ml_scores) stored server-side in `bulletins.json`.
4. Later: operator calls `POST /register/user` with `{ dmAddr, userAddr, attrPk }`.
5. API reads bulletin from store (sync, no external I/O).
6. Computes UNION_ATTRS, checks membership.
7. Allowed → `habe.createUser`, returns `usk_id`.
8. Denied → 403 + `blockchain.auditLog('userKeyDenied', ...)`.

---

## API Reference

All requests/responses are JSON. The server listens on `PORT` (default 3000).

### Hierarchy Management

```
POST /admin/setup
  Bootstrap the full Company → Plant → Area hierarchy (idempotent).
  Response: { ok, hierarchy: { plantA, plantB, areaA1, ... } }

GET  /admin/health
  Response: { ok, engine: "ready"|"not_started", uptime }

POST /register
  Body:     { addr, role, parentAddr? }
  role:     "DM" | "SDM"
  Response: { ok, addr, role, dm_pk, txHash }

GET  /nodes
  Response: { ok, nodes: [{ addr, role, parentAddr, timestamp }] }
```

### Bulletin Management

```
POST /bulletin/register
  Register a user bulletin. Calls ML service once to pre-compute scores
  for all 6 attribute types under dmAddr. Must be called before
  POST /register/user.

  Body: {
    "userAddr": "operator1",
    "dmAddr":   "company/plantA/areaA1",
    "context": {
      "role":            "technician"|"engineer"|"manager"|"admin",
      "location":        string,
      "time_of_day":     "HH:MM",
      "device_trust":    "low"|"medium"|"high",
      "past_violations": number
    }
  }
  Response 201: { ok, bulletin, union_attrs }
  Errors:   400 missing/invalid fields
            503 ML service unreachable (fail-closed — bulletin not stored)

  Re-registering an existing userAddr overwrites the bulletin.
  Context change → union_attrs changes → previously probabilistic attrs
  may be revoked at next key issuance attempt.

GET /bulletin/:userAddr
  Response 200: { ok, bulletin, union_attrs }
  Response 404: user not found
```

### Key Issuance

```
POST /register/user
  Issue a user attribute secret key. Requires bulletin to exist for userAddr.
  No ML inference at this point — eligibility is a synchronous bulletin lookup.

  Body:     { dmAddr, userAddr, attrPk }
  Response: { ok, usk_id }
  Errors:   400 missing fields
            403 attrPk not in UNION_ATTRS, or no bulletin registered
            (denial logged on-chain via auditLog('userKeyDenied', ...))

  usk_id format: "<dmAddr>|<userAddr>|<attrPk>"
  usk_id is the handle used in decrypt calls.
```

### Data Lifecycle

```
POST /data
  Body: {
    fileId:     string,
    plaintext:  string (max 32 bytes, zero-padded),
    policy: {
      clauses:  string[][]   // DNF: array of attribute arrays
      dm_pks:   string[]     // one DM pk per clause
    },
    senderAddr: string
  }
  Response: { ok, fileId, ctHash, txHash }

GET  /data/:fileId?usk_ids=id1,id2&clause_idx=0&operatorAddr=x
  usk_ids:    comma-separated usk_id handles from /register/user
  clause_idx: which DNF clause to use for decryption (default 0)
  Response:   { ok, fileId, plaintext, plaintext_hex }
  Errors:     409 if CT tampered (Gate 1), 403 if policy not satisfied (Gate 2)

DELETE /data/:fileId
  Body:     { ownerAddr }
  Response: { ok, deleted }
```

**Policy format example:**
```json
{
  "clauses": [["company/plantA:plant_data"]],
  "dm_pks":  ["company/plantA"]
}
```

**DNF conjunction (both keys required):**
```json
{
  "clauses": [["company/plantA/areaA1:sensor_data",
               "company/plantA/areaA1:plant_data"]],
  "dm_pks":  ["company/plantA/areaA1"]
}
```

---

## Performance

Measured on Ubuntu 24.04 (WSL2), AMD Ryzen 5 3400G, 16GB RAM, Besu 26.2.0,
Type A pairing (512-bit group order, 80-bit security).

| Operation | Latency | Breakdown |
|---|---|---|
| HABE Encrypt (any depth, 1 attr) | ~4200ms avg | Bilinear pairing dominant |
| HABE Decrypt (any depth) | ~4200ms avg | O(1) maps, same cost at all depths |
| `POST /data` (encrypt + storeHash) | ~8100–8500ms | ~4200ms HABE + ~3900ms Besu block |
| `GET /data` (getHash + decrypt) | ~4200ms avg | Besu read <10ms, rest is HABE |
| Besu `storeHash` (block confirm) | ~4150ms avg | 2s block period, arrives mid-period |
| Besu `getHash` (view call) | <10ms | No mining wait |
| Ciphertext size | KB-scale | Grows linearly with DNF clause count |
| On-chain record | 32B + metadata | Hash only — CT stays off-chain |
| Node.js API overhead | <5ms | Negligible vs pairing and Besu |
| `POST /bulletin/register` (ML cost) | ~273ms avg | Flask /score × 6 attrs — paid once per user |
| Bulletin lookup + CreateUser (eligible) | ~3323ms avg | Sync file read (<5ms) + HABE CreateUser |
| Bulletin lookup denial (no HABE) | ~4017ms avg | Sync lookup + Besu auditLog block wait |
| ML inference overhead at key issuance | 0ms | Eliminated — bulletin lookup only |

The depth-2 SDM decrypt is identical in cost to depth-1 DM decrypt because
the chain correction adds only scalar multiplications, not additional pairings.
The O(1) bilinear map property (Muller et al. 2008) holds in practice.

The denial path latency (~4017ms) is dominated by `blockchain.auditLog` awaiting
Besu block confirmation, not by the bulletin lookup itself. The lookup is <5ms.

---

## Dependencies

### HABE Engine
- **PBC** — pairing-based cryptography library
- **GMP** — arbitrary precision arithmetic
- **OpenSSL** — SHA-256 for hash oracles H1, H2, HA

```bash
sudo apt-get install libpbc-dev libgmp-dev libssl-dev
```

### API Gateway
- **Node.js** ≥ 18
- **express** ^4.18
- **ethers** ^6.9
- **dotenv** ^17

### Blockchain
- **Hyperledger Besu** 26.x (requires Java 21)
- **solc** ^0.8.24 (via npm, for deploy script)

### ML Eligibility Service
- **Python** >= 3.10
- **scikit-learn** — Random Forest classifier
- **flask** — inference microservice
- **numpy**, **pandas** — data generation and feature extraction
- **requests** — used by ml_test.py
- **joblib** — model serialization

```bash
cd ml
python3 -m venv venv
source venv/bin/activate
pip install scikit-learn flask numpy pandas requests joblib
```

---

## Build

```bash
# HABE engine + CLI binary
cd habe
make all

# Verify
make test          # 18/18 PASS

# Node.js API
cd api
npm install
```

---

## Setup & Run

**1. Generate Besu network config (once)**
```bash
cd blockchain
npm install
besu operator generate-blockchain-config \
  --config-file=config/qbft-config.json \
  --to=config/networkFiles \
  --private-key-file-name=key

NODE=$(ls config/networkFiles/keys/)
cp config/networkFiles/genesis.json config/genesis.json
cp config/networkFiles/keys/$NODE/key config/node_key

python3 -c "
import json
with open('config/genesis.json') as f: g = json.load(f)
g['alloc'] = {'$NODE': {'balance': '0xad78ebc5ac6200000'}}
g['config']['londonBlock'] = 0
with open('config/genesis.json','w') as f: json.dump(g, f, indent=2)
"
```

**2. Start Besu (leave running)**
```bash
cd blockchain
./besu-start.sh
# Wait for: "Produced empty block #1"
```

**3. Deploy contract**
```bash
cd blockchain
export DEPLOYER_KEY=$(cat config/node_key)
node scripts/deploy.js
# Writes config/deployment.json
```

**4. Configure API**
```bash
cd api
cat > .env << EOF
PORT=3000
BESU_ENABLED=true
RPC_URL=http://localhost:8545
CONTRACT_ADDRESS=<from deployment.json>
OPERATOR_PRIVATE_KEY=$(cat ../blockchain/config/node_key)
EOF
```

**5. Train ML model (first time or after generate_data.py changes)**
```bash
cd ml
source venv/bin/activate
python generate_data.py    # generates training_data.csv
python train_model.py      # writes model.joblib + model_meta.json
```

**6. Start eligibility service (leave running)**
```bash
cd ml
source venv/bin/activate
python eligibility_service.py
# [eligibility] Model loaded: 100 trees...
# [eligibility] Listening on http://localhost:5001
```

**7. Start API**
```bash
cd api
npm start
# [eligibility] Service ready at http://127.0.0.1:5001
# [blockchain:besu] Contract at 0x...
# [server] Listening on http://localhost:3000
```

---

## Typical Usage Flow

```bash
# 1. Bootstrap hierarchy
curl -X POST http://localhost:3000/admin/setup

# 2. Register a bulletin for the user (ML runs here, once)
curl -X POST http://localhost:3000/bulletin/register \
  -H "Content-Type: application/json" \
  -d '{
    "userAddr": "operator1",
    "dmAddr":   "company/plantA/areaA1",
    "context": {
      "role":            "technician",
      "location":        "areaA1",
      "time_of_day":     "09:00",
      "device_trust":    "high",
      "past_violations": 0
    }
  }'
# Response: { bulletin: { absolute_attrs, ml_scores }, union_attrs }

# 3. Issue a key (bulletin lookup — no ML inference)
curl -X POST http://localhost:3000/register/user \
  -H "Content-Type: application/json" \
  -d '{
    "dmAddr":   "company/plantA/areaA1",
    "userAddr": "operator1",
    "attrPk":   "company/plantA/areaA1:sensor_data"
  }'
# Response: { ok: true, usk_id: "company/plantA/areaA1|operator1|..." }

# 4. Encrypt data
curl -X POST http://localhost:3000/data \
  -H "Content-Type: application/json" \
  -d '{
    "fileId": "sensor_001",
    "plaintext": "TEMP=72.4C",
    "policy": {
      "clauses": [["company/plantA/areaA1:sensor_data"]],
      "dm_pks":  ["company/plantA/areaA1"]
    },
    "senderAddr": "company/plantA/areaA1"
  }'

# 5. Decrypt data (Gate 1 + Gate 2)
curl "http://localhost:3000/data/sensor_001?usk_ids=<usk_id>&clause_idx=0"
```

---

## Testing

```bash
# Service-layer integration (eligibility service must be running)
cd api
node test/api.test.js      # 27/27 PASS  (HABE pipeline + bulletin service layer)

# Full HTTP end-to-end (requires running server + Besu + eligibility service)
node test/e2e.test.js      # 12/12 PASS  (full pipeline + bulletin gate + context change)

# Latency benchmark
node test/benchmark.js
```

```bash
# ML eligibility service tests (standalone — no HABE or Besu needed)
cd ml
source venv/bin/activate
python ml_test.py          # 47/47 PASS
```

```bash
# Contract tests (requires running Besu + deployed contract)
cd blockchain
export DEPLOYER_KEY=$(cat config/node_key)
node test/contract.test.js  # 9/9 PASS
```

**Test coverage:**

| Suite | Tests | Covers |
|---|---|---|
| `make test` (C) | 18 | Setup, CreateDM, CreateUser, Encrypt, Decrypt at all depths, DNF, tamper detection |
| `contract.test.js` | 9 | registerNode, storeHash, getHash, auditLog, listNodes, duplicate/revert cases |
| `api.test.js` | 27 | Full pipeline via service layer: hierarchy → key issuance → encrypt → verify → decrypt + bulletin service layer (createBulletin, checkEligibility, union logic, degraded context) |
| `e2e.test.js` | 12 | HTTP routes, Gate 1 (409), Gate 2 (403), bulletin registration, key issuance gate, context change revocation, GET /bulletin |
| `ml_test.py` | 47 | Health, /score shape + correctness + validation, /predict eligible cases (all 6 attr types, all roles), denial rules in isolation (13 rules), compound denial, hierarchy depth coverage, confidence ordering, input validation |

---

## Security Considerations

**What this implementation guarantees:**
- Ciphertext confidentiality against the storage layer (CSP learns nothing)
- Policy enforcement via bilinear pairing — no explicit check needed
- Collusion resistance — partial keys from different users cannot be combined
- Storage integrity — any byte-level modification to CT is detected at Gate 1
- Non-repudiation — every access, store, and register event is logged on-chain
- Attribute eligibility enforcement — bulletin gate blocks key issuance to
  ineligible operators before HABE is invoked
- Context integrity — user context is supplied by a trusted provisioner at
  bulletin creation time, not by the user at key request time; self-reporting
  is eliminated
- Fail-closed eligibility — if the ML service is unreachable at bulletin
  creation time, the bulletin is not stored and key issuance will be denied
  (503); the ML service is not in the critical path at key issuance time
- Denial audit trail — every denied key request is logged on-chain via
  `auditLog('userKeyDenied', ...)`
- Context change enforcement — re-registering a bulletin with degraded context
  (higher violations, lower trust) immediately revokes probabilistic attrs from
  UNION_ATTRS; next key request for those attrs is denied

**Known limitations:**
- Gate 2 uses a printability heuristic to detect wrong-key decryption. In
  production, use HABE to encrypt a random AES-256 key, then encrypt data with
  AES-GCM. The GCM authentication tag provides a cryptographically explicit
  failure signal on wrong-key decryption.
- The HABE engine holds all secret keys in memory for the process lifetime.
  In production, keys should be persisted encrypted to disk and re-derived on
  startup, or held in a hardware security module.
- Security proof covers IND-CPA (chosen plaintext attacks). IND-CCA2 requires
  additional machinery (e.g., Fujisaki-Okamoto transform).
- Type A pairing provides ~80-bit security. For higher security, switch to
  Type F or BLS12-381 pairings — requires recompiling PBC with appropriate
  parameters.
- The bulletin store uses a flat JSON file (`bulletins.json`). For production,
  replace with a database with access control — the store contains user context
  and eligibility data.
- The ML eligibility model is trained on synthetic data. Retrain on real
  access logs once available. The labeling rules in `generate_data.py`
  encode the access policy and must be updated to match your site's actual
  policy before retraining.
- The eligibility service runs as a single-threaded Flask process. For
  production load, replace with gunicorn: `venv/bin/gunicorn -w 2 eligibility_service:app`.
  At key issuance time this is irrelevant (no Flask call); it only matters
  under concurrent bulletin registration load.