# NACRE build log

24 October 2026. Historical local-build notes; publication was authorized after this review.

- Explored three spiral fold counts in NumPy (7, 11, 17); selected eleven, refined the outline from diffuse circular fade to a bounded scallop and darkened the background. Exploration images/scripts are in exploration/.
- Wrote SPEC.md before JS/reference cross-checks; equations include the complete shading, palette, background, mask and display transform. This is direct procedural pixel art, with an analytic height gradient used for an illusion of depth.
- First JS smoke run failed: parameter validation expected eight keys although the declared state has seven. Corrected the count and reran successfully. No visual or numerical result was accepted from the failed run.
- Independent NumPy implementation and analytic-gradient review completed. JS/NumPy float and full-image comparisons pass; Chrome GPU differences are at most one 8-bit channel level in the tested cases. Fifteen reference tests include a deliberately wrong derivative rejected by the finite-difference oracle.
- Found the command-line reference initially did not accept the UI-exported state wrapper. Added strict wrapper support and a CLI round-trip/malformed-wrapper test; final rerun passes. Unit-test subprocess now uses the caller's Python interpreter for virtual-environment reproduction.
- UI import now validates the wrapper format as well as numeric state. Guided reveal completion, presets, phase controls, pixel inspection and import rejection were observed in Chrome. Browser download event timed out despite PNG-prepared UI state; persistence is explicitly unverified. Independent PNG export is present and verified by the core comparison.
- Responsive override requested390px but browser rendered520px; recorded actual narrow dimensions, not a mobile pass. Reset briefly timed out, reconnect restored control, explicit reset verified2140×1035. Final screenshots are in proof/. No public actions.

- Publication packaging adds navigation, metadata and reproduction documentation. Original pixel-program bytes are preserved; publication validation is recorded separately.
