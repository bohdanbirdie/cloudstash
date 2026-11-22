#!/bin/bash
# Sync local clones of external repos (gitignored, under local/)

mkdir -p local

sync_repo() {
  local dir="local/$1"
  local url="$2"
  local name="$3"

  if [ -d "$dir/.git" ]; then
    echo "Updating $name..."
    git -C "$dir" pull --ff-only
  else
    echo "Cloning $name..."
    rm -rf "$dir"
    if git clone "$url" "$dir" 2>/dev/null; then
      echo "  ✓ $name"
    else
      echo "  ✗ $name (not found or no access — skipping)"
    fi
  fi
}

sync_repo "raycast-extension" "git@github.com:bohdanbirdie/cloudstash-raycast.git" "Raycast extension"
sync_repo "readonly-llm-lookup" "git@github.com:bohdanbirdie/readonly-llm-lookup.git" "LLM lookup reference"

echo "Done."
