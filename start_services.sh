#!/usr/bin/env bash
# start_services.sh — Start HABE IIoT Services (ML Eligibility + API Gateway)
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export ELIGIBILITY_URL="http://127.0.0.1:5001"

echo "=================================================="
echo " Starting Blockchain-Aided HABE Local Stack"
echo "=================================================="

# 1. Start ML Service if not already running
if ss -tlpn | grep -q ":5001 "; then
    echo "[ML Service] Already running on port 5001."
else
    echo "[ML Service] Starting on port 5001..."
    cd "$DIR/ml"
    nohup ./venv/bin/python eligibility_service.py > "$DIR/ml/ml_service.log" 2>&1 &
    sleep 2
    if curl -s http://127.0.0.1:5001/health | grep -q "ok"; then
        echo "[ML Service] Successfully started and healthy."
    else
        echo "[ML Service] Warning: health check did not respond yet. Check ml/ml_service.log."
    fi
fi

# 2. Start Node.js API Gateway if not already running
if ss -tlpn | grep -q ":3000 "; then
    echo "[API Gateway] Already running on port 3000."
else
    echo "[API Gateway] Starting on port 3000..."
    cd "$DIR/api"
    nohup node src/server.js > "$DIR/api/api_server.log" 2>&1 &
    sleep 3
    if curl -s http://127.0.0.1:3000/admin/health | grep -q "ready"; then
        echo "[API Gateway] Successfully started and ready."
    else
        echo "[API Gateway] Warning: health check did not respond yet. Check api/api_server.log."
    fi
fi

echo "=================================================="
echo " All services running locally!"
echo "   - API Gateway:        http://localhost:3000"
echo "   - ML Eligibility:     http://localhost:5001"
echo "   - Health Check:       curl http://localhost:3000/admin/health"
echo "=================================================="
