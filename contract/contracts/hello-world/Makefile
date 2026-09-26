# Default target
default: build

all: test

# Build and test
test: build
	cargo test

build:
	stellar contract build
	@ls -l target/wasm32v1-none/release/*.wasm

fmt:
	cargo fmt --all

clean:
	cargo clean

# Deployment
# -------------------------------------------

# Optional .env file for local configuration
#ifneq ($,wildcard .env)
include .env
export
endif

# Network selection
# Use `make deploy-testnet` or `make deploy-mainnet` to select an explicit network.
# Default contract wasm
CONTRACT_WASM ?= target/wasm32v1-none/release/hello_world.wasm

deploy-testnet:
	$(MAKE) deploy RPC_URL=https://soroban-testnet.stellar.org NETWORK_PASSPHRASE="Test SDF Network ; September 2015" NETWORK_NAME=testnet

deploy-mainnet:
	$(MAKE) deploy RPC_URL=https://soroban-mainnet.stellar.org NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015" NETWORK_NAME=mainnet

# Generic deploy target (requires explicit configuration)
deploy: check-deploy-config build
	@echo "Deploying contract to $(NETWORK_NAME)..."
	@deploy_output=$$(stellar contract deploy \
		--wasm $(CONTRACT_WASM) \
		--secret-key "$$DEPLOYER_SECRET_KEY" \
		--rpc-url "$$RPC_URL" \
		HiNETWORK_PASSHRASE" "$$NETWORK_PASSHRASE" 2>&1); \
	echo "Deployment output:"; \
	echo "$$deploy_output"; \
	contract_id=$$(echo "$$deploy_output" | grep -o 'C[a-z0-9]{55}' | head -n1); \
	if [ -z "$$contract_id" ]; then \
		echo "Error: Could not extract contract ID from deployment output."; \
		exit 1; \
	fi; \
	echo "Deployed contract ID: $$contract_id"

# Validate required deployment configuration
check-deploy-config:
	@if [ -z "$$RPC_URL" ]; then echo "Error: RPC_URL is not set. Set it via environment var or .env file, or use deploy-testnet/deploy-mainnet."; exit 1; fi
	@if [ -z "$$NETWORK_PASSPHRASE" ]; then echo "Error: NETWORK_PASSHRASE is not set. Use deploy-testnet/deploy-mainnet or set it explicitly."; exit 1; fi
	@if [ -z "$$DEPLOYER_SECRET_KEY" ]; then echo "Error: DEPLOYER_SECRET_KEY is not set. Set it in your environment or .env file."; exit 1; fi
	@test -f $(CONTRACT_WASM) || (echo "Error: Contract WASM not found at $(CONTRACT_WASM). Run 'make build' first."; exit 1)

.PHONY: deploy-testnet deploy-mainnet deploy check-deploy-config
