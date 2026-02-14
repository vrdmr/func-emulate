#!/usr/bin/env bash
set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────
HOST_REPO="https://github.com/Azure/azure-functions-host.git"
HOST_DIR="./azure-functions-host"
OUTPUT_DIR="./cdn-server/hosts"

# The 5 release tags to build (from GitHub releases, showing real version skew)
TAGS=(
  "v4.1047.100"   # Flex Consumption (newest)
  "v4.1046.100"   # Linux Premium
  "v4.1045.200"   # Windows Consumption
  "v4.1045.100"   # Windows Dedicated
  "v4.1044.400"   # Linux Consumption (oldest, deprecated)
)

# Detect platform RID
detect_rid() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os" in
    Darwin) os="osx" ;;
    Linux)  os="linux" ;;
    *)      echo "Unsupported OS: $os"; exit 1 ;;
  esac
  case "$arch" in
    x86_64)  arch="x64" ;;
    arm64|aarch64) arch="arm64" ;;
    *)       echo "Unsupported arch: $arch"; exit 1 ;;
  esac
  echo "${os}-${arch}"
}

RID=$(detect_rid)
echo "Building for platform: $RID"
echo "Tags to build: ${TAGS[*]}"
echo ""

# ─── Clone (if needed) ──────────────────────────────────────────────
if [ ! -d "$HOST_DIR" ]; then
  echo "Cloning azure-functions-host..."
  git clone "$HOST_REPO" "$HOST_DIR"
else
  echo "Using existing clone at $HOST_DIR"
  cd "$HOST_DIR" && git fetch --tags && cd -
fi

# ─── Build each tag ─────────────────────────────────────────────────
for tag in "${TAGS[@]}"; do
  version="${tag#v}"  # strip leading 'v' → "4.1047.100"
  zip_dir="$OUTPUT_DIR/$version"
  zip_file="$zip_dir/Azure.Functions.Host.${RID}.zip"

  if [ -f "$zip_file" ]; then
    echo "[$version] Already built, skipping."
    continue
  fi

  echo ""
  echo "═══════════════════════════════════════════════════"
  echo "Building host $version (tag: $tag) for $RID"
  echo "═══════════════════════════════════════════════════"

  cd "$HOST_DIR"
  git checkout "$tag" --quiet

  # Build self-contained (disable ReadyToRun for cross-platform compat)
  dotnet publish src/WebJobs.Script.WebHost/WebJobs.Script.WebHost.csproj \
    -c Release \
    -r "$RID" \
    --self-contained \
    -p:PublishReadyToRun=false \
    -o "./build-output/$version" \
    --verbosity quiet

  # Verify the native executable exists
  exe_name="Microsoft.Azure.WebJobs.Script.WebHost"
  if [ ! -f "./build-output/$version/$exe_name" ]; then
    echo "ERROR: Build did not produce $exe_name"
    exit 1
  fi

  # Zip it
  cd -
  mkdir -p "$zip_dir"
  cd "$HOST_DIR/build-output/$version"
  zip -r -q "$OLDPWD/$zip_file" .
  cd "$OLDPWD"

  echo "[$version] Built and zipped → $zip_file"
done

echo ""
echo "════════════════════════════════════"
echo "All host builds complete!"
echo "Output: $OUTPUT_DIR/"
ls -la "$OUTPUT_DIR"/*/Azure.Functions.Host.*.zip 2>/dev/null || echo "(no zips found)"
echo "════════════════════════════════════"
