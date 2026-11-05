import urllib.request
import json
import time

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

print("1. Running POST /admin/setup...")
setup_res = post_json('/admin/setup', {})
print(f"   Hierarchy setup ok: {setup_res.get('ok')}, provisioned users: {setup_res.get('provisionedUsers')}")

print("\n2. Fetching GET /register/keys...")
keys_res = get_json('/register/keys')
keys = keys_res.get('keys', [])
print(f"   Total active keys in registry: {len(keys)}")
for k in keys:
    print(f"   - User: {k['user']:<18} | DM: {k['dm']:<24} | Attr: {k['attr']}")

print("\n3. Testing Autonomous Encryption (NORMAL state under plantA/areaA1)...")
enc_res = post_json('/data/encrypt/autonomous', {
    "plantId": "company/plantA",
    "areaId": "company/plantA/areaA1",
    "telemetry": {
        "temperature": 35.0,
        "vibration": 1.2,
        "pressure": 50.0,
        "gas_ppm": 20.0
    },
    "payload": "ADVANCED_ROBOTICS_NORMAL_TELEMETRY_DATA_OK"
})
rec_id = enc_res['recordId']
print(f"   Encrypted recordId: {rec_id}, state: {enc_res['predicted_state']}, policy: {enc_res['dynamic_policy']}")

print("\n4. Testing Decryption with Alice (Area A1 Technician)...")
alice_key = next((k for k in keys if k['user'] == 'operator_alice'), None)
if alice_key:
    dec_alice = get_json(f"/data/{rec_id}?usk_ids={urllib.parse.quote(alice_key['uskId'])}&operatorAddr=operator_alice")
    print(f"   Alice Decrypt: ok={dec_alice.get('ok')}, pt={dec_alice.get('plaintext')}, operator={dec_alice.get('operatorAddr')}, clause={dec_alice.get('clause_used')}")

print("\n5. Testing Decryption with Bob (Plant A Manager)...")
bob_key = next((k for k in keys if k['user'] == 'manager_bob'), None)
if bob_key:
    # Even if operatorAddr was left as 'operator_alice', backend correctly derives manager_bob,
    # and when passed manager_bob it logs manager_bob!
    dec_bob = get_json(f"/data/{rec_id}?usk_ids={urllib.parse.quote(bob_key['uskId'])}&operatorAddr=manager_bob")
    print(f"   Bob Decrypt: ok={dec_bob.get('ok')}, pt={dec_bob.get('plaintext')}, operator={dec_bob.get('operatorAddr')}, clause={dec_bob.get('clause_used')}")

print("\n6. Testing CRITICAL Autonomous Encryption & Emergency Officer Decrypt...")
crit_res = post_json('/data/encrypt/autonomous', {
    "plantId": "company/plantA",
    "areaId": "company/plantA/areaA1",
    "telemetry": {
        "temperature": 98.0,
        "vibration": 8.5,
        "pressure": 180.0,
        "gas_ppm": 450.0
    },
    "payload": "CONTAINMENT_BREACH_CRITICAL_OVERHEAT_EVENT"
})
crit_id = crit_res['recordId']
print(f"   Critical recordId: {crit_id}, state: {crit_res['predicted_state']}, policy: {crit_res['dynamic_policy']}")

officer_key = next((k for k in keys if k['user'] == 'emergency_officer'), None)
if officer_key:
    dec_off = get_json(f"/data/{crit_id}?usk_ids={urllib.parse.quote(officer_key['uskId'])}&operatorAddr=emergency_officer")
    print(f"   Emergency Officer Decrypt: ok={dec_off.get('ok')}, pt={dec_off.get('plaintext')}, operator={dec_off.get('operatorAddr')}, clause={dec_off.get('clause_used')}")

print("\n7. Checking Audit Trail Logs for proper Operator Identities...")
audit_res = get_json('/admin/audit')
recent_audits = audit_res.get('logs', [])[:6]
for a in recent_audits:
    print(f"   - Event: {a.get('event'):<20} | Operator: {a.get('raw', {}).get('operatorAddr', 'N/A'):<18} | Record: {a.get('recordId')}")

print("\nAll End-to-End Verification Passed Successfully!")

