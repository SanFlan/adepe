# ADEPE
#
# `make help` lists the targets. The common path is:
#
#   make install
#   make dev
#
# The contract's compiler output is generated and not committed, so `dev`, `build` and
# `test` all depend on it and will compile it for you when the sources are newer.

.DEFAULT_GOAL := help

# Compiling the contract produces this, among much else. Using the real file as the target
# means editing a .compact recompiles, and touching nothing does not.
MANAGED  := contract/contracts/managed/hello-world/contract/index.js
SOURCES  := contract/contracts/hello-world.compact contract/contracts/schnorr.compact

.PHONY: help install compile dev build test test-contract typecheck \
        proof-server proof-server-stop env-up env-down clean

help: ## List targets
	@grep -hE '^[a-z][a-z-]*:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN { FS = ":.*?## " } { printf "  %-20s %s\n", $$1, $$2 }'

# --------------------------------------------------------------------- setup

install: contract/node_modules app/node_modules ## Install contract and app dependencies

contract/node_modules: contract/package.json
	cd contract && yarn install
	@touch $@

app/node_modules: app/package.json
	cd app && npm install
	@touch $@

$(MANAGED): $(SOURCES) contract/node_modules
	cd contract && yarn compile

compile: $(MANAGED) ## Compile the Compact contract

# ------------------------------------------------------------------ everyday

dev: $(MANAGED) app/node_modules ## Serve the app with hot reload
	cd app && npm run dev

build: $(MANAGED) app/node_modules ## Type-check and build the app for production
	cd app && npm run build

typecheck: $(MANAGED) app/node_modules ## Type-check the app
	cd app && npm run typecheck

test: $(MANAGED) app/node_modules ## Run the app tests
	cd app && npm test

# --------------------------------------------------------------------- chain
#
# The proof server is enough for Local proofs mode. The full stack (node, indexer, proof
# server) is only needed by the contract's integration test.

proof-server: ## Start the local proof server (Docker)
	cd contract && docker compose up -d --wait proof-server

proof-server-stop: ## Stop the local proof server
	cd contract && docker compose stop proof-server

env-up: ## Start the full local network: node, indexer, proof server
	cd contract && docker compose up -d --wait

env-down: ## Stop and remove the local network
	cd contract && docker compose down

test-contract: $(MANAGED) contract/node_modules ## Integration test against the local network
	@echo "Requires the local network. Run 'make env-up' first if it is not running."
	cd contract && yarn test:local

# --------------------------------------------------------------------- chores

clean: ## Remove build output and compiler artifacts
	rm -rf app/dist app/.vite app/public/zk contract/contracts/managed
