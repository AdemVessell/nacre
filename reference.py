#!/usr/bin/env python3
"""NumPy reference implementation of the NACRE direct-pixel contract.

The module deliberately contains the written equations from ``SPEC.md`` only.
It does not load image assets, use a renderer, or depend on the browser/GLSL
implementation.  ``sample`` is the float reference; ``render`` applies the
specified top-left pixel coordinates and RGBA quantisation.
"""

from __future__ import annotations

import argparse
import json
import math
from collections.abc import Mapping
from numbers import Real
from pathlib import Path
from typing import Any, Sequence

import numpy as np


_KEYS = ("arms", "twist", "relief", "hue", "light", "phase", "stage")
_DEFAULTS = {
    "arms": 11,
    "twist": 5.5,
    "relief": 1.0,
    "hue": 0.0,
    "light": 0.0,
    "phase": 0.0,
    "stage": 4,
}
_RANGES = {
    "twist": (-9.0, 9.0),
    "relief": (0.0, 1.5),
    "hue": (-3.14, 3.14),
    "light": (-3.14, 3.14),
    "phase": (-6.284, 6.284),
}
_TWO_PI = 2.0 * math.pi
_RADIUS_FLOOR = 0.0001
_REGULARIZATION_R2 = 1.0e-8


equations = (
    {
        "title": "Blank",
        "tex": r"c=b",
        "description": "A continuous dark field before the spiral mask.",
    },
    {
        "title": "Spiral",
        "tex": r"c=m[(0.04,0.12,0.16)+f(0.12,0.36,0.40)]+(1-m)b",
        "description": "The phase field and smooth mask reveal the winding form.",
    },
    {
        "title": "Relief",
        "tex": r"N=\operatorname{normalize}(-H_x,-H_y,1)",
        "description": "Analytic height gradients become a normal and soft light.",
    },
    {
        "title": "Pearl",
        "tex": r"P=0.58+0.31\cos(3r+0.6N_z+hue+\delta)",
        "description": "A chromatic palette is applied without directional illumination.",
    },
    {
        "title": "Finished",
        "tex": r"D=(1-e^{-1.25\max(c,0)})^{1/2.2}",
        "description": "The complete composition with palette, light, specular and grazing tint accents.",
    },
)


def defaults() -> dict[str, Any]:
    """Return a fresh copy of the contract defaults."""

    return dict(_DEFAULTS)


def _is_number(value: Any) -> bool:
    return isinstance(value, Real) and not isinstance(value, (bool, np.bool_))


def _finite_number(value: Any, name: str) -> float:
    if not _is_number(value):
        raise ValueError(f"{name} must be a finite number")
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f"{name} must be a finite number")
    return result


def _integer(value: Any, name: str) -> int:
    if isinstance(value, (bool, np.bool_)) or not isinstance(value, Real):
        raise ValueError(f"{name} must be an integer")
    numeric = float(value)
    if not math.isfinite(numeric) or numeric != math.trunc(numeric):
        raise ValueError(f"{name} must be an integer")
    return int(numeric)


def validate(params: Mapping[str, Any]) -> dict[str, Any]:
    """Validate a parameter object and return an independent clean copy."""

    if not isinstance(params, Mapping):
        raise ValueError("params must be an object")
    actual = set(params)
    expected = set(_KEYS)
    if actual != expected:
        missing = sorted(expected - actual)
        extra = sorted(actual - expected)
        detail = []
        if missing:
            detail.append("missing " + ", ".join(missing))
        if extra:
            detail.append("extra " + ", ".join(extra))
        raise ValueError("params has invalid keys (" + "; ".join(detail) + ")")

    arms = _integer(params["arms"], "arms")
    if not 3 <= arms <= 21:
        raise ValueError("arms must be an integer from 3 through 21")
    stage = _integer(params["stage"], "stage")
    if not 0 <= stage <= 4:
        raise ValueError("stage must be an integer from 0 through 4")

    clean: dict[str, Any] = {"arms": arms, "stage": stage}
    for name, (lower, upper) in _RANGES.items():
        number = _finite_number(params[name], name)
        if number < lower or number > upper:
            raise ValueError(f"{name} must be in [{lower}, {upper}]")
        clean[name] = number
    return {name: clean[name] for name in _KEYS}


def _coordinates(x: Any, y: Any) -> tuple[np.ndarray, np.ndarray]:
    try:
        xa = np.asarray(x, dtype=np.float64)
        ya = np.asarray(y, dtype=np.float64)
    except (TypeError, ValueError) as exc:
        raise ValueError("coordinates must be finite real values or arrays") from exc
    try:
        xa, ya = np.broadcast_arrays(xa, ya)
    except ValueError as exc:
        raise ValueError("x and y cannot be broadcast together") from exc
    if not np.isfinite(xa).all() or not np.isfinite(ya).all():
        raise ValueError("coordinates must be finite")
    if np.any(np.abs(xa) > 8.0) or np.any(np.abs(ya) > 8.0):
        raise ValueError("coordinates must satisfy |x|, |y| <= 8")
    return xa, ya


