# 002: Custom Wallet Modal

## Goal

Replace the default wallet adapter modal with a **custom split-view modal** that clearly presents two connection paths: **Passkey (Lazorkit)** on the left and **Traditional Wallets list** on the right.

## Why

1. Default modal buries Lazorkit among other wallets — users miss the "magic"
2. No visual explanation of WHY passkey is different
3. Bounty judges want to SEE the Lazorkit value proposition, not hunt for it in a list
4. Better UX = higher score on "Clarity & Usefulness" (40% of judging)

---

## Critical Thinking & Decisions

### Decision 1: Keep vs Replace home page?

**Considered:** Replace entire home page with connection view when disconnected

**Rejected because:**

- Users lose context of what the app is
- The home page (logo + input) IS the app identity
- Modal is the standard pattern for wallet connection

**Chosen:** Keep home page, show custom modal when wallet icon is clicked

---

### Decision 2: Replace vs Customize default modal?

**Considered:** Override wallet-adapter modal CSS

**Rejected because:**

- Still a list of wallets, can't add split layout
- Can't add explanatory text like "No install needed"
- Fighting the library instead of working with it

**Chosen:** Build completely custom modal, don't use default WalletModalProvider

---

### Decision 3: Split layout - what on each side?

**Chosen:**

- **Left side:** Passkey option with Lazorkit branding and benefits
- **Right side:** List of ALL wallets from wallet adapter (scrollable)

**Why:** Shows passkey as the "recommended" option while still giving power users their familiar wallet list.

---

### Decision 4: What to show when connected?

**Chosen:** In header, replace wallet icon with:

- Wallet icon + truncated address
- Disconnect button (on hover or always visible)

---

## Design

### Home Page (Always Visible)

```
┌─────────────────────────────────────────────────────────┐
│                                             [👛]        │  ← wallet icon (click to open modal)
│                                                         │
│                      MYBOON                          │
│                                                         │
│            [    What's your PnL?    ]                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

When connected, header shows:
```
│                                    [🔗 7xKp...3mNq] [×] │
```

---

### Custom Wallet Modal (On Click)

```
┌─────────────────────────────────────────────────────────────────┐
│                                                              [×]│
│                        Connect Wallet                           │
├────────────────────────────────┬────────────────────────────────┤
│                                │                                │
│      🔐 PASSKEY                │      👛 SELECT WALLET          │
│                                │                                │
│   Powered by Lazorkit          │   ┌────────────────────────┐   │
│                                │   │  🟣 Phantom            │   │
│   Just use your fingerprint    │   ├────────────────────────┤   │
│   to create a wallet.          │   │  🟠 Solflare           │   │
│                                │   ├────────────────────────┤   │
│   ✓ No app to install          │   │  🔵 Backpack           │   │
│   ✓ No seed phrase to save     │   ├────────────────────────┤   │
│   ✓ Ready in 2 seconds         │   │  🟢 Coinbase           │   │
│                                │   ├────────────────────────┤   │
│   ┌──────────────────────┐     │   │  ... (scrollable)      │   │
│   │  Connect with Passkey│     │   └────────────────────────┘   │
│   └──────────────────────┘     │                                │
│                                │                                │
├────────────────────────────────┴────────────────────────────────┤
│   New to Solana? Try Passkey — no app needed.                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Copy & Messaging Guidelines

### Left Side (Passkey)

**Title:** `Passkey`

**Subtitle:** `Powered by Lazorkit`

**Description:** `Just use your fingerprint to create a wallet.`

**Bullets:**

- ✓ No app to install
- ✓ No seed phrase to save
- ✓ Ready in 2 seconds

**Button:** `Connect with Passkey`

---

### Right Side (Wallets)

**Title:** `Select Wallet`

