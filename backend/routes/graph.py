"""
Graph Brain API Routes

Endpoints for neuron cluster visualization:
- Extract clusters from G* = Dx @ E using Louvain community detection
- Map inference activations to clusters
- Subsample graph for frontend visualization
"""

import json
import time
import hashlib
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
import torch
import numpy as np

router = APIRouter()


# =============================================================================
# NUMPY-SAFE JSON RESPONSE (same as visualization.py)
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
    head: int = Field(default=0)
    layer: int = Field(default=0, description="Which layer's activations to use. -1 = average across all layers.")


# =============================================================================
# CACHE for computed clusters (avoid recomputing on every request)
# =============================================================================

_cluster_cache: Dict[str, Any] = {}


def _cache_key(model_name: str, head: int, beta: float) -> str:
    return f"{model_name}_h{head}_b{beta:.3f}"


# =============================================================================
# CORE: Extract G* and compute Louvain clusters
# =============================================================================

def compute_clusters(model, config, head: int, beta: float, max_display_nodes: int = 400):
    """
    Extract neuron-neuron graph G* = Dx @ E for a given head,
    threshold at beta, run Louvain community detection, subsample for viz.
    """
    t0 = time.perf_counter()

    nh = config.n_head
    N = config.n_neurons
    D = config.n_embd

    with torch.no_grad():
        # decoder shape: (nh*N, D) -> reshape to (nh, N, D)
        decoder_reshaped = model.decoder.view(nh, N, D)

        # G* = Dx @ E  for one head: (N, D) @ (D, N) -> (N, N)
        G_star = (decoder_reshaped[head] @ model.encoder[head]).cpu().numpy()

    t1 = time.perf_counter()

    # --- Threshold: keep only G*_ij >= beta ---
    G_thresh = np.where(G_star >= beta, G_star, 0.0)
    edges_i, edges_j = np.nonzero(G_thresh)
    edge_weights = G_thresh[edges_i, edges_j]
    num_edges = len(edges_i)

    # --- Degree stats ---
    out_degree = (G_thresh > 0).sum(axis=1)  # (N,)
    in_degree = (G_thresh > 0).sum(axis=0)   # (N,)
    total_degree = out_degree + in_degree

    t2 = time.perf_counter()

    # --- Community detection via Louvain ---
    # We use networkx + community (python-louvain) if available,
    # otherwise fall back to a simple spectral approach
    cluster_labels = np.zeros(N, dtype=np.int32)
    modularity = 0.0
    num_clusters = 1

    try:
        import networkx as nx
        try:
            import community as community_louvain
        except ImportError:
            import community.community_louvain as community_louvain

        # Build graph from thresholded edges
        G_nx = nx.DiGraph()
        G_nx.add_nodes_from(range(N))
        for idx in range(num_edges):
            i, j = int(edges_i[idx]), int(edges_j[idx])
            G_nx.add_edge(i, j, weight=float(edge_weights[idx]))

        # Louvain works on undirected - convert
        G_undirected = G_nx.to_undirected()

        # Remove isolated nodes for Louvain (add them back as cluster -1)
        connected_nodes = [n for n in G_undirected.nodes() if G_undirected.degree(n) > 0]
        if len(connected_nodes) > 100:
            G_sub = G_undirected.subgraph(connected_nodes)
            partition = community_louvain.best_partition(G_sub, random_state=42)
            modularity = community_louvain.modularity(partition, G_sub)

            for node, cid in partition.items():
                cluster_labels[node] = cid + 1  # 0 = unassigned/isolated

            num_clusters = max(partition.values()) + 1
        else:
            # Too few connected nodes - single cluster
            for n in connected_nodes:
                cluster_labels[n] = 1
            num_clusters = 1

    except ImportError:
        # Fallback: simple degree-based binning if networkx/community not available
        print("[WARN] networkx or python-louvain not installed. Using degree-based clustering fallback.")
        percentiles = np.percentile(total_degree[total_degree > 0], [25, 50, 75, 90]) if (total_degree > 0).any() else [0, 0, 0, 0]
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

    # --- Compute cluster metadata ---
    cluster_meta = []
    for cid in range(num_clusters + 1):  # 0 = isolated
        mask = cluster_labels == cid
        count = int(mask.sum())
        if count == 0:
            continue

        members = np.where(mask)[0]
        avg_out_deg = float(out_degree[mask].mean()) if count > 0 else 0
        avg_in_deg = float(in_degree[mask].mean()) if count > 0 else 0

        # Internal edge weight: edges within this cluster
        internal_weight = 0.0
        internal_count = 0
        if count > 1 and count < 2000:
            sub = G_thresh[np.ix_(members, members)]
            internal_weight = float(sub.sum())
            internal_count = int((sub > 0).sum())

        # Hub neurons (top 5 by degree within cluster)
        degrees_in_cluster = total_degree[mask]
        top_local = np.argsort(degrees_in_cluster)[-5:][::-1]
        hub_neurons = [{"neuron": int(members[idx]), "degree": int(degrees_in_cluster[idx])} for idx in top_local if degrees_in_cluster[idx] > 0]

        cluster_meta.append({
            "cluster_id": int(cid),
            "neuron_count": count,
            "avg_out_degree": round(avg_out_deg, 2),
            "avg_in_degree": round(avg_in_deg, 2),
            "internal_edges": internal_count,
            "internal_weight": round(internal_weight, 2),
            "hub_neurons": hub_neurons,
            "label": None,  # To be filled by labeling pass
        })

    # --- Subsample for visualization ---
    # Strategy: keep all hub neurons (top 5% by degree) + proportional sample per cluster
    hub_threshold = np.percentile(total_degree[total_degree > 0], 95) if (total_degree > 0).any() else 1
    hub_mask = total_degree >= hub_threshold
    hub_nodes = set(np.where(hub_mask)[0].tolist())

    # Budget remaining for non-hub nodes
    remaining_budget = max(50, max_display_nodes - len(hub_nodes))

    # Sample proportionally from each cluster
    sampled_nodes = set(hub_nodes)
    cluster_ids_nonzero = [c for c in range(num_clusters + 1) if (cluster_labels == c).sum() > 0 and c > 0]
    total_non_hub = sum(1 for i in range(N) if cluster_labels[i] > 0 and i not in hub_nodes)

    for cid in cluster_ids_nonzero:
        members = [i for i in range(N) if cluster_labels[i] == cid and i not in hub_nodes]
        if total_non_hub > 0:
            quota = max(2, int(remaining_budget * len(members) / max(total_non_hub, 1)))
        else:
            quota = 2
        if len(members) <= quota:
            sampled_nodes.update(members)
        else:
            # Prefer higher-degree nodes
            members_deg = [(m, total_degree[m]) for m in members]
            members_deg.sort(key=lambda x: -x[1])
            sampled_nodes.update([m for m, _ in members_deg[:quota]])

    sampled_list = sorted(sampled_nodes)
    sampled_set = set(sampled_list)
    node_index_map = {n: i for i, n in enumerate(sampled_list)}

    # Build nodes
    display_nodes = []
    for n in sampled_list:
        display_nodes.append({
            "id": int(n),
            "cluster": int(cluster_labels[n]),
            "degree": int(total_degree[n]),
            "out_degree": int(out_degree[n]),
            "in_degree": int(in_degree[n]),
            "is_hub": n in hub_nodes,
        })

    # Build edges (only between sampled nodes)
    display_edges = []
    for idx in range(num_edges):
        i, j = int(edges_i[idx]), int(edges_j[idx])
        if i in sampled_set and j in sampled_set:
            display_edges.append({
                "source": i,
                "target": j,
                "weight": round(float(edge_weights[idx]), 3),
                "same_cluster": int(cluster_labels[i]) == int(cluster_labels[j]) and cluster_labels[i] > 0,
            })

    t4 = time.perf_counter()

    # --- Element distribution of G* (for histogram in UI) ---
    flat = G_star.flatten()
    hist_counts, hist_edges = np.histogram(flat, bins=80, range=(float(flat.min()), float(min(flat.max(), beta * 3 + 1))))
    histogram = [{"x": round(float((hist_edges[i] + hist_edges[i+1]) / 2), 3), "y": int(hist_counts[i])} for i in range(len(hist_counts))]

    # --- Degree distribution ---
    deg_vals = total_degree[total_degree > 0]
    if len(deg_vals) > 0:
        deg_counts, deg_edges = np.histogram(deg_vals, bins=50)
        degree_dist = [{"x": round(float((deg_edges[i] + deg_edges[i+1]) / 2), 1), "y": int(deg_counts[i])} for i in range(len(deg_counts))]
    else:
        degree_dist = []

    print(f"[GRAPH] G*={t1-t0:.3f}s thresh={t2-t1:.3f}s louvain={t3-t2:.3f}s subsample={t4-t3:.3f}s total={t4-t0:.3f}s | N={N} edges={num_edges} clusters={num_clusters} displayed={len(display_nodes)}n/{len(display_edges)}e")

    return {
        "model_name": None,  # filled by caller
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
        # Full cluster_labels needed for activation mapping
        "_cluster_labels": cluster_labels,
        "_total_degree": total_degree,
    }


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/clusters/{model_name}")
async def get_clusters(
    model_name: str,
    req: Request,
    head: int = 0,
    beta: float = 1.0,
    max_nodes: int = 400,
):
    """
    Extract neuron clusters from model weights using Louvain community detection.

    - Computes G* = Dx @ E for the specified head
    - Thresholds at beta to separate signal from noise
    - Runs Louvain to find communities
    - Subsamples for browser-friendly visualization
    """
    model_service = req.app.state.model_service

    try:
        model = model_service.get_or_load(model_name)
        config = model_service.get_config(model_name)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Model not loaded: {model_name}")
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))

    if head < 0 or head >= config.n_head:
        raise HTTPException(status_code=400, detail=f"Invalid head {head}. Model has {config.n_head} heads.")

    cache_key = _cache_key(model_name, head, beta)

    if cache_key not in _cluster_cache:
        result = compute_clusters(model, config, head, beta, max_display_nodes=max_nodes)
        result["model_name"] = model_name
        _cluster_cache[cache_key] = result

    cached = _cluster_cache[cache_key]

    # Return without internal arrays
    response = {k: v for k, v in cached.items() if not k.startswith("_")}
    return NumpySafeJSONResponse(response)


