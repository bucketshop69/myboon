# Issue 157 Wallet Switch QA

Manual regression checklist for wallet-scoped Predict state refresh:

1. Connect an MWA Solana wallet, enable Predict, and verify profile/detail balances and picks load.
2. Disconnect from the wallet drawer. Confirm Predict profile/detail screens immediately clear balances, picks, open orders, pending orders, and session prompts without restarting the app.
3. Connect a different MWA wallet. Confirm previous wallet data never flashes and the new wallet's Predict state loads after setup/refetch.
4. Sign in with Privy email/passkey and wait for the embedded wallet. Confirm it uses the same Predict setup path and loads only that wallet's data.
5. Log out/disconnect the Privy wallet, then sign in/connect another wallet. Confirm stale previous-wallet balances/picks/session data are not visible behind the sign-in drawer.
6. While on Predict market and sport detail screens, repeat disconnect/switch during an in-flight refresh. Confirm late responses do not restore old balances, picks, open orders, or pending orders.
