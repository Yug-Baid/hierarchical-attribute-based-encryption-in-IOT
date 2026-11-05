import urllib.request
import urllib.error
import urllib.parse
import json

BASE_URL = "http://localhost:3000"

def post_json(path, data):
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=json.dumps(data).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

def get_json(path):
    with urllib.request.urlopen(f"{BASE_URL}{path}") as resp:
        return json.loads(resp.read().decode('utf-8'))

print("=== 1. Bootstrapping Enterprise Hierarchy ===")
post_json('/admin/setup', {})
keys_res = get_json('/register/keys')
keys = keys_res.get('keys', [])
alice_key = next((k for k in keys if k['user'] == 'operator_alice'), None)
print(f"Alice key: {alice_key['uskId']}")

print("\n=== 2. Creating Fresh Encrypted Record ===")
enc_res = post_json('/data/encrypt/autonomous', {
    "plantId": "company/plantA",
    "areaId": "company/plantA/areaA1",
    "telemetry": {
        "temperature": 32.0,
        "vibration": 1.1,
        "pressure": 50.0,
        "gas_ppm": 20.0
    },
    "payload": "PRISTINE_SENSOR_PAYLOAD_BEFORE_ATTACK"
})
file_id = enc_res['recordId']
print(f"Created fileId: {file_id}")
print(f"Original on-chain hash: {enc_res['ctHash']}")

print("\n=== 3. Testing Normal Decryption (Before Tampering) ===")
dec_url = f"/data/{file_id}?usk_ids={urllib.parse.quote(alice_key['uskId'])}&operatorAddr=operator_alice"
dec_before = get_json(dec_url)
print(f"Decryption before tamper: ok={dec_before.get('ok')}, pt='{dec_before.get('plaintext')}'")
assert dec_before.get('ok') is True, "Expected decryption to succeed"

print("\n=== 4. Tampering 1 Byte on Disk via POST /data/tamper ===")
tamper_res = post_json('/data/tamper', {"fileId": file_id, "offset": 8})
print(f"Tamper result: ok={tamper_res.get('ok')}")
print(f"  Original hash : {tamper_res.get('originalHash')}")
print(f"  Tampered hash : {tamper_res.get('tamperedHash')}")
assert tamper_res.get('originalHash') != tamper_res.get('tamperedHash'), "Hashes must be different!"

print("\n=== 5. Verifying Status via GET /data/status/:fileId ===")
status_res = get_json(f"/data/status/{file_id}")
print(f"Status check: isTampered={status_res.get('isTampered')}")
print(f"  chainHash: {status_res.get('chainHash')}")
print(f"  localHash: {status_res.get('localHash')}")
assert status_res.get('isTampered') is True, "File must be marked as tampered"

print("\n=== 6. Attempting Decryption in Portal (MUST BE REJECTED BY GATE 1!) ===")
try:
    urllib.request.urlopen(f"{BASE_URL}{dec_url}")
    print("ERROR: Decryption succeeded when it should have been blocked!")
    exit(1)
except urllib.error.HTTPError as e:
    print(f"SUCCESS: Decryption was blocked with HTTP Status: {e.code} ({e.reason})")
    assert e.code == 409, f"Expected HTTP 409 Conflict, got {e.code}"
    body = json.loads(e.read().decode('utf-8'))
    print(f"Gate 1 Error Response: {json.dumps(body, indent=2)}")
    assert body.get('ok') is False
    assert 'tampered' in body.get('error', '').lower()

print("\n=== 7. Restoring Original File via POST /data/restore ===")
restore_res = post_json('/data/restore', {"fileId": file_id})
print(f"Restore result: ok={restore_res.get('ok')}, restored={restore_res.get('restored')}")

print("\n=== 8. Attempting Decryption Again (MUST SUCCEED!) ===")
dec_after = get_json(dec_url)
print(f"Decryption after restore: ok={dec_after.get('ok')}, pt='{dec_after.get('plaintext')}'")
assert dec_after.get('ok') is True, "Expected decryption to succeed after restore"

print("\n>>> ALL TESTS PASSED! Gate 1 is actively blocking tampered files on disk! <<<")
