# 📜 Open Source Dependency License Policy

This document defines NotifyChain's approved open-source license policy and automated CI audit procedures (Issue #717).

---

## 1. Approved Licenses

To ensure compatibility with open-source distribution without imposing copyleft or restrictive viral terms on integrators, all direct and transitive dependencies must carry one of the following approved licenses:

| Category | Approved License Identifiers (SPDX) |
|---|---|
| **Permissive** | `MIT`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`, `0BSD`, `Unlicense`, `Zlib`, `BlueOak-1.0.0` |
| **Public Domain** | `CC0-1.0` |
| **Weak Copyleft (Reviewed)** | `MPL-2.0`, `CC-BY-4.0` |

---

## 2. Prohibited / Review-Required Licenses

Dependencies carrying strong copyleft licenses (e.g. `GPL-3.0`, `AGPL-3.0`, `SSPL`) or proprietary terms must not be included in redistributable contract or client packages without explicit architecture review.

---

## 3. Automated Local & CI Auditing

Run the license scanner locally:

```bash
# Standard license audit
python3 scripts/audit-licenses.py

# Non-blocking advisory mode
python3 scripts/audit-licenses.py --warn-only
```
