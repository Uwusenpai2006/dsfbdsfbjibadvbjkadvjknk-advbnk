# ═══════════════════════════════════════════════════════════
# BDH Project — Create Clean Zip for Kaggle (Windows)
# ═══════════════════════════════════════════════════════════
#
# Usage:
#   cd BDH_Pathway-monosemanticity-architecture
#   powershell -ExecutionPolicy Bypass -File create_kaggle_zip.ps1
# ═══════════════════════════════════════════════════════════

Write-Host "`n=== Creating clean zip for Kaggle ===" -ForegroundColor Cyan

if (-not (Test-Path "training\bdh.py")) {
    Write-Host "Error: Run this from the project root (the folder with training\bdh.py)" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

$OutputZip = Join-Path (Split-Path (Get-Location) -Parent) "bdh_kaggle_upload.zip"

# We use Python's zipfile to create the zip because:
# - Windows Compress-Archive writes backslashes in paths
# - Kaggle rejects backslashes ("contains a forbidden character")
# - Python zipfile writes forward slashes (Linux-compatible)

$PythonScript = @'
import os, zipfile, sys

exclude_dirs = {
    'node_modules', '.git', '__pycache__', 'dist', '.vite',
    'venv', '.env', 'data', 'analysis_results', '.next'
}
exclude_ext = {
    '.pt', '.pth', '.ckpt', '.bin', '.tgz', '.pyc', '.pyo'
}
exclude_files = {
    'default', 'default.pub', 'bdh_results.zip',
    'Thumbs.db', '.DS_Store', 'bdh_kaggle_upload.zip'
}

output = sys.argv[1]
count = 0
skipped = 0

with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        for fname in files:
            filepath = os.path.join(root, fname)
            arcname = filepath.replace('\\', '/').lstrip('./')
            if fname in exclude_files:
                skipped += 1
                continue
            if os.path.splitext(fname)[1].lower() in exclude_ext:
                skipped += 1
                continue
            zf.write(filepath, arcname)
            count += 1

size_kb = os.path.getsize(output) // 1024
print(f'Done! {count} files included, {skipped} skipped, {size_kb} KB')
'@

$TempPy = Join-Path $env:TEMP "bdh_make_zip.py"
Set-Content -Path $TempPy -Value $PythonScript -Encoding utf8

Write-Host "Building zip..." -ForegroundColor Gray
python $TempPy "$OutputZip"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Python failed. Make sure Python is in PATH." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Remove-Item $TempPy -Force -ErrorAction SilentlyContinue

Write-Host "`n=== Created: $OutputZip ===" -ForegroundColor Green
Write-Host "`nUpload this to Kaggle Datasets, then run the notebook.`n" -ForegroundColor Yellow
Read-Host "Press Enter to exit"
