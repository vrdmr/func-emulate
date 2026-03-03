#!/usr/bin/env bash
set -euo pipefail

# Allow newer .NET SDK versions (e.g. 10.x when repo needs 8.x)
export DOTNET_ROLL_FORWARD=latestMajor

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
  zip_file="$zip_dir/azure-functions-v${version}-${RID}.zip"

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

  # Patch global.json to allow any installed SDK version (e.g. 10.x when repo pins 8.x)
  if [ -f global.json ]; then
    sed -i.bak 's/"rollForward": "[^"]*"/"rollForward": "latestMajor"/' global.json
    rm -f global.json.bak
  fi

  # Patch Python worker to include on Windows builds (removes exclusion condition)
  # By default, azure-functions-host excludes Python worker from Windows builds.
  # We patch this so fnx can run Python functions on Windows.
  if [[ "$RID" == win-* ]] && [ -f eng/build/Workers.Python.props ]; then
    sed -i.bak 's/Condition="!\$(RuntimeIdentifier.StartsWith('\''win'\''))"//' eng/build/Workers.Python.props
    rm -f eng/build/Workers.Python.props.bak
    echo "✓ Patched Workers.Python.props to include Python worker on Windows"
  fi

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
ls -la "$OUTPUT_DIR"/*/azure-functions-v*.zip 2>/dev/null || echo "(no zips found)"
echo "════════════════════════════════════"
