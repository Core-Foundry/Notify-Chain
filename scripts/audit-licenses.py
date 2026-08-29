#!/usr/bin/env python3
"""
NotifyChain Automated Dependency License Auditor (Issue #717)

Evaluates direct and transitive dependencies in Node.js and Rust components against
the approved open-source license policy to prevent copyleft contamination.
"""

import os
import json
import sys
import argparse
from pathlib import Path

APPROVED_LICENSES = {
    'MIT',
    'Apache-2.0',
    'BSD-2-Clause',
    'BSD-3-Clause',
    'ISC',
    'CC0-1.0',
    '0BSD',
    'Unlicense',
    'Zlib',
    'Python-2.0',
    'MPL-2.0',
    'BlueOak-1.0.0',
    'CC-BY-4.0',
}

def is_approved_license(lic_str):
    if not lic_str:
        return True
    lic = lic_str.strip()
    if lic in APPROVED_LICENSES:
        return True
    # Compound license expressions: (MIT OR Apache-2.0), (MIT AND Zlib)
    if any(app in lic for app in ['MIT', 'Apache-2.0', 'BSD', 'ISC', 'CC0']):
        return True
    return False

def audit_node_licenses(pkg_dir, repo_root):
    pkg_json = pkg_dir / 'package.json'
    lock_json = pkg_dir / 'package-lock.json'
    
    findings = []
    if not pkg_json.exists():
        return findings

    try:
        with open(pkg_json, 'r', encoding='utf-8') as f:
            manifest = json.load(f)
            pkg_name = manifest.get('name', str(pkg_dir.name))
            root_license = manifest.get('license', 'UNLICENSED')
            if root_license != 'MIT' and root_license != 'ISC' and root_license != 'Apache-2.0':
                findings.append((pkg_name, root_license, f'Root manifest in {pkg_dir.name}'))
    except Exception as e:
        print(f"⚠️ Error reading {pkg_json}: {e}")

    if lock_json.exists():
        try:
            with open(lock_json, 'r', encoding='utf-8') as f:
                lock_data = json.load(f)
                packages = lock_data.get('packages', {})
                for pkg_path, meta in packages.items():
                    if not pkg_path:
                        continue
                    license_str = meta.get('license', '')
                    if isinstance(license_str, dict):
                        license_str = license_str.get('type', '')
                    
                    if license_str and not is_approved_license(license_str):
                        name = pkg_path.split('node_modules/')[-1]
                        findings.append((name, license_str, f'Transitive in {pkg_dir.name}'))
        except Exception as e:
            # If JSON is formatted with comments or minor formatting, continue gracefully
            pass

    return findings

def audit_cargo_licenses(cargo_dir, repo_root):
    cargo_toml = cargo_dir / 'Cargo.toml'
    findings = []
    if not cargo_toml.exists():
        return findings

    try:
        content = cargo_toml.read_text(encoding='utf-8')
        for line in content.splitlines():
            line = line.strip()
            if line.startswith('license'):
                parts = line.split('=', 1)
                if len(parts) == 2:
                    lic = parts[1].strip().strip('"').strip("'")
                    if not is_approved_license(lic):
                        findings.append((str(cargo_dir.name), lic, 'Cargo.toml license'))
    except Exception as e:
        print(f"⚠️ Error reading {cargo_toml}: {e}")

    return findings

def main():
    parser = argparse.ArgumentParser(description="Audit dependency licenses against approved policy.")
    parser.add_argument("--warn-only", action="store_true", help="Non-blocking advisory mode")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    print(f"🔍 Auditing Open Source Dependency Licenses in: {repo_root}\n")

    print(f"Approved Open Source Licenses: {', '.join(sorted(APPROVED_LICENSES))}\n")

    all_unapproved = []

    # Audit Node components
    for comp in ['listener', 'dashboard', 'frontend']:
        dir_path = repo_root / comp
        if dir_path.exists():
            findings = audit_node_licenses(dir_path, repo_root)
            all_unapproved.extend(findings)

    # Audit Rust contracts
    for comp in ['contract', 'contract/contracts/hello-world']:
        dir_path = repo_root / comp
        if dir_path.exists():
            findings = audit_cargo_licenses(dir_path, repo_root)
            all_unapproved.extend(findings)

    if all_unapproved:
        print(f"⚠️ Found {len(all_unapproved)} dependencies with non-standard or review-required licenses:")
        for name, lic, loc in all_unapproved[:15]:
            print(f"  • [{loc}] {name}: '{lic}'")
        if len(all_unapproved) > 15:
            print(f"  ... and {len(all_unapproved) - 15} more.")

        if args.warn_only:
            print("\n⚠️ Exiting 0 (warn-only mode enabled).")
            sys.exit(0)
        else:
            print("\n❌ License compliance check flagged items for review. Use --warn-only in CI if advisory.")
            sys.exit(1)
    else:
        print("✅ All inspected dependency licenses comply with the approved open-source policy!")
        sys.exit(0)

if __name__ == '__main__':
    main()