def _smoothstep(value: np.ndarray) -> np.ndarray:
    c = np.clip(value, 0.0, 1.0)
    return c * c * (3.0 - 2.0 * c)


def _compute_fields(x: np.ndarray, y: np.ndarray, p: Mapping[str, Any]) -> dict[str, np.ndarray]:
    n = float(p["arms"])
    k = float(p["twist"])
    relief = float(p["relief"])
    phase = float(p["phase"])

    r2_xy = x * x + y * y
    raw_r = np.sqrt(r2_xy)
    r = np.maximum(raw_r, _RADIUS_FLOOR)
    regularized = r2_xy < _REGULARIZATION_R2
    theta = np.arctan2(y, x)
    theta = np.where(regularized, 0.0, theta)
    q = n * theta - k * np.log(r * r + 0.008) + phase
    f = (1.0 + np.cos(q)) * 0.5

    e = np.exp(-np.power(r / 0.76, 8.0))
    b = 1.0 - np.exp(-(r * r) / 0.008)
    a = e * b
    height = 0.10 * relief * a * (0.16 + f**3)

    e_r = -8.0 * r**7 / (0.76**8) * e
    b_r = (2.0 * r / 0.008) * np.exp(-(r * r) / 0.008)
    a_r = e_r * b + e * b_r
    f_r = k * r / (r * r + 0.008) * np.sin(q)
    f_theta = -n * np.sin(q) / 2.0
    h_r = 0.10 * relief * (a_r * (0.16 + f**3) + 3.0 * a * f**2 * f_r)
    h_theta = 0.30 * relief * a * f**2 * f_theta
    h_x = h_r * x / r - h_theta * y / (r * r)
    h_y = h_r * y / r + h_theta * x / (r * r)
    h_x = np.where(regularized, 0.0, h_x)
    h_y = np.where(regularized, 0.0, h_y)

    normal_raw = np.stack((-h_x, -h_y, np.ones_like(h_x)), axis=-1)
    normal_norm = np.linalg.norm(normal_raw, axis=-1, keepdims=True)
    normals = normal_raw / normal_norm

    light = float(p["light"])
    cos_l = math.cos(light)
    sin_l = math.sin(light)
    light_x = -0.45 * cos_l - 0.65 * sin_l
    light_y = -0.45 * sin_l + 0.65 * cos_l
    light_raw = np.asarray((light_x, light_y, 1.0), dtype=np.float64)
    light_vec = light_raw / np.linalg.norm(light_raw)
    view_raw = light_vec + np.asarray((0.0, 0.0, 1.0), dtype=np.float64)
    view_vec = view_raw / np.linalg.norm(view_raw)
    diffuse = np.maximum(np.sum(normals * light_vec, axis=-1), 0.0)
    specular = np.maximum(np.sum(normals * view_vec, axis=-1), 0.0) ** 42.0

    palette = 0.58 + 0.31 * np.cos(
        (3.0 * r + 0.6 * normals[..., 2] + float(p["hue"]))[..., None]
        + np.asarray((0.0, 1.2, 2.7), dtype=np.float64)
    )
    mask = _smoothstep((0.835 + 0.026 * np.cos(q) - r) / 0.018)
    background = np.empty((*x.shape, 3), dtype=np.float64)
    background[...] = np.asarray((0.001, 0.0025, 0.004), dtype=np.float64)
    background = background + np.exp(-((x + 0.6) ** 2 + (y - 0.5) ** 2) / 0.7)[..., None] * np.asarray(
        (0.002, 0.005, 0.008), dtype=np.float64
    )

    return {
        "r": r,
        "theta": theta,
        "q": q,
        "f": f,
        "height": height,
        "hx": h_x,
        "hy": h_y,
        "normals": normals,
        "diffuse": diffuse,
        "specular": specular,
        "palette": palette,
        "mask": mask,
        "background": background,
    }


def fields(x: Any, y: Any, params: Mapping[str, Any]) -> dict[str, np.ndarray]:
    """Return the continuous NACRE fields needed for independent checks.

    The returned dictionary includes ``height``, ``hx``, ``hy`` and
    ``normals`` plus the intermediate fields used by the colour stages.  All
    arrays are float64 and share the broadcast shape of ``x`` and ``y``.
    """

    p = validate(params)
    xa, ya = _coordinates(x, y)
    return _compute_fields(xa, ya, p)


