"""
Graph Brain API Routes

Endpoints for neuron cluster visualization:
- Extract clusters from G* = Dx @ E using Louvain community detection
- Map inference activations to clusters (per-token for char-by-char playback)
- Subsample graph for frontend visualization
"""

import json
import sys
import time
from pathlib import Path
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
import torch
import numpy as np

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "training"))
from bdh import ExtractionConfig

router = APIRouter()


# =============================================================================
# NUMPY-SAFE JSON RESPONSE
# =============================================================================

class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, np.bool_):
            return bool(obj)
        return super().default(obj)


def NumpySafeJSONResponse(content: Any, status_code: int = 200) -> Response:
    body = json.dumps(content, cls=NumpyEncoder)
    return Response(content=body, status_code=status_code, media_type="application/json")


# =============================================================================
# REQUEST MODELS
# =============================================================================

class ClusterActivateRequest(BaseModel):
    text: str
    model_name: str = Field(default="french")
    head: int = Field(default=0, description="Internal head index 0-3")
    layer: int = Field(default=-1, description="Which layer. -1 = average all.")
    beta: float = Field(default=0.1, description="Threshold beta for cluster matching")


# =============================================================================
# CACHE
# =============================================================================

_cluster_cache: Dict[str, Any] = {}


def _cache_key(model_name: str, head: int, beta: float) -> str:
    return f"{model_name}_h{head}_b{beta:.4f}"


# =============================================================================
# CORE: Extract G* and compute Louvain clusters
# =============================================================================

