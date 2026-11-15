PYTHON ?= python3
NPM ?= npm

.PHONY: install install-api build run reset-demo replay evidence

install: install-api
	$(NPM) --prefix frontend ci --no-audit --no-fund
	$(MAKE) build

build:
	$(NPM) --prefix frontend run build

# Reuses an existing .venv; venvs made by uv ship without pip, so ensurepip adds it.
install-api:
	test -x .venv/bin/python || $(PYTHON) -m venv .venv
	.venv/bin/python -m pip --version >/dev/null 2>&1 || .venv/bin/python -m ensurepip --upgrade
	.venv/bin/python -m pip install -r backend/requirements.txt

run:
	.venv/bin/python -m backend.cli serve

reset-demo:
	.venv/bin/python -m backend.cli reset-demo

replay:
	.venv/bin/python -m backend.replay

evidence:
	.venv/bin/python scripts/rebuild_demo_evidence.py --offline