def _colour(x: np.ndarray, y: np.ndarray, p: Mapping[str, Any], f: Mapping[str, np.ndarray]) -> np.ndarray:
    stage = int(p["stage"])
    b = f["background"]
    if stage == 0:
        return b

    m = f["mask"][..., None]
    wave = np.asarray((0.04, 0.12, 0.16), dtype=np.float64) + f["f"][..., None] * np.asarray(
        (0.12, 0.36, 0.40), dtype=np.float64
    )
    if stage == 1:
        return wave * m + b * (1.0 - m)

    d = f["diffuse"]
    s = f["specular"]
    relief_colour = np.asarray((0.72, 0.76, 0.80), dtype=np.float64) * (0.16 + 0.90 * d)[..., None]
    relief_colour = relief_colour + s[..., None] * np.asarray((1.10, 1.00, 0.95), dtype=np.float64)
    if stage == 2:
        return relief_colour * m + b * (1.0 - m)

    if stage == 3:
        pearl = f["palette"]
        return pearl * m + b * (1.0 - m)

    full = f["palette"] * (0.16 + 0.90 * d)[..., None]
    full = full + s[..., None] * np.asarray((1.10, 1.00, 0.95), dtype=np.float64)
    full = full + (1.0 - f["normals"][..., 2])[..., None] ** 3 * np.asarray(
        (0.13, 0.30, 0.32), dtype=np.float64
    )
    return b * (1.0 - m) + full * m


def _display(colour: np.ndarray) -> np.ndarray:
    return np.power(1.0 - np.exp(-1.25 * np.maximum(colour, 0.0)), 1.0 / 2.2)


def sample(x: Any, y: Any, params: Mapping[str, Any]) -> np.ndarray:
    """Evaluate one or many coordinates and return display RGB floats.

    Scalars return shape ``(3,)``; broadcast arrays return ``(..., 3)``.
    """

    p = validate(params)
    xa, ya = _coordinates(x, y)
    f = _compute_fields(xa, ya, p)
    result = _display(_colour(xa, ya, p, f))
    if not np.isfinite(result).all():
        raise ValueError("sample produced non-finite values")
    return np.asarray(result, dtype=np.float64)


def _dimension(value: Any, name: str) -> int:
    result = _integer(value, name)
    if not 1 <= result <= 2400:
        raise ValueError(f"{name} must be an integer from 1 through 2400")
    return result


def render(width: Any, height: Any, params: Mapping[str, Any]) -> np.ndarray:
    """Render top-left row-major RGBA bytes as an ``(H,W,4)`` uint8 array."""

    w = _dimension(width, "width")
    h = _dimension(height, "height")
    if w * h > 4_000_000:
        raise ValueError("render exceeds the 4,000,000 pixel limit")
    p = validate(params)
    i = np.arange(w, dtype=np.float64)[None, :]
    j = np.arange(h, dtype=np.float64)[:, None]
    x = (2.0 * i + 1.0 - w) / h
    y = (h - 2.0 * j - 1.0) / h
    f = _compute_fields(x, y, p)
    display = np.clip(_display(_colour(x, y, p, f)), 0.0, 1.0)
    rgb = np.floor(255.0 * display + 0.5).astype(np.uint8)
    alpha = np.full((h, w, 1), 255, dtype=np.uint8)
    return np.concatenate((rgb, alpha), axis=-1)


def _state_from_args(args: argparse.Namespace) -> dict[str, Any]:
    p = defaults()
    if args.state:
        source = args.state[1:] if args.state.startswith("@") else args.state
        if args.state.startswith("@"):
            payload = json.loads(Path(source).read_text(encoding="utf-8"))
        elif source.lstrip().startswith(("{", "[")):
            payload = json.loads(source)
        else:
            path = Path(source)
            payload = json.loads(path.read_text(encoding="utf-8")) if path.is_file() else json.loads(source)
        if not isinstance(payload, Mapping):
            raise ValueError("state must be a JSON object")
        if set(payload) == {"format", "state"}:
            if payload["format"] != "nacre-state-1" or not isinstance(payload["state"], Mapping):
                raise ValueError("state wrapper must use format nacre-state-1 and an object state")
            payload = payload["state"]
        elif "format" in payload or "state" in payload:
            raise ValueError("state wrapper must contain exactly format and state")
        p.update(payload)
    for key in _KEYS:
        value = getattr(args, key)
        if value is not None:
            p[key] = value
    return validate(p)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", "--out", dest="output", default="proof/nacre.png")
    parser.add_argument("--raw", help="write row-major RGBA bytes to this path")
    parser.add_argument("--width", type=int, default=1200)
    parser.add_argument("--height", type=int, default=900)
    parser.add_argument("--state", help="JSON text, JSON file path, or @JSON-file")
    parser.add_argument("--arms", type=int)
    parser.add_argument("--twist", type=float)
    parser.add_argument("--relief", type=float)
    parser.add_argument("--hue", type=float)
    parser.add_argument("--light", type=float)
    parser.add_argument("--phase", type=float)
    parser.add_argument("--stage", type=int)
    args = parser.parse_args(argv)
    p = _state_from_args(args)
    image = render(args.width, args.height, p)
    if args.raw:
        raw = Path(args.raw)
        raw.parent.mkdir(parents=True, exist_ok=True)
        raw.write_bytes(image.tobytes())
    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        try:
            from PIL import Image
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("PNG output requires Pillow") from exc
        Image.fromarray(image).save(output)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as exc:
        print(f"nacre reference: {exc}", file=__import__("sys").stderr)
        raise SystemExit(2)
