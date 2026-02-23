import axios from "axios";

const API_BASE = "/api";

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

/* ------------------------------------------------------------------ */
/*  Backend connection status (reactive)                               */
/* ------------------------------------------------------------------ */
type StatusListener = (connected: boolean) => void;
const _listeners = new Set<StatusListener>();
let _backendConnected = false;

export function onBackendStatus(fn: StatusListener) {
  _listeners.add(fn);
  fn(_backendConnected); // notify immediately with current state
  return () => _listeners.delete(fn);
}
export function isBackendConnected() {
  return _backendConnected;
}
function _setConnected(v: boolean) {
  if (v !== _backendConnected) {
    _backendConnected = v;
    _listeners.forEach((fn) => fn(v));
  }
}

// Health-check poller — runs every 5 s, marks backend up/down
let _polling = false;
export function startHealthPoll() {
  if (_polling) return;
  _polling = true;
  const poll = async () => {
    try {
      await axios.get("/health", { timeout: 4000 });
      _setConnected(true);
    } catch {
      _setConnected(false);
    }
  };
  poll(); // immediate first check
  setInterval(poll, 5000);
}

// Axios interceptor — update status on every response / error
api.interceptors.response.use(
  (res) => {
    _setConnected(true);
    return res;
  },
  (err) => {
    if (!err.response) {
      // Network error (ECONNREFUSED, timeout, etc.)
      _setConnected(false);
    }
    return Promise.reject(err);
  },
);

// Inference endpoints
export const inference = {
  run: (text: string, modelName = "french") =>
    api.post("/inference/run", { text, model_name: modelName }),

  generate: (prompt: string, modelName = "french", maxTokens = 50) =>
    api.post("/inference/generate", {
      prompt,
      model_name: modelName,
      max_tokens: maxTokens,
    }),

  extractDetailed: (text: string, modelName = "french") =>
    api.post("/inference/extract-detailed", { text, model_name: modelName }),
};

// Analysis endpoints
export const analysis = {
  sparsity: (texts: string[], modelName = "french") =>
    api.post("/analysis/sparsity", { texts, model_name: modelName }),

  probeConcept: (
    conceptName: string,
    examples: string[],
    modelName = "french",
  ) =>
    api.post("/analysis/probe-concept", {
      concept_name: conceptName,
      examples,
      model_name: modelName,
    }),

  neuronFingerprint: (
    conceptName: string,
    words: string[],
    modelName = "french",
  ) =>
    api.post("/analysis/neuron-fingerprint", {
      concept_name: conceptName,
      examples: words,
      model_name: modelName,
    }),

  compare: (text: string, modelNames: string[]) =>
    api.post("/analysis/compare", { text, model_names: modelNames }),

  getConceptCategories: () => api.get("/analysis/concept-categories"),

  /**
   * Live synapse tracking: send a sentence through the model and get
   * token-by-token x_sparse activations for specified neurons.
   */
  synapseTrack: (
    sentence: string,
    synapses: { layer: number; head: number; neuron: number }[],
    modelName = "french",
  ) =>
    api.post("/analysis/synapse-track", {
      sentence,
      synapses,
      model_name: modelName,
    }),
};

// Model endpoints
export const models = {
  list: () => api.get("/models/list"),

  getInfo: (modelName: string) => api.get(`/models/${modelName}`),

  load: (modelName: string, checkpointPath?: string) =>
    api.post("/models/load", {
      model_name: modelName,
      checkpoint_path: checkpointPath,
    }),

  unload: (modelName: string) => api.post(`/models/${modelName}/unload`),

  getGraph: (modelName: string, threshold = 0.01) =>
    api.get(`/models/${modelName}/graph`, { params: { threshold } }),
};

// Visualization endpoints
export const visualization = {
  playback: (text: string, modelName = "french", includeAttention = false) =>
    api.post("/visualization/playback", {
      text,
      model_name: modelName,
      include_attention: includeAttention,
    }),

  hebbianTrack: (text: string, modelName = "french") =>
    api.post("/visualization/hebbian-track", { text, model_name: modelName }),

  getArchitectureSpec: () => api.get("/visualization/architecture-spec"),

  getColorScheme: () => api.get("/visualization/color-scheme"),
};

// Utility function to load playback from static JSON
export async function loadPlaybackJSON(filename: string) {
  const response = await fetch(`/playback/${filename}`);
  if (!response.ok) throw new Error(`Failed to load ${filename}`);
  return response.json();
}

// Health check (hits root /health, NOT /api/health)
export const health = () => axios.get("/health", { timeout: 4000 });

 // Graph Brain endpoints
export const graph = {
  getClusters: (modelName: string, head = 0, beta = 1.0, maxNodes = 400) =>
    api.get(`/graph/clusters/${modelName}`, {
      params: { head, beta, max_nodes: maxNodes },
      timeout: 60000,
    }),

  activate: (text: string, modelName = "french", head = 0, layer = -1) =>
    api.post("/graph/activate", {
      text,
      model_name: modelName,
      head,
      layer,
     }),

  clearCache: () => api.delete("/graph/cache"),
 };


