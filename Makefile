PYTHON ?= python3
NPM ?= npm

.PHONY: install install-api run reset-demo replay

install: install-api
	$(NPM) --prefix frontend ci --no-audit --no-fund
	$(NPM) --prefix frontend run build

install-api:
	$(PYTHON) -m venv .venv
	.venv/bin/python -m pip install -r backend/requirements.txt

run:
	.venv/bin/python -m backend.cli serve

reset-demo:
	.venv/bin/python -m backend.cli reset-demo

replay:
	.venv/bin/python -m backend.replay
