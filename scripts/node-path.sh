# Prepend a local Node.js install so scripts work without pnpm on PATH.
# Sourced by other scripts in this directory. Do not execute.

_atlas_ui_node_dirs=(
    "${HOME}/.local/node/bin"
    "${HOME}/.local/share/fnm/aliases/default/bin"
    "${HOME}/.nvm/current/bin"
)

for _atlas_ui_dir in "${_atlas_ui_node_dirs[@]}"; do
    if [ -x "${_atlas_ui_dir}/node" ]; then
        case ":$PATH:" in
            *":${_atlas_ui_dir}:"*) ;;
            *) PATH="${_atlas_ui_dir}:$PATH" ;;
        esac
        break
    fi
done
unset _atlas_ui_dir _atlas_ui_node_dirs
export PATH

if ! command -v node >/dev/null 2>&1; then
    echo "node not found. Install Node.js 22+ or put it on PATH (e.g. ~/.local/node/bin)." >&2
    return 1 2>/dev/null || exit 1
fi