def compute_clusters(model, config, head: int, beta: float, max_display_nodes: int = 400):
    t0 = time.perf_counter()

    nh = config.n_head
    N = config.n_neurons
    D = config.n_embd

    with torch.no_grad():
        # V2 (per_layer_encoders=True) uses encoders/decoders ParameterLists;
        # V1 uses single encoder/decoder parameters.
        if config.per_layer_encoders:
            encoder = model.encoders[0]   # use layer-0 encoder
            decoder = model.decoders[0]   # use layer-0 decoder
        else:
            encoder = model.encoder
            decoder = model.decoder

        decoder_reshaped = decoder.view(nh, N, D)
        G_star = (decoder_reshaped[head] @ encoder[head]).cpu().numpy()

    t1 = time.perf_counter()

    # Threshold
    G_thresh = np.where(G_star >= beta, G_star, 0.0)
    edges_i, edges_j = np.nonzero(G_thresh)
    edge_weights = G_thresh[edges_i, edges_j]
    num_edges = len(edges_i)

    out_degree = (G_thresh > 0).sum(axis=1)
    in_degree = (G_thresh > 0).sum(axis=0)
    total_degree = out_degree + in_degree

    t2 = time.perf_counter()

    # Community detection
    cluster_labels = np.zeros(N, dtype=np.int32)
    modularity = 0.0
    num_clusters = 1

    try:
        import networkx as nx
        try:
            import community as community_louvain
        except ImportError:
            import community.community_louvain as community_louvain

        G_nx = nx.DiGraph()
        G_nx.add_nodes_from(range(N))
        for idx in range(num_edges):
            G_nx.add_edge(int(edges_i[idx]), int(edges_j[idx]), weight=float(edge_weights[idx]))

        G_undirected = G_nx.to_undirected()
        connected_nodes = [n for n in G_undirected.nodes() if G_undirected.degree(n) > 0]

        if len(connected_nodes) > 50:
            G_sub = G_undirected.subgraph(connected_nodes)
            partition = community_louvain.best_partition(G_sub, random_state=42)
            modularity = community_louvain.modularity(partition, G_sub)
            for node, cid in partition.items():
                cluster_labels[node] = cid + 1
            num_clusters = max(partition.values()) + 1
        else:
            for n in connected_nodes:
                cluster_labels[n] = 1
            num_clusters = 1

    except ImportError:
        print("[WARN] networkx or python-louvain not installed.")
        percentiles = np.percentile(total_degree[total_degree > 0], [20, 40, 60, 80, 95]) if (total_degree > 0).any() else [0]*5
        for i in range(N):
            if total_degree[i] == 0:
                cluster_labels[i] = 0
            elif total_degree[i] <= percentiles[0]:
                cluster_labels[i] = 1
            elif total_degree[i] <= percentiles[1]:
                cluster_labels[i] = 2
            elif total_degree[i] <= percentiles[2]:
                cluster_labels[i] = 3
            elif total_degree[i] <= percentiles[3]:
                cluster_labels[i] = 4
            else:
                cluster_labels[i] = 5
        num_clusters = 5

    t3 = time.perf_counter()

    # Cluster metadata
    cluster_meta = []
    for cid in range(num_clusters + 1):
        mask = cluster_labels == cid
        count = int(mask.sum())
        if count == 0:
            continue
        members = np.where(mask)[0]
        avg_out = float(out_degree[mask].mean()) if count > 0 else 0
        avg_in = float(in_degree[mask].mean()) if count > 0 else 0

        internal_weight = 0.0
        internal_count = 0
        if 1 < count < 2000:
            sub = G_thresh[np.ix_(members, members)]
            internal_weight = float(sub.sum())
            internal_count = int((sub > 0).sum())

        deg_in_cluster = total_degree[mask]
        top_local = np.argsort(deg_in_cluster)[-5:][::-1]
        hub_neurons = [{"neuron": int(members[idx]), "degree": int(deg_in_cluster[idx])} for idx in top_local if deg_in_cluster[idx] > 0]

        cluster_meta.append({
            "cluster_id": int(cid),
            "neuron_count": count,
            "avg_out_degree": round(avg_out, 2),
            "avg_in_degree": round(avg_in, 2),
            "internal_edges": internal_count,
            "internal_weight": round(internal_weight, 2),
            "hub_neurons": hub_neurons,
            "label": None,
        })

    # Subsample
    hub_threshold = np.percentile(total_degree[total_degree > 0], 95) if (total_degree > 0).any() else 1
    hub_nodes = set(np.where(total_degree >= hub_threshold)[0].tolist())
    remaining_budget = max(50, max_display_nodes - len(hub_nodes))
    sampled_nodes = set(hub_nodes)
    cluster_ids_nonzero = [c for c in range(num_clusters + 1) if (cluster_labels == c).sum() > 0 and c > 0]
    total_non_hub = sum(1 for i in range(N) if cluster_labels[i] > 0 and i not in hub_nodes)

    for cid in cluster_ids_nonzero:
        members = [i for i in range(N) if cluster_labels[i] == cid and i not in hub_nodes]
        quota = max(2, int(remaining_budget * len(members) / max(total_non_hub, 1))) if total_non_hub > 0 else 2
        if len(members) <= quota:
            sampled_nodes.update(members)
        else:
            members_deg = sorted([(m, total_degree[m]) for m in members], key=lambda x: -x[1])
            sampled_nodes.update([m for m, _ in members_deg[:quota]])

    sampled_list = sorted(sampled_nodes)
    sampled_set = set(sampled_list)

    display_nodes = [{"id": int(n), "cluster": int(cluster_labels[n]), "degree": int(total_degree[n]),
                      "out_degree": int(out_degree[n]), "in_degree": int(in_degree[n]),
                      "is_hub": n in hub_nodes} for n in sampled_list]

    display_edges = []
    for idx in range(num_edges):
        i, j = int(edges_i[idx]), int(edges_j[idx])
        if i in sampled_set and j in sampled_set:
            display_edges.append({"source": i, "target": j, "weight": round(float(edge_weights[idx]), 3),
                                  "same_cluster": int(cluster_labels[i]) == int(cluster_labels[j]) and cluster_labels[i] > 0})

    t4 = time.perf_counter()

    # Histogram
    flat = G_star.flatten()
    hist_range = (float(flat.min()), float(min(flat.max(), beta * 4 + 1)))
    hist_counts, hist_edges = np.histogram(flat, bins=80, range=hist_range)
    histogram = [{"x": round(float((hist_edges[i] + hist_edges[i+1]) / 2), 4), "y": int(hist_counts[i])} for i in range(len(hist_counts))]

    # Degree distribution
    deg_vals = total_degree[total_degree > 0]
    if len(deg_vals) > 0:
        deg_counts, deg_edges = np.histogram(deg_vals, bins=50)
        degree_dist = [{"x": round(float((deg_edges[i] + deg_edges[i+1]) / 2), 1), "y": int(deg_counts[i])} for i in range(len(deg_counts))]
    else:
        degree_dist = []

    print(f"[GRAPH] G*={t1-t0:.3f}s thresh={t2-t1:.3f}s louvain={t3-t2:.3f}s sub={t4-t3:.3f}s total={t4-t0:.3f}s | N={N} edges={num_edges} clusters={num_clusters} shown={len(display_nodes)}n/{len(display_edges)}e")

    return {
        "model_name": None,
        "head": head,
        "beta": beta,
        "n_neurons": int(N),
        "n_total_edges": num_edges,
        "n_display_nodes": len(display_nodes),
        "n_display_edges": len(display_edges),
        "num_clusters": num_clusters,
        "modularity": round(float(modularity), 4),
        "density": round(float(num_edges / max(N * N, 1)), 6),
        "nodes": display_nodes,
        "edges": display_edges,
        "clusters": sorted(cluster_meta, key=lambda c: -c["neuron_count"]),
        "histogram": histogram,
        "degree_distribution": degree_dist,
        "_cluster_labels": cluster_labels,
        "_total_degree": total_degree,
    }


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/clusters/{model_name}")
async def get_clusters(model_name: str, req: Request, head: int = 0, beta: float = 0.1, max_nodes: int = 400):
    """Extract neuron clusters. head is 0-indexed internally."""
    model_service = req.app.state.model_service
    try:
        model = model_service.get_or_load(model_name)
        config = model_service.get_config(model_name)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Model not loaded: {model_name}")
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    if head < 0 or head >= config.n_head:
        raise HTTPException(status_code=400, detail=f"Invalid head {head}. Model has {config.n_head} heads (0-{config.n_head-1}).")

    cache_key = _cache_key(model_name, head, beta)
    if cache_key not in _cluster_cache:
        result = compute_clusters(model, config, head, beta, max_display_nodes=max_nodes)
        result["model_name"] = model_name
        _cluster_cache[cache_key] = result

    cached = _cluster_cache[cache_key]
    response = {k: v for k, v in cached.items() if not k.startswith("_")}
    return NumpySafeJSONResponse(response)


