import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const client = axios.create({ baseURL: API });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem("pg_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const api = {
  login: (email, password) => client.post("/auth/login", { email, password }).then((r) => r.data),
  health: () => client.get("/health").then((r) => r.data),
  predict: (text, language, model) => client.post("/predict", { text, language, model }).then((r) => r.data),
  analyze: (text, language) => client.post("/analyze", { text, language }).then((r) => r.data),
  metrics: () => client.get("/models/metrics").then((r) => r.data),
  feed: () => client.get("/feed").then((r) => r.data),
  stats: () => client.get("/stats").then((r) => r.data),
  datasets: () => client.get("/datasets").then((r) => r.data),
  roadmap: () => client.get("/roadmap").then((r) => r.data),
  workflow: () => client.get("/workflow").then((r) => r.data),

  // Threat Intelligence Hub
  threats: (params) => client.get("/threats", { params }).then((r) => r.data),
  threatStats: () => client.get("/threats/stats").then((r) => r.data),
  reportThreat: (body) => client.post("/threats/report", body).then((r) => r.data),
  lookupThreat: (value) => client.get("/threats/lookup", { params: { value } }).then((r) => r.data),
  voteThreat: (id, direction) => client.post(`/threats/${id}/vote`, { direction }).then((r) => r.data),
  threatExportUrl: (format = "csv") => `${API}/threats/export?format=${format}`,

  // E-mail
  analyzeEmail: (body) => client.post("/email/analyze", body).then((r) => r.data),
  analyzeEml: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return client.post("/email/analyze-eml", fd).then((r) => r.data);
  },
  emailProviders: () => client.get("/email/providers").then((r) => r.data),
  emailConnect: (provider) => client.get(`/email/${provider}/connect`).then((r) => r.data),
  emailScan: (provider, max_results = 20) => client.post(`/email/${provider}/scan`, { max_results }).then((r) => r.data),
  emailDisconnect: (provider) => client.post(`/email/${provider}/disconnect`).then((r) => r.data),
  emailResults: (params) => client.get("/email/results", { params }).then((r) => r.data),

  // Voice
  voiceStatus: () => client.get("/voice/status").then((r) => r.data),
  analyzeVoice: (file, language) => {
    const fd = new FormData();
    fd.append("file", file);
    if (language && language !== "auto") fd.append("language", language);
    return client.post("/voice/analyze", fd, { timeout: 300000 }).then((r) => r.data);
  },
  analyzeTranscript: (text) => client.post("/voice/analyze-transcript", { text }).then((r) => r.data),
};

export default api;
