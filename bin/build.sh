#!/bin/sh

# 1. More robust way to get the absolute path
# This handles spaces and symlinks correctly
SCRIPTPATH=$(cd "$(dirname "$0")" && pwd)

# 2. Quote the path and add "exit" if the directory doesn't exist
cd "$SCRIPTPATH/.." || exit 1

# 3. Check if an argument was provided to prevent building a broken tag
if [ -z "$1" ]; then
    echo "Error: No tag version provided. Usage: ./build.sh <version>"
    exit 1
fi

# 4. Build and push Docker image
docker buildx build \
  --platform linux/amd64 \
  --tag registry.mss.io/pdf-mss-io:latest \
  --tag "registry.mss.io/pdf-mss-io:$1" \
  --push .