@router.post("/activate")
async def activate_clusters(request: ClusterActivateRequest, req: Request):
    """
    Run inference and return PER-TOKEN cluster activations
    for character-by-character playback on the frontend.
    """
    model_service = req.app.state.model_service
    try:
        model = model_service.get_or_load(request.model_name)
        config = model_service.get_config(request.model_name)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Model not loaded: {request.model_name}")
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    head = request.head
    layer = request.layer

    # Find cached cluster labels — use the beta from the request
    beta = request.beta
    ck = _cache_key(request.model_name, head, beta)
    if ck in _cluster_cache:
        cluster_data = _cluster_cache[ck]
    else:
        cluster_data = compute_clusters(model, config, head, beta, max_display_nodes=400)
        cluster_data["model_name"] = request.model_name
        _cluster_cache[ck] = cluster_data

    cluster_labels = cluster_data["_cluster_labels"]
    num_clusters = cluster_data["num_clusters"]

    # Run inference
    tokens = torch.tensor(
        [list(request.text.encode("utf-8"))],
        dtype=torch.long,
        device=model_service.device,
    )
    T = tokens.shape[1]
    N = config.n_neurons

    extraction_config = ExtractionConfig(
        capture_sparse_activations=True,
        capture_attention_patterns=False,
        capture_pre_relu=False,
        capture_layer_outputs=False,
    )

    with torch.no_grad():
        with model.extraction_mode(extraction_config) as buffer:
            logits, _ = model(tokens)

    layers_to_use = sorted(buffer.x_sparse.keys())
    if layer >= 0 and layer in buffer.x_sparse:
        layers_to_use = [layer]

    # === PER-TOKEN cluster activations ===
    token_bytes = tokens[0].cpu().tolist()
    input_chars = []
    for b in token_bytes:
        try:
            input_chars.append(chr(b) if 32 <= b < 127 else f"\\x{b:02x}")
        except:
            input_chars.append(f"\\x{b:02x}")

    per_token = []
    cumulative_neuron = np.zeros(N, dtype=np.float32)

    for t_idx in range(T):
        # Activation for this token across selected layers
        token_neuron_act = np.zeros(N, dtype=np.float32)
        for li in layers_to_use:
            x = buffer.x_sparse[li][0, head, t_idx].cpu().numpy()  # (N,)
            token_neuron_act += x

        cumulative_neuron += token_neuron_act

        # Per-cluster for this token
        token_clusters = []
        max_act = 0.0
        for cid in range(num_clusters + 1):
            mask = cluster_labels == cid
            if mask.sum() == 0:
                continue
            total = float(token_neuron_act[mask].sum())
            active = int((token_neuron_act[mask] > 0).sum())
            if total > max_act:
                max_act = total
            token_clusters.append({
                "cluster_id": int(cid),
                "activation": round(total, 3),
                "active_neurons": active,
            })

        # Normalize
        for tc in token_clusters:
            tc["normalized"] = round(tc["activation"] / max(max_act, 1e-6), 4)

        per_token.append({
            "token_idx": t_idx,
            "byte": int(token_bytes[t_idx]),
            "char": input_chars[t_idx],
            "cluster_activations": sorted(token_clusters, key=lambda c: -c["activation"]),
        })

    # Also compute cumulative (whole-text) for node-level overlay
    sampled_node_ids = [n["id"] for n in cluster_data["nodes"]]
    max_cum = float(cumulative_neuron.max()) if cumulative_neuron.max() > 0 else 1.0
    node_activations = {}
    for nid in sampled_node_ids:
        val = float(cumulative_neuron[nid])
        if val > 0:
            node_activations[str(nid)] = round(val / max_cum, 4)

    # Cumulative cluster activations
    cum_clusters = []
    max_cum_cluster = 0.0
    for cid in range(num_clusters + 1):
        mask = cluster_labels == cid
        if mask.sum() == 0:
            continue
        total = float(cumulative_neuron[mask].sum())
        if total > max_cum_cluster:
            max_cum_cluster = total
        cum_clusters.append({"cluster_id": int(cid), "total_activation": round(total, 3),
                             "active_neurons": int((cumulative_neuron[mask] > 0).sum())})
    for cc in cum_clusters:
        cc["normalized"] = round(cc["total_activation"] / max(max_cum_cluster, 1e-6), 4)

    return NumpySafeJSONResponse({
        "input_text": request.text,
        "input_chars": input_chars,
        "num_tokens": T,
        "head": head,
        "layer": layer,
        "layers_used": [int(l) for l in layers_to_use],
        "per_token": per_token,
        "cumulative_cluster_activations": sorted(cum_clusters, key=lambda c: -c["total_activation"]),
        "node_activations": node_activations,
    })


@router.delete("/cache")
async def clear_cache():
    _cluster_cache.clear()
    return {"status": "cleared"}
