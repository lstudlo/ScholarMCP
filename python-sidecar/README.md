# ScholarMCP Python Sidecar

This sidecar exposes a simple `/parse` endpoint used by ScholarMCP when `RESEARCH_PYTHON_SIDECAR_URL` is configured.

## Run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8090
```

Then set:

```bash
RESEARCH_PYTHON_SIDECAR_URL=http://127.0.0.1:8090
```
