#!/usr/bin/env bash
# ==============================================================================
# NotifyChain Automated Dependency Vulnerability Scanner (Issue #718)
# ==============================================================================
# Scans Node.js and Rust dependencies for known security vulnerabilities (CVEs)
# Distinguishes informational (Low/Moderate) from blocking (High/Critical) findings.
# ==============================================================================
set -u

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

WARN_ONLY=false
if [[ "${1:-}" == "--warn-only" ]]; then
    WARN_ONLY=true
fi

BLOCKING_FAILURES=0

echo -e "${BLUE}==================================================================${NC}"
echo -e "${BLUE}  🛡️ NotifyChain Automated Dependency Vulnerability Scanner        ${NC}"
echo -e "${BLUE}==================================================================${NC}\n"

audit_npm_package() {
    local dir_name="$1"
    local full_path="${ROOT_DIR}/${dir_name}"

    echo -e "${BLUE}--- Scanning Node.js [${dir_name}] ---${NC}"
    if [ ! -f "${full_path}/package.json" ]; then
        echo -e "${YELLOW}Skipped: No package.json in ${dir_name}/${NC}\n"
        return
    fi

    if ! command -v npm >/dev/null 2>&1; then
        echo -e "${YELLOW}npm CLI not found locally; skipping live npm audit.${NC}\n"
        return
    fi

    cd "${full_path}"
    
    # 1. Informational scan (Low/Moderate)
    echo -n "  • Informational check (Low/Moderate): "
    npm audit --audit-level=low >/dev/null 2>&1 && echo -e "${GREEN}Clean${NC}" || echo -e "${YELLOW}Findings present (non-blocking)${NC}"

    # 2. Blocking scan (High/Critical)
    echo -n "  • Blocking check (High/Critical): "
    if npm audit --audit-level=high >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Passed (No High/Critical CVEs)${NC}\n"
    else
        echo -e "${RED}✗ HIGH/CRITICAL Vulnerabilities Found!${NC}"
        npm audit --audit-level=high || true
        BLOCKING_FAILURES=$((BLOCKING_FAILURES + 1))
        echo ""
    fi
}

audit_cargo_package() {
    local dir_name="$1"
    local full_path="${ROOT_DIR}/${dir_name}"

    echo -e "${BLUE}--- Scanning Rust [${dir_name}] ---${NC}"
    if [ ! -f "${full_path}/Cargo.toml" ]; then
        echo -e "${YELLOW}Skipped: No Cargo.toml in ${dir_name}/${NC}\n"
        return
    fi

    if ! command -v cargo-audit >/dev/null 2>&1; then
        echo -e "${YELLOW}cargo-audit not installed locally; skipping live cargo scan.${NC}\n"
        return
    fi

    cd "${full_path}"
    if cargo audit --deny warnings; then
        echo -e "${GREEN}✓ Passed (No Rust CVE advisories)${NC}\n"
    else
        echo -e "${RED}✗ Rust Security Advisories Detected!${NC}\n"
        BLOCKING_FAILURES=$((BLOCKING_FAILURES + 1))
    fi
}

audit_npm_package "listener"
audit_npm_package "dashboard"
audit_cargo_package "contract"

echo -e "${BLUE}==================================================================${NC}"
if [ $BLOCKING_FAILURES -eq 0 ]; then
    echo -e "${GREEN}✅ All components passed high-severity vulnerability checks!${NC}"
    exit 0
else
    if [ "$WARN_ONLY" = true ]; then
        echo -e "${YELLOW}⚠️ Found ${BLOCKING_FAILURES} blocking vulnerability finding(s), but exiting 0 due to --warn-only.${NC}"
        exit 0
    else
        echo -e "${RED}❌ Found ${BLOCKING_FAILURES} blocking vulnerability finding(s). Remediation required.${NC}"
        exit 1
    fi
fi
