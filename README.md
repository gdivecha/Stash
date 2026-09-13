# Stash - Encrypted Zero-Knowledge Development State Sync

Stash is an encrypted, zero-knowledge development state and extension-syncing utility. Built as a high-performance developer tool, Stash provides a secure backend vault and a command-line interface (CLI) to push, pull, manage, and delete local development configurations, VS Code extensions, and workspace sessions.

Designed around defensive system engineering, Stash guarantees that developer state remains confidential, portable, and cryptographically verified.

---

## Executive Overview

* **Zero-Knowledge Privacy**: Payload encryption occurs entirely on the client before network transmission; the server operates purely as a blind storage engine.
* **Deterministic REST Architecture**: State routes strictly utilize path-based parameters (`/:type/:workspace`) rather than unstructured query strings.
* **Boundary Validation**: Custom Zod middleware interceptors validate and sanitize parameters against strict regular expressions prior to controller execution.
* **CLI Ergonomics**: Built on `commander` with positional parameter enforcement, fallback defaults, and ANSI-formatted help output.

---

## Security Architecture & Theoretical Principles

Stash is engineered around defensive programming, strict state isolation, and zero-trust data handling across every tier of the stack.

### 1. Zero-Knowledge Client-Side Encryption

Stash enforces a strict zero-knowledge model. Development state configurations and extension metadata are encrypted locally on the host machine prior to network egress. The backend vault functions strictly as an encrypted key-value datastore with zero access to decryption keys or unencrypted payloads. In the event of a complete server-side breach, raw user configurations remain secure.

### 2. RESTful Path-Based Resource Isolation

The API transitions state operations from loose query parameters (`?type=...&workspace=...`) to deterministic REST path parameters (`/:type/:workspace`). Resource targeting is locked directly into explicit URL paths, creating a deterministic authorization boundary that isolates storage nodes and prevents cross-workspace state leakage.

### 3. Defensive Input Validation via Zod Middleware

Custom Zod schema interceptors (`vaultParamSchema`, `vaultDeleteParamSchema`) act as strict boundary gatekeepers at the API layer. Incoming requests are sanitized and validated against rigid type constraints and regular expressions before reaching core business logic.

### 4. Mitigation of Path Traversal & HTTP Parameter Pollution (HPP)

* **Path Traversal Defenses**: Enforced regex pattern matching on path parameters prevents traversal sequences (such as `../` or `%2e%2e/`) from escaping the intended database context.
* **Parameter Pollution Prevention**: By eliminating query strings in favor of explicit path routing, the API removes vulnerability vectors associated with duplicate key injections and parameter overrides.

### 5. Stateless Token-Based Authentication

Vault endpoints enforce access control via cryptographically signed JWT session tokens delivered through HTTP-only cookie headers (`Cookie: token=...`). The CLI dynamically resolves session credentials via `resolveSessionToken()` and issues requests with `withCredentials: true`, ensuring every read, write, or delete operation is authenticated.

### 6. CLI Argument Integrity & Destructive Fail-Safes

* **Positional Argument Enforcements**: The CLI enforces positional argument ordering to prevent parameter misalignment during terminal execution.
* **Destructive Command Guardrails**: The `delete` command explicitly requires a target workspace name and restricts operational scope to authorized payload types (defaulting safely to `workspace_session`), preventing accidental broad-spectrum data removal.

---

## System Design & Architecture Best Practices

* **Explicit URI Versioning**: API endpoints are prefixed with version identifiers (`/api/v1/`) to isolate breaking changes, ensuring legacy CLI installations remain operational as the backend evolves.
* **Resource-Centric Pathing**: All operations map cleanly to HTTP semantics (`GET`, `POST`, `DELETE`) over structured path hierarchies (`/api/v1/vault/delete/:type/:workspace`).
* **Runtime Schema Interceptors**: Middleware layers intercept malformed requests at the network edge, returning standardized HTTP `400 Bad Request` responses before allocating application runtime memory.
* **Ergonomic CLI Design & Fallbacks**: Positional CLI parameters incorporate intelligent defaults (e.g., defaulting to `declarative_state` for pulls and `workspace_session` for deletions), reducing operational friction without sacrificing argument precision.

---

## API Specification & Endpoints

All vault endpoints reside under the `/api/v1/vault` router and require a valid session cookie.

| Operation | Method | Endpoint | Description |
| --- | --- | --- | --- |
| **Push State** | `POST` | `/api/v1/vault/push/:type/:workspace` | Receives client-encrypted payloads and writes them to the specified resource path. Overwrites existing state for the targeted node. |
| **Pull State** | `GET` | `/api/v1/vault/pull/:type/:workspace` | Retrieves an encrypted snapshot matching the specified parameters for client-side decryption. |
| **Delete Session** | `DELETE` | `/api/v1/vault/delete/:type/:workspace` | Removes a specific workspace session snapshot from the database. |
| **Vault Summary** | `GET` | `/api/v1/vault/summary` | Returns lightweight metadata metrics (node counts, payload sizes, modified dates) across active vault stores without exposing payload content. |

---

## CLI Command Guide

Stash provides a command-line interface with color-coded ANSI outputs and explicit argument prompts.

### `stash push`

Scans local configurations (such as VS Code extension lists), encrypts the payload locally using your key, and uploads the resulting ciphertext to the remote vault.

```bash
stash push

```

### `stash pull [type] [workspace]`

Retrieves and decrypts a target snapshot into your local environment.

* `[type]` *(Optional)*: Payload type to retrieve. Defaults to `declarative_state`.
* `[workspace]` *(Optional)*: Target workspace identifier. Defaults to `default`.

```bash
# Pull default state
stash pull

# Pull specific workspace state
stash pull declarative_state project-alpha

```

### `stash delete <workspace> [type]`

Removes a specific workspace snapshot from the vault store.

* `<workspace>` *(Required)*: Name of the target workspace to delete.
* `[type]` *(Optional)*: Payload type target. Defaults to `workspace_session`.

```bash
# Deletes 'legacy-app' workspace using default 'workspace_session' type
stash delete legacy-app

```

### `stash summary`

Displays storage usage metrics, active workspace names, and snapshot metadata across your vault.

```bash
stash summary

```

### `stash help`

Outputs the interactive instruction manual and parameter reference guide.

```bash
stash help

```

---

## Installation & Setup

### 1. Repository Setup

```bash
# Clone repository and install dependencies
git clone https://github.com/your-username/stash.git
cd stash
npm install

```

### 2. Environment Configuration

Create a `.env` file in the project root:

```env
PORT=5000
API_BASE_URL=http://localhost:5000/api/v1/vault
DB_CONNECTION_STRING=your_database_connection_uri
JWT_SECRET=your_jwt_signing_key

```

### 3. Global CLI Symlink

Link the CLI executable globally across your system:

```bash
cd client
npm link

```

*Note: Ensure `client/cli.js` includes the shebang directive `#!/usr/bin/env node` as the absolute first line of the file.*