**List:** All wallets from `useWallet().wallets` (exclude Lazorkit since it's on left)

Each wallet item shows:

- Wallet icon
- Wallet name
- Click to connect

---

### Footer

`New to Solana? Try Passkey — no app needed.`

---

## Implementation Steps

### Step 1: Restore original page.tsx

- Logo (MYBOON)
- Input field ("What's your PnL?")
- Wallet button in corner (opens modal)

### Step 2: Create WalletModal component

- Full-screen overlay with centered modal
- Close button (×)
- Split layout: left (passkey) | right (wallet list)
- Click outside to close

### Step 3: Create PasskeySection component

- Left side content
- Benefits list
- "Connect with Passkey" button
- Handles Lazorkit connection

### Step 4: Create WalletList component

- Right side content
- Maps through `wallets` array (exclude Lazorkit)
- Each item clickable → selects and connects that wallet

### Step 5: Create WalletButton component (header)

- When disconnected: wallet icon → opens modal
- When connected: icon + truncated address + disconnect

### Step 6: Manage modal state

- `useState` for modal open/close
- Close on successful connection
- Close on backdrop click or × button

---

## Component Structure

```
src/components/
├── wallet/
│   ├── WalletButton.tsx      # Header button (icon or connected state)
│   ├── WalletModal.tsx       # The modal container
│   ├── PasskeySection.tsx    # Left side of modal
│   ├── WalletList.tsx        # Right side of modal
│   └── WalletListItem.tsx    # Individual wallet in list
```

---

## Styling Notes

- Modal: centered, max-width ~700px, rounded corners
- Backdrop: dark overlay (bg-black/50), click to close
- Split: 50/50 or left slightly narrower
- Left side: bg-surface, highlight the passkey option
- Right side: bg-elevated, scrollable wallet list
- Wallet items: hover state, wallet icon on left

---

## Acceptance Criteria

- [x] Home page shows logo, input, and wallet icon
- [x] Clicking wallet icon opens custom modal
- [x] Modal shows split view: Passkey left, Wallet list right
- [x] Clicking "Connect with Passkey" triggers Lazorkit/passkey prompt
- [x] Clicking any wallet in list connects that wallet
- [x] Modal closes on successful connection
- [x] Modal closes on backdrop click or × button
- [x] When connected, header shows truncated address + disconnect
- [x] Disconnect works
- [x] Responsive: stack on mobile

---

## Implementation Notes

### Deviations from Original Design

1. **Wallet icon position**: Placed below input instead of top-right header (user preference)
2. **Right side background**: Uses `bg-surface` instead of `bg-elevated` (removed bluish tint per feedback)
3. **Lazorkit close event**: SDK limitation - no exposed close event, added Cancel button as fallback

### Technical Decisions Made During Implementation

1. **Dual Wallet Support**: App uses both `LazorkitProvider` and Solana Wallet Adapter
   - Passkey uses Lazorkit's native `useWallet` hook
   - Traditional wallets use Solana Wallet Adapter's `useWallet`
   - `WalletButton` checks both connection states

2. **Modal State Reset**: Modal uses `key` prop that increments on open to force remount and reset state

3. **Lazorkit SDK Limitation**: 
   - `connect()` only accepts `{ feeMode?: 'paymaster' | 'user' }`
   - No `onSuccess/onFail` callbacks exposed in public hook interface
   - `isConnecting` state watcher added as fallback detection

---

## Files Created/Modified

| File                                    | Status    |
| --------------------------------------- | --------- |
| `src/components/wallet/WalletButton.tsx`    | ✅ Created |
| `src/components/wallet/WalletModal.tsx`     | ✅ Created |
| `src/components/wallet/PasskeySection.tsx`  | ✅ Created |
| `src/components/wallet/WalletList.tsx`      | ✅ Created |
| `src/components/wallet/WalletListItem.tsx`  | ✅ Created |
| `src/components/wallet/index.ts`            | ✅ Created |
| `src/app/page.tsx`                          | ✅ Modified |
| `src/providers/WalletProvider.tsx`          | ✅ Modified (added LazorkitProvider) |

---

## References

- [Lazorkit registerLazorkitWallet](https://docs.lazorkit.com/wallet-standard)
- [Wallet Adapter useWallet hook](https://github.com/solana-labs/wallet-adapter)
- Existing design tokens in `globals.css`

