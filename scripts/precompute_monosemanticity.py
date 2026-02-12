#!/usr/bin/env python3
"""
Pre-compute monosemanticity data for static frontend visualization.

Generates a single JSON file containing:
- Per-word x_sparse fingerprints for every curated category
- Cosine similarity matrices (per layer)
- Top-K neuron indices per word
- Shared neuron intersection data
- Cross-concept distinctness (Jaccard) for negative-control pairs
- "best_layer" — layer with peak avg within-concept similarity

Usage:
    python scripts/precompute_monosemanticity.py \
        --model checkpoints/french/french_best.pt \
        --output frontend/public/monosemanticity/precomputed.json
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, List, Any

import numpy as np
import torch

# ── Resolve imports ──────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "training"))
from bdh import BDH, BDHConfig, ExtractionConfig, load_model  # noqa: E402

# ── Curated categories (must match frontend PRESETS) ─────────────────
CATEGORIES: Dict[str, Dict[str, Any]] = {
    "currencies": {
        "name": "Currencies",
        "icon": "💰",
        "words": ["dollar", "euro", "franc", "yen"],
    },
    "countries": {
        "name": "Countries",
        "icon": "🌍",
        "words": ["france", "germany", "spain", "italy"],
    },
    "languages": {
        "name": "Languages",
        "icon": "🗣️",
        "words": ["anglais", "français", "espagnol", "allemand"],
    },
    "politics": {
        "name": "Politics",
        "icon": "⚖️",
        "words": ["parlement", "commission", "conseil", "vote"],
    },
}

# Cross-concept pairs to pre-compute (primary, secondary)
CROSS_PAIRS = [
    ("currencies", "countries"),
    ("currencies", "languages"),
    ("countries", "politics"),
    ("languages", "politics"),
]


def extract_fingerprint(
    model: BDH,
    words: List[str],
    concept_name: str,
    device: str,
    n_layers: int,
    n_heads: int,
    n_neurons: int,
) -> Dict[str, Any]:
    """
    Run words through model and return a FingerprintResult-shaped dict.
    Matches the /neuron-fingerprint backend response exactly.
    """
    word_fingerprints: List[Dict] = []
    # raw_x[layer][head] = list of (N,) numpy arrays, one per word
    raw_x: Dict[int, Dict[int, list]] = {}

    for text in words:
        tokens = torch.tensor(
            [list(text.encode("utf-8"))],
            dtype=torch.long,
            device=device,
        )
        extraction_config = ExtractionConfig(
            capture_sparse_activations=True,
            capture_attention_patterns=False,
        )

        layers_data: List[Dict] = []
        with torch.no_grad():
            with model.extraction_mode(extraction_config) as buffer:
                model(tokens)

                for layer_idx in sorted(buffer.x_sparse.keys()):
                    x = buffer.x_sparse[layer_idx][0]  # (nh, T, N)

                    heads_data: List[Dict] = []
                    for h in range(n_heads):
                        x_mean = x[h].mean(dim=0).cpu().numpy()  # (N,)

                        # Downsample to 64 bins
                        bins = 64
                        stride = max(1, n_neurons // bins)
                        x_ds = []
                        for b in range(bins):
                            start = b * stride
                            end = min(start + stride, n_neurons)
                            x_ds.append(float(x_mean[start:end].max()))

                        x_active = int((x_mean > 0).sum())

                        # Top-K neurons
                        top_k = 20
                        top_idx = np.argsort(x_mean)[-top_k:][::-1]
                        top_neurons = [
                            {"idx": int(i), "val": round(float(x_mean[i]), 5)}
                            for i in top_idx
                            if x_mean[i] > 0
                        ]

                        heads_data.append(
                            {
                                "head": h,
                                "x_ds": x_ds,
                                "x_active": x_active,
                                "top_neurons": top_neurons,
                            }
                        )

                        raw_x.setdefault(layer_idx, {}).setdefault(h, []).append(
                            x_mean
                        )

                    layers_data.append({"layer": layer_idx, "heads": heads_data})

        word_fingerprints.append({"word": text, "layers": layers_data})

    # ── Cosine similarity matrix (per layer, averaged across heads) ──
    n_words = len(words)
    similarity_by_layer: Dict[str, list] = {}

    for layer_idx in sorted(raw_x.keys()):
        sim_matrix = np.zeros((n_words, n_words))
        for h in range(n_heads):
            vecs = np.stack(raw_x[layer_idx][h])  # (n_words, N)
            norms = np.linalg.norm(vecs, axis=1, keepdims=True) + 1e-10
            normed = vecs / norms
            cos = normed @ normed.T
            sim_matrix += cos
        sim_matrix /= n_heads
        similarity_by_layer[str(layer_idx)] = [
            [round(float(sim_matrix[i][j]), 4) for j in range(n_words)]
            for i in range(n_words)
        ]

    # ── Shared neurons ──
    shared_neurons: List[Dict] = []
    for layer_idx in sorted(raw_x.keys()):
        for h in range(n_heads):
            acts = np.stack(raw_x[layer_idx][h])  # (n_words, N)
            active_mask = acts > 0
            all_active = active_mask.all(axis=0)
            shared_idx = np.where(all_active)[0]

            if len(shared_idx) > 0:
                mean_vals = acts[:, shared_idx].mean(axis=0)
                sort_order = np.argsort(mean_vals)[::-1][:5]
                for rank in sort_order:
                    nidx = int(shared_idx[rank])
                    shared_neurons.append(
                        {
                            "layer": int(layer_idx),
                            "head": int(h),
                            "neuron": nidx,
                            "mean_activation": round(float(mean_vals[rank]), 5),
                            "active_in": n_words,
                            "per_word": [
                                round(float(acts[w, nidx]), 5)
                                for w in range(n_words)
                            ],
                        }
                    )

    shared_neurons.sort(key=lambda s: s["mean_activation"], reverse=True)

    return {
        "concept": concept_name,
        "words": word_fingerprints,
        "similarity": similarity_by_layer,
        "shared_neurons": shared_neurons[:40],
        "model_info": {
            "n_layers": n_layers,
            "n_heads": n_heads,
            "n_neurons": n_neurons,
        },
    }


def compute_best_layer(concepts: Dict[str, Any], n_layers: int) -> int:
    """
    Find the layer with the highest average within-concept cosine similarity.
    This is the "most monosemantic" layer for the narrative default.
    """
    layer_scores: Dict[int, List[float]] = {l: [] for l in range(n_layers)}
    for _cid, result in concepts.items():
        sim = result["similarity"]
        for layer_str, matrix in sim.items():
            layer_idx = int(layer_str)
            n = len(matrix)
            # average off-diagonal similarity
            total = sum(
                matrix[i][j] for i in range(n) for j in range(n) if i != j
            )
            count = n * (n - 1) if n > 1 else 1
            layer_scores[layer_idx].append(total / count)

    # average across concepts
    avg_scores = {l: np.mean(v) for l, v in layer_scores.items() if v}
    return int(max(avg_scores, key=avg_scores.get))


def compute_cross_concept(
    concepts: Dict[str, Any], n_layers: int, n_heads: int
) -> List[Dict]:
    """
    For each CROSS_PAIR, compute per-layer Jaccard distinctness between
    top-neuron sets of the two concepts.
    """
    cross_results: List[Dict] = []
    for primary_id, secondary_id in CROSS_PAIRS:
        p_result = concepts.get(primary_id)
        s_result = concepts.get(secondary_id)
        if not p_result or not s_result:
            continue

        distinctness_per_layer: List[float] = []
        for l in range(n_layers):
            p_neurons = set()
            for w in p_result["words"]:
                layer = next((la for la in w["layers"] if la["layer"] == l), None)
                if layer:
                    for h in layer["heads"]:
                        for n in h["top_neurons"]:
                            p_neurons.add(f"{h['head']}_{n['idx']}")

            s_neurons = set()
            for w in s_result["words"]:
                layer = next((la for la in w["layers"] if la["layer"] == l), None)
                if layer:
                    for h in layer["heads"]:
                        for n in h["top_neurons"]:
                            s_neurons.add(f"{h['head']}_{n['idx']}")

            intersection = len(p_neurons & s_neurons)
            union = len(p_neurons | s_neurons)
            distinctness_per_layer.append(
                round(1 - intersection / union, 4) if union > 0 else 1.0
            )

        cross_results.append(
            {
                "primary": primary_id,
                "secondary": secondary_id,
                "distinctness_per_layer": distinctness_per_layer,
                "secondary_result": s_result,
            }
        )

    return cross_results


def main():
    parser = argparse.ArgumentParser(
        description="Pre-compute monosemanticity data for BDH frontend"
    )
    parser.add_argument(
        "--model",
        default=str(ROOT / "checkpoints" / "french" / "french_best.pt"),
        help="Path to model checkpoint",
    )
    parser.add_argument(
        "--output",
        default=str(
            ROOT / "frontend" / "public" / "monosemanticity" / "precomputed.json"
        ),
        help="Output JSON path",
    )
    parser.add_argument(
        "--device",
        default="cuda" if torch.cuda.is_available() else "cpu",
    )
    args = parser.parse_args()

    print("=" * 60)
    print("🧠 BDH Monosemanticity Pre-computation")
    print("=" * 60)

    # Load model
    print(f"\n📂 Loading model from {args.model}")
    model = load_model(args.model, args.device)
    n_layers = model.config.n_layer
    n_heads = model.config.n_head
    n_neurons = model.config.n_neurons
    print(f"   Config: {n_layers}L × {n_heads}H × {n_neurons}N")

    # ── Phase 1: Extract fingerprints for every category ──
    print("\n" + "=" * 60)
    print("Phase 1: Extracting concept fingerprints")
    print("=" * 60)
    concepts: Dict[str, Any] = {}
    for cat_id, cat in CATEGORIES.items():
        print(f"\n   ▶ {cat['name']}: {cat['words']}")
        result = extract_fingerprint(
            model,
            cat["words"],
            cat["name"],
            args.device,
            n_layers,
            n_heads,
            n_neurons,
        )
        concepts[cat_id] = result
        # Print avg similarity at each layer
        for layer_str, matrix in result["similarity"].items():
            n = len(matrix)
            avg = sum(
                matrix[i][j] for i in range(n) for j in range(n) if i != j
            ) / max(n * (n - 1), 1)
            print(f"     L{layer_str} avg cosine: {avg:.4f}")

    # ── Phase 2: Find best layer ──
    best_layer = compute_best_layer(concepts, n_layers)
    print(f"\n🏆 Best layer (highest avg within-concept similarity): L{best_layer}")

    # ── Phase 3: Cross-concept distinctness ──
    print("\n" + "=" * 60)
    print("Phase 3: Cross-concept distinctness")
    print("=" * 60)
    cross_concept = compute_cross_concept(concepts, n_layers, n_heads)
    for cc in cross_concept:
        avg_d = np.mean(cc["distinctness_per_layer"])
        print(f"   {cc['primary']} vs {cc['secondary']}: avg distinctness = {avg_d:.4f}")

    # ── Phase 4: Write JSON ──
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "model_info": {
            "n_layers": n_layers,
            "n_heads": n_heads,
            "n_neurons": n_neurons,
        },
        "best_layer": best_layer,
        "concepts": concepts,
        "cross_concept": cross_concept,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, separators=(",", ":"))

    size_mb = output_path.stat().st_size / 1024 / 1024
    print(f"\n💾 Wrote {output_path} ({size_mb:.2f} MB)")
    print("✅ Done! Frontend will load this statically.")


if __name__ == "__main__":
    main()
