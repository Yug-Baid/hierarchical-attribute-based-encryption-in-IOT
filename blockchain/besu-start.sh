#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$SCRIPT_DIR/data/node1"
GENESIS="$SCRIPT_DIR/config/genesis.json"
mkdir -p "$DATA_DIR"
echo "Starting Besu QBFT node..."
echo "RPC: http://localhost:8545"
/home/infinity/besu-26.2.0/bin/besu \
  --genesis-file="$GENESIS" \
  --data-path="$DATA_DIR" \
  --node-private-key-file="$SCRIPT_DIR/config/node_key" \
  --rpc-http-enabled \
  --rpc-http-host="0.0.0.0" \
  --rpc-http-port=8545 \
  --rpc-http-api=ETH,NET,QBFT,WEB3,TXPOOL,ADMIN \
  --rpc-http-cors-origins="*" \
  --host-allowlist="*" \
  --min-gas-price=0 \
  --logging=INFO \
  --network-id=1337
