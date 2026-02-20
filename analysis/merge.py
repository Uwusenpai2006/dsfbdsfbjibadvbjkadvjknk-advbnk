#!/usr/bin/env python3
"""
BDH Model Merging Utility (V1 + V2 compatible)

Merges two separately trained BDH models into a single polyglot model.
This is a unique capability of BDH's scale-free architecture that
transformers cannot achieve.

The merge works by concatenating the neuron spaces:
- Model A: neurons 0 to N-1
- Model B: neurons N to 2N-1
- Merged:  neurons 0 to 2N-1

Rule: anything with an N dimension → concatenate, everything else → average.

Usage:
    python analysis/merge.py \
        --model1 checkpoints/french_specialist/checkpoint_best.pt \
        --model2 checkpoints/portuguese_specialist/checkpoint_best.pt \
        --output checkpoints/merged_polyglot.pt \
        --name1 french --name2 portuguese
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Dict, Any, Tuple, List, Optional
from dataclasses import dataclass, asdict

import numpy as np
import torch
import torch.nn.functional as F

# Resolve imports
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "training"))
from bdh import BDH, BDHConfig, ExtractionConfig, load_model


@dataclass
class MergeConfig:
    """Configuration for model merging."""
    model1_path: str = ""
    model2_path: str = ""
    output_path: str = ""
    model1_name: str = "french"
    model2_name: str = "portuguese"
    merge_embeddings: str = "average"  # average, first, second
    merge_lm_head: str = "average"    # average, first, second


# ═════════════════════════════════════════════════════════════════════
#  Loading
# ═════════════════════════════════════════════════════════════════════

def load_checkpoint(path: str) -> Tuple[Dict[str, torch.Tensor], BDHConfig]:
    """Load model checkpoint and extract config."""
    checkpoint = torch.load(path, map_location="cpu", weights_only=False)

    if "config" in checkpoint:
        config = BDHConfig(**checkpoint["config"])
        state_dict = checkpoint["model_state_dict"]
    else:
        state_dict = checkpoint
        # Infer config from shapes
        if "encoder" in state_dict:
            enc = state_dict["encoder"]
            config = BDHConfig(
                n_layer=6,
                n_embd=enc.shape[1],
                n_head=enc.shape[0],
                mlp_internal_dim_multiplier=(enc.shape[2] * enc.shape[0] // enc.shape[1]),
            )
        else:
            # Per-layer encoders (V2)
            for k in state_dict:
                if k.startswith("encoders."):
                    enc = state_dict[k]
                    n_layers = sum(1 for kk in state_dict if kk.startswith("encoders.") and not kk.endswith("_v"))
                    config = BDHConfig(
                        n_layer=n_layers,
                        n_embd=enc.shape[1],
                        n_head=enc.shape[0],
                        mlp_internal_dim_multiplier=(enc.shape[2] * enc.shape[0] // enc.shape[1]),
                    )
                    break
            else:
                raise ValueError("Cannot infer config from state dict keys")

    return state_dict, config


def detect_architecture(state_dict: Dict[str, torch.Tensor]) -> str:
    """Detect V1 (shared encoder/decoder) or V2 (per-layer)."""
    if "encoder" in state_dict:
        return "v1"
    if any(k.startswith("encoders.") for k in state_dict):
        return "v2"
    raise ValueError(f"Unknown architecture. Keys: {list(state_dict.keys())[:10]}")


def verify_compatible(config1: BDHConfig, config2: BDHConfig) -> bool:
    """Verify two models can be merged."""
    checks = [
        ("n_layer", config1.n_layer, config2.n_layer),
        ("n_embd", config1.n_embd, config2.n_embd),
        ("n_head", config1.n_head, config2.n_head),
        ("mlp_multiplier", config1.mlp_internal_dim_multiplier, config2.mlp_internal_dim_multiplier),
        ("vocab_size", config1.vocab_size, config2.vocab_size),
    ]
    all_pass = True
    for name, v1, v2 in checks:
        if v1 != v2:
            print(f"  ❌ {name}: {v1} vs {v2}")
            all_pass = False
        else:
            print(f"  ✓ {name} = {v1}")
    return all_pass


# ═════════════════════════════════════════════════════════════════════
#  Merge logic
# ═════════════════════════════════════════════════════════════════════

def merge_models(
    state1: Dict[str, torch.Tensor],
    state2: Dict[str, torch.Tensor],
    config1: BDHConfig,
    merge_config: MergeConfig,
) -> Tuple[Dict[str, torch.Tensor], BDHConfig]:
    """
    Merge two BDH models by concatenating neuron spaces.

    Rule from the paper:
      - Anything with an N dimension → concatenate along N
      - Everything else (embed, lm_head) → average
    """
    arch = detect_architecture(state1)
    print(f"\n🔀 Merging models (architecture: {arch})...")

    merged = {}
    nh = config1.n_head
    D = config1.n_embd
    N = config1.n_neurons

    if arch == "v1":
        # ── V1: shared encoder / encoder_v / decoder ──
        merged["encoder"] = torch.cat([state1["encoder"], state2["encoder"]], dim=2)
        print(f"  encoder: ({nh},{D},{N}) + ({nh},{D},{N}) → ({nh},{D},{2*N})")

        merged["encoder_v"] = torch.cat([state1["encoder_v"], state2["encoder_v"]], dim=2)
        print(f"  encoder_v: same")

        merged["decoder"] = torch.cat([state1["decoder"], state2["decoder"]], dim=0)
        print(f"  decoder: ({nh*N},{D}) + ({nh*N},{D}) → ({2*nh*N},{D})")

        merged["attn.freqs"] = torch.cat([state1["attn.freqs"], state2["attn.freqs"]], dim=3)
        print(f"  attn.freqs: concat along N")

    else:
        # ── V2: per-layer encoders / decoders ──
        nL = config1.n_layer
        for l in range(nL):
            ek = f"encoders.{l}"
            merged[ek] = torch.cat([state1[ek], state2[ek]], dim=2)

            evk = f"encoders_v.{l}"
            if evk in state1:
                merged[evk] = torch.cat([state1[evk], state2[evk]], dim=2)

            dk = f"decoders.{l}"
            merged[dk] = torch.cat([state1[dk], state2[dk]], dim=0)

        print(f"  {nL} per-layer encoders/decoders concatenated along N")

        # rho buffer
        if "rho" in state1:
            merged["rho"] = torch.cat([state1["rho"], state2["rho"]], dim=2)
            print(f"  rho: concat along N")

        if "attn.freqs" in state1:
            merged["attn.freqs"] = torch.cat([state1["attn.freqs"], state2["attn.freqs"]], dim=3)

    # ── Shared parameters: average ──
    embed_key = "embed.weight"
    if embed_key in state1:
        if merge_config.merge_embeddings == "average":
            merged[embed_key] = (state1[embed_key] + state2[embed_key]) / 2
        elif merge_config.merge_embeddings == "first":
            merged[embed_key] = state1[embed_key].clone()
        else:
            merged[embed_key] = state2[embed_key].clone()
        print(f"  embed: {merge_config.merge_embeddings}")

    lm_key = "lm_head"
    if lm_key in state1:
        if merge_config.merge_lm_head == "average":
            merged[lm_key] = (state1[lm_key] + state2[lm_key]) / 2
        elif merge_config.merge_lm_head == "first":
            merged[lm_key] = state1[lm_key].clone()
        else:
            merged[lm_key] = state2[lm_key].clone()
        print(f"  lm_head: {merge_config.merge_lm_head}")

    # ── Copy any remaining keys we haven't handled (layer norms, etc.) ──
    for k in state1:
        if k not in merged:
            # Average unknown shared params
            if k in state2 and state1[k].shape == state2[k].shape:
                merged[k] = (state1[k] + state2[k]) / 2
            else:
                merged[k] = state1[k].clone()

    # ── Merged config: doubled multiplier ──
    merged_config = BDHConfig(
        n_layer=config1.n_layer,
        n_embd=config1.n_embd,
        n_head=config1.n_head,
        mlp_internal_dim_multiplier=config1.mlp_internal_dim_multiplier * 2,
        dropout=config1.dropout,
        vocab_size=config1.vocab_size,
    )

    print(f"\n📊 Merged: {N} → {2*N} neurons/head, {nh*N} → {2*nh*N} total")
    return merged, merged_config


# ═════════════════════════════════════════════════════════════════════
#  Heritage map
# ═════════════════════════════════════════════════════════════════════

def create_heritage_map(config1: BDHConfig, merge_config: MergeConfig) -> Dict[str, Any]:
    """Track which neurons came from which model."""
    N = config1.n_neurons
    nh = config1.n_head
    return {
        "model1_name": merge_config.model1_name,
        "model2_name": merge_config.model2_name,
        "neurons_per_head_original": N,
        "neurons_per_head_merged": 2 * N,
        "total_neurons_per_model": N * nh,
        "total_neurons_merged": 2 * N * nh,
        "ranges": {
            merge_config.model1_name: {"start": 0, "end": N - 1},
            merge_config.model2_name: {"start": N, "end": 2 * N - 1},
        },
    }


# ═════════════════════════════════════════════════════════════════════
#  Validation
# ═════════════════════════════════════════════════════════════════════

def validate_merged_model(
    merged_state: Dict[str, torch.Tensor],
    merged_config: BDHConfig,
    device: str = "cpu",
) -> bool:
    """Validate the merged model can do a forward pass."""
    print("\n🔍 Validating merged model...")
    try:
        model = BDH(merged_config)
        model.load_state_dict(merged_state, strict=False)
        model.to(device).eval()

        test_input = torch.randint(0, 256, (1, 32), device=device)
        with torch.no_grad():
            logits, _ = model(test_input)

        assert logits.shape == (1, 32, 256), f"Bad shape: {logits.shape}"
        print("  ✅ Forward pass OK")

        # Quick generation test
        prompt = torch.tensor([[72, 101, 108, 108, 111]], device=device)  # "Hello"
        with torch.no_grad():
            gen = model.generate(prompt, max_new_tokens=10, top_k=5)
        assert gen.shape[1] == 15
        print("  ✅ Generation OK")
        return True
    except Exception as e:
        print(f"  ❌ Validation failed: {e}")
        return False


# ═════════════════════════════════════════════════════════════════════
#  Evaluation — compute loss on test data
# ═════════════════════════════════════════════════════════════════════

@torch.no_grad()
def evaluate_loss(
    model: BDH,
    data_path: str,
    device: str = "cpu",
    block_size: int = 256,
    n_batches: int = 50,
    batch_size: int = 8,
) -> float:
    """Compute average next-byte prediction loss on a dataset."""
    if not Path(data_path).exists():
        print(f"  ⚠ Data not found: {data_path}")
        return -1.0

    data = np.memmap(data_path, dtype=np.uint8, mode="r")
    total_loss = 0.0
    count = 0

    model.eval()
    for _ in range(n_batches):
        ix = np.random.randint(0, len(data) - block_size - 1, size=batch_size)
        x = torch.stack([
            torch.from_numpy(data[i : i + block_size].astype(np.int64))
            for i in ix
        ]).to(device)
        y = torch.stack([
            torch.from_numpy(data[i + 1 : i + 1 + block_size].astype(np.int64))
            for i in ix
        ]).to(device)

        _, loss = model(x, y)
        if loss is not None:
            total_loss += loss.item()
            count += 1

    return total_loss / max(count, 1)


def run_evaluation(
    model1_path: str,
    model2_path: str,
    merged_state: Dict[str, torch.Tensor],
    merged_config: BDHConfig,
    name1: str,
    name2: str,
    device: str = "cpu",
    french_val: str = "data/en-fr/val.bin",
    portuguese_val: str = "data/en-pt/val.bin",
) -> Dict[str, Any]:
    """Evaluate all three models on both language val sets."""
    print("\n📊 Running evaluation...")

    results = {}

    # Model 1 (specialist)
    try:
        m1 = load_model(model1_path, device)
        loss_fr = evaluate_loss(m1, french_val, device)
        loss_pt = evaluate_loss(m1, portuguese_val, device)
        results[name1] = {
            "french_loss": round(loss_fr, 4) if loss_fr >= 0 else None,
            "portuguese_loss": round(loss_pt, 4) if loss_pt >= 0 else None,
        }
        print(f"  {name1}: fr={loss_fr:.4f}, pt={loss_pt:.4f}")
        del m1
    except Exception as e:
        print(f"  ⚠ Could not evaluate {name1}: {e}")
        results[name1] = {"french_loss": None, "portuguese_loss": None}

    # Model 2 (specialist)
    try:
        m2 = load_model(model2_path, device)
        loss_fr = evaluate_loss(m2, french_val, device)
        loss_pt = evaluate_loss(m2, portuguese_val, device)
        results[name2] = {
            "french_loss": round(loss_fr, 4) if loss_fr >= 0 else None,
            "portuguese_loss": round(loss_pt, 4) if loss_pt >= 0 else None,
        }
        print(f"  {name2}: fr={loss_fr:.4f}, pt={loss_pt:.4f}")
        del m2
    except Exception as e:
        print(f"  ⚠ Could not evaluate {name2}: {e}")
        results[name2] = {"french_loss": None, "portuguese_loss": None}

    # Merged
    try:
        merged_model = BDH(merged_config)
        merged_model.load_state_dict(merged_state, strict=False)
        merged_model.to(device).eval()
        loss_fr = evaluate_loss(merged_model, french_val, device)
        loss_pt = evaluate_loss(merged_model, portuguese_val, device)
        results["merged"] = {
            "french_loss": round(loss_fr, 4) if loss_fr >= 0 else None,
            "portuguese_loss": round(loss_pt, 4) if loss_pt >= 0 else None,
        }
        print(f"  merged: fr={loss_fr:.4f}, pt={loss_pt:.4f}")
        del merged_model
    except Exception as e:
        print(f"  ⚠ Could not evaluate merged: {e}")
        results["merged"] = {"french_loss": None, "portuguese_loss": None}

    torch.cuda.empty_cache() if torch.cuda.is_available() else None
    return results


# ═════════════════════════════════════════════════════════════════════
#  Sample generation
# ═════════════════════════════════════════════════════════════════════

@torch.no_grad()
def generate_samples(
    merged_state: Dict[str, torch.Tensor],
    merged_config: BDHConfig,
    device: str = "cpu",
) -> List[Dict[str, str]]:
    """Generate sample text from the merged model."""
    print("\n📝 Generating samples...")
    model = BDH(merged_config)
    model.load_state_dict(merged_state, strict=False)
    model.to(device).eval()

    prompts = [
        ("French prompt", "Le parlement européen"),
        ("Portuguese prompt", "O parlamento europeu"),
        ("English prompt", "The European Parliament"),
        ("Mixed context", "Bonjour, como está"),
    ]

    samples = []
    for label, prompt_text in prompts:
        tokens = torch.tensor(
            [list(prompt_text.encode("utf-8"))],
            dtype=torch.long,
            device=device,
        )
        try:
            output = model.generate(tokens, max_new_tokens=80, top_k=5, temperature=0.8)
            generated = bytes(output[0].cpu().tolist()).decode("utf-8", errors="backslashreplace")
            samples.append({
                "label": label,
                "prompt": prompt_text,
                "generated": generated,
            })
            print(f"  {label}: {generated[:80]}...")
        except Exception as e:
            samples.append({
                "label": label,
                "prompt": prompt_text,
                "generated": f"[Error: {e}]",
            })

    del model
    return samples


# ═════════════════════════════════════════════════════════════════════
#  Main
# ═════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Merge two BDH models")
    parser.add_argument("--model1", required=True, help="Path to first model checkpoint")
    parser.add_argument("--model2", required=True, help="Path to second model checkpoint")
    parser.add_argument("--output", required=True, help="Output path for merged model")
    parser.add_argument("--name1", default="french")
    parser.add_argument("--name2", default="portuguese")
    parser.add_argument("--merge-embeddings", choices=["average", "first", "second"], default="average")
    parser.add_argument("--merge-lm-head", choices=["average", "first", "second"], default="average")
    parser.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    parser.add_argument("--french-val", default="data/en-fr/val.bin")
    parser.add_argument("--portuguese-val", default="data/en-pt/val.bin")
    parser.add_argument("--skip-eval", action="store_true", help="Skip evaluation (no val data)")
    parser.add_argument("--frontend-json", default="", help="Output JSON for frontend merge page")
    args = parser.parse_args()

    merge_config = MergeConfig(
        model1_path=args.model1,
        model2_path=args.model2,
        output_path=args.output,
        model1_name=args.name1,
        model2_name=args.name2,
        merge_embeddings=args.merge_embeddings,
        merge_lm_head=args.merge_lm_head,
    )

    print("=" * 60)
    print("🐉 BDH Model Merger")
    print("=" * 60)
    print(f"  Model 1: {args.model1} ({args.name1})")
    print(f"  Model 2: {args.model2} ({args.name2})")
    print(f"  Output:  {args.output}")

    # Load
    print("\n📂 Loading models...")
    state1, config1 = load_checkpoint(args.model1)
    state2, config2 = load_checkpoint(args.model2)
    print(f"  Model 1: {config1.n_layer}L, {config1.n_embd}D, {config1.n_head}H, N={config1.n_neurons}")
    print(f"  Model 2: {config2.n_layer}L, {config2.n_embd}D, {config2.n_head}H, N={config2.n_neurons}")

    # Verify
    print("\n🔍 Compatibility check...")
    if not verify_compatible(config1, config2):
        print("\n❌ Models are incompatible!")
        return 1

    # Merge
    merged_state, merged_config = merge_models(state1, state2, config1, merge_config)

    # Heritage
    heritage = create_heritage_map(config1, merge_config)

    # Validate
    if not validate_merged_model(merged_state, merged_config, args.device):
        print("\n❌ Validation failed!")
        return 1

    # Evaluate
    eval_results = {}
    if not args.skip_eval:
        eval_results = run_evaluation(
            args.model1, args.model2,
            merged_state, merged_config,
            args.name1, args.name2,
            args.device,
            args.french_val, args.portuguese_val,
        )

    # Generate samples
    samples = generate_samples(merged_state, merged_config, args.device)

    # Save merged checkpoint
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    checkpoint = {
        "model_state_dict": merged_state,
        "config": asdict(merged_config),
        "heritage": heritage,
        "merge_config": asdict(merge_config),
        "source_models": {args.name1: args.model1, args.name2: args.model2},
    }
    torch.save(checkpoint, output_path)
    print(f"\n💾 Saved merged model: {output_path}")

    # Save heritage JSON
    heritage_path = output_path.with_suffix(".heritage.json")
    with open(heritage_path, "w") as f:
        json.dump(heritage, f, indent=2)

    # Save frontend JSON (for MergePage)
    frontend_json_path = args.frontend_json or str(
        ROOT / "frontend" / "public" / "merge" / "merge_data.json"
    )
    Path(frontend_json_path).parent.mkdir(parents=True, exist_ok=True)

    model1_params = sum(p.numel() for p in state1.values())
    model2_params = sum(p.numel() for p in state2.values())
    merged_params = sum(p.numel() for p in merged_state.values())

    frontend_data = {
        "heritage": heritage,
        "models": {
            args.name1: {
                "name": args.name1.capitalize(),
                "flag": "🇫🇷" if "fr" in args.name1.lower() else "🏳️",
                "params": model1_params,
                "n_neurons": config1.n_neurons,
                "n_heads": config1.n_head,
                "n_layers": config1.n_layer,
                "n_embd": config1.n_embd,
            },
            args.name2: {
                "name": args.name2.capitalize(),
                "flag": "🇵🇹" if "port" in args.name2.lower() else "🏳️",
                "params": model2_params,
                "n_neurons": config2.n_neurons,
                "n_heads": config2.n_head,
                "n_layers": config2.n_layer,
                "n_embd": config2.n_embd,
            },
            "merged": {
                "name": "Merged Polyglot",
                "flag": "🌍",
                "params": merged_params,
                "n_neurons": merged_config.n_neurons,
                "n_heads": merged_config.n_head,
                "n_layers": merged_config.n_layer,
                "n_embd": merged_config.n_embd,
            },
        },
        "evaluation": eval_results,
        "samples": samples,
    }

    with open(frontend_json_path, "w") as f:
        json.dump(frontend_data, f, indent=2)
    print(f"📋 Saved frontend data: {frontend_json_path}")

    print("\n" + "=" * 60)
    print("✅ Merge complete!")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    exit(main())
