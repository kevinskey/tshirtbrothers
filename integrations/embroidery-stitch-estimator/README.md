# TSB PNG Embroidery Stitch Estimator (experimental)

Standalone FastAPI service designed for later integration with the existing T-Shirt Brothers Express quoting backend. It does not modify the live quoting or pricing flow.

## Run
```bash
cd integrations/embroidery-stitch-estimator
python -m pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8000
```
Visit http://127.0.0.1:8000/docs for interactive API documentation.

## API
`POST /api/v1/embroidery/estimate` multipart form fields:
- `file`: PNG file, up to 15 MB
- `width_in`: finished embroidery width (0.25–20 inches)
- `height_in`: optional finished height
- `spacing_mm`: optional stitch spacing (default 0.42)

Returns `estimated_stitches`, `low_stitches`, `high_stitches`, `color_count_estimate`, `coverage_pct`, and a breakdown. This is a heuristic estimate, **not a DST stitch count**. Calibrate with real digitized files before using it to quote customers.

## Integration plan
1. Deploy as an internal service with authentication, request limits and restricted network access.
2. Add a server-side Express proxy route using existing customer authentication and file upload controls.
3. Feed its stitch-count range to the existing pricing engine; do not hardcode rates in this service.
4. Add UI in the embroidery quote workflow and test against production digitized DST files.

Do not expose this prototype publicly without security review and additional input validation.
