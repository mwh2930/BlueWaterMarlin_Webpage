#!/bin/zsh
set -e

editor_root="${0:A:h}"
cd "$editor_root"
exec python3 scripts/content_editor.py
