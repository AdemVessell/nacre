"""Contract tests for the independent NumPy NACRE reference."""

from __future__ import annotations

import copy
import json
import math
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np


HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import reference  # noqa: E402


class NacreReferenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.p = reference.defaults()

    def test_defaults_and_validation_are_exact_and_nonmutating(self) -> None:
        clean = reference.validate(self.p)
        self.assertEqual(clean, self.p)
        clean["arms"] = 3
        self.assertEqual(self.p["arms"], 11)
        integral_float = dict(self.p, arms=11.0, stage=4.0)
        self.assertEqual(reference.validate(integral_float)["arms"], 11)
        self.assertEqual(reference.validate(integral_float)["stage"], 4)
        for key in ("arms", "stage"):
            bad = copy.deepcopy(self.p)
            bad.pop(key)
            with self.assertRaises(ValueError):
                reference.validate(bad)
            bad = copy.deepcopy(self.p)
            bad["extra"] = 1
            with self.assertRaises(ValueError):
                reference.validate(bad)

    def test_validation_rejects_malformed_and_out_of_range_values(self) -> None:
        cases = [
            {**self.p, "arms": 11.1},
            {**self.p, "arms": 2},
            {**self.p, "stage": 4.1},
            {**self.p, "stage": 5},
            {**self.p, "twist": math.inf},
            {**self.p, "relief": -0.01},
            {**self.p, "hue": 4.0},
            {**self.p, "phase": 7.0},
            {**self.p, "light": True},
        ]
        for bad in cases:
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError):
                    reference.validate(bad)

    def test_coordinates_broadcast_and_bounds(self) -> None:
        result = reference.sample(np.array([0.0, 0.1]), 0.0, self.p)
        self.assertEqual(result.shape, (2, 3))
        for bad_x, bad_y in ((math.nan, 0.0), (0.0, math.inf), (8.0001, 0.0), (0.0, -8.0001)):
            with self.subTest(bad_x=bad_x, bad_y=bad_y):
                with self.assertRaises(ValueError):
                    reference.sample(bad_x, bad_y, self.p)

    def test_stage_zero_is_independent_of_all_scene_parameters(self) -> None:
        base = dict(self.p, stage=0)
        xy = np.linspace(-1.0, 1.0, 13)
        expected = reference.sample(xy[:, None], xy[None, :], base)
        corners = (
            dict(base, arms=3, twist=-9.0, relief=0.0, hue=-3.14, light=-3.14, phase=-6.284),
            dict(base, arms=21, twist=9.0, relief=1.5, hue=3.14, light=3.14, phase=6.284),
        )
        for changed in corners:
            np.testing.assert_array_equal(expected, reference.sample(xy[:, None], xy[None, :], changed))

    def test_relief_zero_flattens_height_gradient_and_normal(self) -> None:
        p = dict(self.p, relief=0.0)
        f = reference.fields(np.array([-0.7, 0.0, 0.8]), np.array([0.2, -0.4, 0.6]), p)
        np.testing.assert_array_equal(f["height"], 0.0)
        np.testing.assert_array_equal(f["hx"], 0.0)
        np.testing.assert_array_equal(f["hy"], 0.0)
        np.testing.assert_allclose(f["normals"], np.array([[0.0, 0.0, 1.0]] * 3), atol=0.0, rtol=0.0)

    def test_zero_twist_removes_radial_winding(self) -> None:
        p = dict(self.p, twist=0.0)
        f = reference.fields(np.array([0.2, 0.35]), np.array([0.4, 0.7]), p)
        # q has no radial log term when k=0; these points share one ray, so
        # theta (the remaining angular term) is equal as well.
        self.assertAlmostEqual(float(f["q"][0]), float(f["q"][1]), places=14)

    def test_phase_periodicity_and_integer_angular_seam(self) -> None:
        p = dict(self.p, phase=0.0)
        p_periodic = dict(p, phase=2.0 * math.pi)
        xy = np.array([-0.62, -0.17, 0.09, 0.33])
        np.testing.assert_allclose(reference.sample(xy, xy[::-1], p), reference.sample(xy, xy[::-1], p_periodic), atol=2e-14, rtol=0.0)
        eps = 1.0e-10
        seam_plus = reference.sample(-0.6, eps, p)
        seam_minus = reference.sample(-0.6, -eps, p)
        np.testing.assert_allclose(seam_plus, seam_minus, atol=2e-9, rtol=0.0)

    def test_stage_three_ignores_light_and_stage_four_uses_it(self) -> None:
        p3 = dict(self.p, stage=3, light=-3.0)
        p3b = dict(p3, light=3.0)
        np.testing.assert_array_equal(reference.sample(0.42, -0.31, p3), reference.sample(0.42, -0.31, p3b))
        p4 = dict(self.p, stage=4, light=-3.0)
        p4b = dict(p4, light=3.0)
        self.assertFalse(np.array_equal(reference.sample(0.42, -0.31, p4), reference.sample(0.42, -0.31, p4b)))

    def test_analytic_gradients_match_finite_difference(self) -> None:
        p = dict(self.p, relief=1.2)
        x = np.array([-0.71, -0.27, 0.31, 0.79])
        y = np.array([0.63, -0.51, 0.24, -0.72])
        h = 1.0e-6
        f = reference.fields(x, y, p)
        hxp = reference.fields(x + h, y, p)["height"]
        hxm = reference.fields(x - h, y, p)["height"]
        hyp = reference.fields(x, y + h, p)["height"]
        hym = reference.fields(x, y - h, p)["height"]
        fd_x = (hxp - hxm) / (2.0 * h)
        fd_y = (hyp - hym) / (2.0 * h)
        np.testing.assert_allclose(f["hx"], fd_x, atol=1.0e-5, rtol=1.0e-5)
        np.testing.assert_allclose(f["hy"], fd_y, atol=1.0e-5, rtol=1.0e-5)

        # A deliberately sign-flipped implementation must be detected.
        with self.assertRaises(AssertionError):
            np.testing.assert_allclose(-f["hx"], fd_x, atol=1.0e-5, rtol=1.0e-5)

    def test_regularization_disc_has_constant_gradient(self) -> None:
        f = reference.fields(np.array([0.0, 5.0e-5]), np.array([0.0, -5.0e-5]), self.p)
        np.testing.assert_array_equal(f["hx"], 0.0)
        np.testing.assert_array_equal(f["hy"], 0.0)
        np.testing.assert_allclose(f["normals"], np.array([[0.0, 0.0, 1.0]] * 2), atol=0.0, rtol=0.0)

    def test_regularization_boundary_ring_remains_finite(self) -> None:
        radius = np.array([9.9e-5, 1.01e-4])
        values = reference.sample(radius, np.zeros_like(radius), self.p)
        self.assertTrue(np.isfinite(values).all())
        fields = reference.fields(radius, np.zeros_like(radius), self.p)
        for name in ("height", "hx", "hy", "normals"):
            self.assertTrue(np.isfinite(fields[name]).all(), name)

    def test_render_top_left_quantization_and_repeatability(self) -> None:
        first = reference.render(19, 13, self.p)
        second = reference.render(19, 13, self.p)
        self.assertEqual(first.dtype, np.uint8)
        self.assertEqual(first.shape, (13, 19, 4))
        np.testing.assert_array_equal(first, second)
        self.assertTrue(np.all(first[..., 3] == 255))
        self.assertTrue(np.all((first[..., :3] >= 0) & (first[..., :3] <= 255)))
        self.assertEqual(first[0, 0, 3], 255)

    def test_dimensions_and_pixel_budget_are_checked(self) -> None:
        for width, height in ((0, 1), (2401, 1), (2001, 2000), (True, 1), (1.1, 1)):
            with self.subTest(width=width, height=height):
                with self.assertRaises(ValueError):
                    reference.render(width, height, self.p)

    def test_cli_output_and_raw_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            output = root / "proof" / "nacre.png"
            raw = root / "proof" / "nacre.rgba"
            subprocess.run(
                [sys.executable, str(HERE / "reference.py"), "--output", str(output), "--raw", str(raw), "--width", "7", "--height", "5"],
                check=True,
            )
            self.assertTrue(output.is_file())
            self.assertEqual(raw.read_bytes(), reference.render(7, 5, self.p).tobytes())
            self.assertGreater(output.stat().st_size, 0)

    def test_cli_reproduces_exported_state_wrapper_and_rejects_malformed_wrapper(self) -> None:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            state = root / "nacre-state.json"
            state.write_text(json.dumps({"format": "nacre-state-1", "state": self.p}), encoding="utf-8")
            output = root / "wrapped.png"
            raw = root / "wrapped.rgba"
            subprocess.run(
                [sys.executable, str(HERE / "reference.py"), "--state", "@" + str(state), "--output", str(output), "--raw", str(raw), "--width", "7", "--height", "5"],
                check=True,
            )
            self.assertEqual(raw.read_bytes(), reference.render(7, 5, self.p).tobytes())
            malformed = json.dumps({"format": "wrong-format", "state": self.p})
            result = subprocess.run(
                [sys.executable, str(HERE / "reference.py"), "--state", malformed, "--output", str(root / "bad.png"), "--width", "2", "--height", "2"],
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
