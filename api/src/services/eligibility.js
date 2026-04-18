/**
 * eligibility.js — HABE CreateUser eligibility check
 *
 * Calls the local Python eligibility microservice before key issuance.
 * The service runs at ELIGIBILITY_URL (default http://127.0.0.1:5001).
 *
 * Returns:
 *   { eligible: true,  confidence: 0.87, reason: "..." }
 *   { eligible: false, confidence: 0.91, reason: "..." }
 *
 * Throws on network failure or non-200 response from the service.
 */

const ELIGIBILITY_URL = process.env.ELIGIBILITY_URL || "http://127.0.0.1:5001";
const ELIGIBILITY_TIMEOUT_MS = parseInt(process.env.ELIGIBILITY_TIMEOUT_MS || "3000", 10);

/**
 * @param {object} params
 * @param {string} params.dmAddr   - e.g. "company/plantA/areaA1"
 * @param {string} params.userAddr - e.g. "operator1"
 * @param {string} params.attrPk   - e.g. "company/plantA/areaA1:sensor_data"
 * @param {object} params.context  - { role, location, time_of_day, device_trust, past_violations }
 * @returns {Promise<{ eligible: boolean, confidence: number, reason: string }>}
 */
async function checkEligibility({ dmAddr, userAddr, attrPk, context }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ELIGIBILITY_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${ELIGIBILITY_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dmAddr, userAddr, attrPk, context }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      throw new Error(`eligibility service timeout after ${ELIGIBILITY_TIMEOUT_MS}ms`);
    }
    throw new Error(`eligibility service unreachable: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  const body = await response.json();

  if (!response.ok) {
    // 400: validation error from feature extraction
    const detail = Array.isArray(body.error) ? body.error.join("; ") : body.error;
    throw new Error(`eligibility service error (${response.status}): ${detail}`);
  }

  return {
    eligible: Boolean(body.eligible),
    confidence: body.confidence,
    reason: body.reason,
  };
}

/**
 * Health check — call on startup to verify the service is up.
 * Logs a warning but does not throw — allows the API to start without the ML service
 * and fail only at the first /register/user call.
 */
async function pingEligibilityService() {
  try {
    const res = await fetch(`${ELIGIBILITY_URL}/health`, { method: "GET" });
    const body = await res.json();
    if (body.ok && body.model_loaded) {
      console.log(`[eligibility] Service ready at ${ELIGIBILITY_URL}`);
    } else {
      console.warn(`[eligibility] Service responded but model not loaded: ${JSON.stringify(body)}`);
    }
  } catch (err) {
    console.warn(`[eligibility] Service not reachable at startup (${err.message}). /register/user will fail until it starts.`);
  }
}

module.exports = { checkEligibility, pingEligibilityService };