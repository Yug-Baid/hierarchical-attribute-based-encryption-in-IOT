import axios from 'axios';

// Connect to Node.js API Gateway (port 3000)
export const api = axios.create({
  baseURL: 'http://localhost:3000',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Direct ML microservice connection (port 5001) as fallback
export const mlApi = axios.create({
  baseURL: 'http://127.0.0.1:5001',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const API_SERVICE = {
  // Health
  getHealth: () => api.get('/admin/health'),
  getMlHealth: () => mlApi.get('/health'),

  // Hierarchy & Nodes
  setupHierarchy: () => api.post('/admin/setup'),
  getNodes: () => api.get('/nodes'),
  registerNode: (data) => api.post('/register', data),
  issueUserKey: (data) => api.post('/register/user', data),

  // Autonomous CASE Encryption & Dynamic Policy Formulation
  encryptAutonomous: (data) => api.post('/data/encrypt/autonomous', data),
  predictPolicy: (data) => 
    api.post('/data/predict_policy', data)
       .catch(() => mlApi.post('/predict_policy', data)),

  // Manual Encryption & Decryption
  encryptManual: (data) => api.post('/data/encrypt', data),
  decryptFile: (fileId, uskIds, clauseIdx = 0, operatorAddr = '') =>
    api.get(`/data/${fileId}`, {
      params: {
        usk_ids: Array.isArray(uskIds) ? uskIds.join(',') : uskIds,
        clause_idx: clauseIdx,
        operatorAddr,
      },
    }),
  deleteFile: (fileId, ownerAddr) =>
    api.delete(`/data/${fileId}`, { data: { ownerAddr } }),

  // Bulletins (Gate 3)
  registerBulletin: (data) => api.post('/bulletin/register', data),
  getBulletin: (userAddr) => api.get(`/bulletin/${userAddr}`),

  // Audit Logs & Real Keys
  getAuditLogs: () => api.get('/admin/audit'),
  getIssuedKeys: () => api.get('/register/keys'),
};
