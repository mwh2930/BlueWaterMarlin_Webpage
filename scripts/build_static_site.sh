#!/usr/bin/env bash
# Build the exact public artifact deployed to Azure Static Web Apps.
set -euo pipefail

repository_root="$(cd "$(dirname "$0")/.." && pwd)"
requested_destination="${1:-.azure-dist}"
case "$requested_destination" in
  .azure-dist|"$repository_root/.azure-dist") ;;
  *)
    echo "Destination must be the repository .azure-dist directory." >&2
    exit 64
    ;;
esac
destination="$repository_root/.azure-dist"

if find "$repository_root/assets" "$repository_root/data" \
  "$repository_root/privacy" "$repository_root/support" -type l | grep -q .; then
  echo "Symbolic links are not permitted in the Azure artifact inputs." >&2
  exit 1
fi

if [ -e "$destination" ]; then
  rm -rf -- "$destination"
fi
mkdir -p "$destination"

cp "$repository_root/index.html" "$repository_root/404.html" \
  "$repository_root/support.html" "$repository_root/support.js" \
  "$repository_root/staticwebapp.config.json" "$destination/"
cp -R "$repository_root/assets" "$repository_root/data" \
  "$repository_root/privacy" "$repository_root/support" "$destination/"

test -s "$destination/index.html"
test -s "$destination/privacy/index.html"
test -s "$destination/support/index.html"
if find "$destination" -type l | grep -q .; then
  echo "Symbolic links entered the Azure artifact." >&2
  exit 1
fi
if find "$destination" -type f \( -name '*.md' -o -name '*.zip' -o -name '*.py' \) \
  | grep -q .; then
  echo "Private source or archive content entered the Azure artifact." >&2
  exit 1
fi

printf 'Built Azure artifact: %s files\n' \
  "$(find "$destination" -type f | wc -l | tr -d ' ')"