@router.post("/activate")
async def activate_clusters(request: ClusterActivateRequest, req: Request):
    """
    Run inference on input text and map active neurons to clusters.

    Returns per-cluster activation strength so the frontend can
    highlight which clusters 'light up' for a given input.
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

    # Find cached cluster labels (use default beta=1.0 if not cached for this combo)
    # Try a few common betas
    cluster_data = None
    for beta_try in [1.0, 0.8, 1.2, 0.5]:
        ck = _cache_key(request.model_name, head, beta_try)
        if ck in _cluster_cache:
            cluster_data = _cluster_cache[ck]
            break

    if cluster_data is None:
        # Compute with default beta
        cluster_data = compute_clusters(model, config, head, 1.0, max_display_nodes=400)
        cluster_data["model_name"] = request.model_name
        _cluster_cache[_cache_key(request.model_name, head, 1.0)] = cluster_data

    cluster_labels = cluster_data["_cluster_labels"]  # (N,)
    num_clusters = cluster_data["num_clusters"]

    # --- Run inference with extraction ---
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).parent.parent.parent / "training"))
    from bdh import ExtractionConfig

    tokens = torch.tensor(
        [list(request.text.encode("utf-8"))],
        dtype=torch.long,
        device=model_service.device,
    )
    T = tokens.shape[1]

    extraction_config = ExtractionConfig(
        capture_sparse_activations=True,
        capture_attention_patterns=False,
        capture_pre_relu=False,
        capture_layer_outputs=False,
    )

    with torch.no_grad():
        with model.extraction_mode(extraction_config) as buffer:
            logits, _ = model(tokens)

    # --- Map activations to clusters ---
    # x_sparse shape per layer: (B, nh, T, N)
    layers_to_use = sorted(buffer.x_sparse.keys())
    if layer >= 0 and layer in buffer.x_sparse:
        layers_to_use = [layer]

    # Accumulate per-neuron activation across selected layers and all tokens
    N = config.n_neurons
    neuron_activation = np.zeros(N, dtype=np.float32)

    for li in layers_to_use:
        x = buffer.x_sparse[li][0, head].cpu().numpy()  # (T, N)
        # Sum across all tokens
        neuron_activation += x.sum(axis=0)

    # Per-cluster activation
    cluster_activations = []
    max_activation = 0.0
    for cid in range(num_clusters + 1):
        mask = cluster_labels == cid
        if mask.sum() == 0:
            continue
        total = float(neuron_activation[mask].sum())
        count = int((neuron_activation[mask] > 0).sum())
        mean = float(neuron_activation[mask].mean())
        if total > max_activation:
            max_activation = total
        cluster_activations.append({
            "cluster_id": int(cid),
            "total_activation": round(total, 3),
            "active_neurons": count,
            "mean_activation": round(mean, 4),
        })

    # Normalize to 0-1
    for ca in cluster_activations:
        ca["normalized"] = round(ca["total_activation"] / max(max_activation, 1e-6), 4)

    # Per-node activation for the sampled nodes
    sampled_node_ids = [n["id"] for n in cluster_data["nodes"]]
    node_activations = {}
    for nid in sampled_node_ids:
        val = float(neuron_activation[nid])
        if val > 0:
            node_activations[str(nid)] = round(val, 3)

    # Token-level info
    token_bytes = tokens[0].cpu().tolist()
    input_chars = []
    for b in token_bytes:
        try:
            input_chars.append(chr(b) if 32 <= b < 127 else f"\\x{b:02x}")
        except:
            input_chars.append(f"\\x{b:02x}")

    return NumpySafeJSONResponse({
        "input_text": request.text,
        "input_chars": input_chars,
        "head": head,
        "layer": layer,
        "layers_used": [int(l) for l in layers_to_use],
        "cluster_activations": sorted(cluster_activations, key=lambda c: -c["total_activation"]),
        "node_activations": node_activations,
        "max_activation": round(float(max_activation), 3),
    })


@router.delete("/cache")
async def clear_cache():
    """Clear the cluster computation cache."""
    _cluster_cache.clear()
    return {"status": "cleared"}
