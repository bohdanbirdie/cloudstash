# Convert project to monorepo

Moved to monorepo structure with separate packages for main app and Raycast extension. Landing page planned as potential third project.

Used bun workspaces. Main app stays at root, Raycast extension at `local/raycast-extension/` (separate repo clone). Shared tsconfig base and lint config.
