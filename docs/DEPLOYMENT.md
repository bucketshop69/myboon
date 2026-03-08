# Deployment Guide (VPS + Expo Android)

This runbook covers:
- VPS deployment for API + collectors + brain loops
- Android build flow for `apps/hybrid-expo`

## 1. VPS Deployment

### 1.1 Server prerequisites

- Ubuntu 22.04+ (or equivalent Linux)
- Node.js 20+
- `pnpm` installed globally
- `systemd` available
- Repo cloned at `/opt/myboon`

### 1.2 Environment files

Create package-level env files on VPS:

- `/opt/myboon/packages/api/.env`
- `/opt/myboon/packages/collectors/.env`
- `/opt/myboon/packages/brain/.env`

Use examples:
- [`packages/api/.env.example`](/home/main-user/.openclaw/workspace/pnldotfun/packages/api/.env.example)
- [`packages/collectors/.env.example`](/home/main-user/.openclaw/workspace/pnldotfun/packages/collectors/.env.example)
- [`packages/brain/.env.example`](/home/main-user/.openclaw/workspace/pnldotfun/packages/brain/.env.example)

### 1.3 Install systemd services

From repo root on VPS:

```bash
sudo bash infra/vps/install-systemd.sh
sudo systemctl start myboon-api myboon-collectors myboon-analyst myboon-publisher
```

Service units:
- [`infra/vps/systemd/myboon-api.service`](/home/main-user/.openclaw/workspace/pnldotfun/infra/vps/systemd/myboon-api.service)
- [`infra/vps/systemd/myboon-collectors.service`](/home/main-user/.openclaw/workspace/pnldotfun/infra/vps/systemd/myboon-collectors.service)
- [`infra/vps/systemd/myboon-analyst.service`](/home/main-user/.openclaw/workspace/pnldotfun/infra/vps/systemd/myboon-analyst.service)
- [`infra/vps/systemd/myboon-publisher.service`](/home/main-user/.openclaw/workspace/pnldotfun/infra/vps/systemd/myboon-publisher.service)

### 1.4 Deploy update

```bash
bash infra/vps/deploy.sh
```

Script reference:
- [`infra/vps/deploy.sh`](/home/main-user/.openclaw/workspace/pnldotfun/infra/vps/deploy.sh)

### 1.5 Smoke checks

```bash
curl -s http://127.0.0.1:3000/health
pnpm --filter @myboon/api smoke
```

Expected health response:

```json
{"status":"ok"}
```

### 1.6 Useful service commands

```bash
sudo systemctl restart myboon-api
sudo journalctl -u myboon-api -n 200 -f
sudo journalctl -u myboon-collectors -n 200 -f
sudo journalctl -u myboon-analyst -n 200 -f
sudo journalctl -u myboon-publisher -n 200 -f
```

## 2. Expo Android Build

### 2.1 One-time setup

```bash
pnpm install
cd apps/hybrid-expo
npx expo login
npx eas login
```

### 2.2 Required app env

Set in EAS project secrets or build env:

- `EXPO_PUBLIC_API_BASE_URL` (e.g. `https://api.myboon.xyz`)
- `EXPO_PUBLIC_JUP_API_KEY` (if swap preview uses Jupiter APIs)

### 2.3 Build commands

From monorepo root:

```bash
pnpm --filter hybrid-expo android:apk
pnpm --filter hybrid-expo android:dapp-store
pnpm --filter hybrid-expo android:aab
```

Profiles are defined in:
- [`apps/hybrid-expo/eas.json`](/home/main-user/.openclaw/workspace/pnldotfun/apps/hybrid-expo/eas.json)

### 2.3.1 Solana dApp Store target

For Solana dApp Store submissions, use APK profile:

```bash
pnpm --filter hybrid-expo android:dapp-store
```

This maps to the `dapp-store` profile (`buildType: apk`), matching Solana dApp Store requirements.

### 2.3.2 Signing key guidance

- EAS can generate/manage Android keystore on first build.
- Keep the keystore stable across updates (required to ship app upgrades).
- If you also publish to Google Play, keep a separate key strategy for dApp Store as recommended in Solana docs.

### 2.4 Local Android run (optional)

Requires Android SDK + emulator:

```bash
pnpm --filter hybrid-expo android:local
```

### 2.5 Build status and artifacts

```bash
pnpm --filter hybrid-expo android:list-builds
```

## 3. Recommended first production rollout

1. Deploy VPS services and verify `/health`.
2. Verify predict endpoints from mobile network:
   - `/predict/markets`
   - `/predict/sports/epl`
3. Produce Android APK using `preview` profile.
4. Run internal QA (Feed, Predict list/detail, Swap preview).
5. Promote to AAB (`production` profile).
