  When you pick up the preview work, the two jobs in order of value:

  1. Deploy to preview. Needs a funded seed in contract/.env.preview as MIDNIGHT_PREVIEW_SEED=... from the faucet at
  midnight-tmnight-preview.nethermind.dev. The code path is already green against a real network locally, so this is mostly waiting
  on sync. Gets you a live contract address to point at.
  2. Lace wiring. ~150 lines following example-bboard's BrowserDeployedBoardManager, dropping into PreviewProvider which is already
  stubbed with the right shape.

  The three things I'd want you to weigh before starting #2, since they're the ones that could sink it: the proof server stays
  local so a "shareable link" still needs Docker, transactions run ~20s each versus ~800ms for Local proofs, and I can't verify
  Lace's connector version without a browser.

  One loose end unrelated to preview: the admin secret is hardcoded new Uint8Array(32).fill(1) in the bundle. Harmless locally, but
  on a public testnet anyone reading the JS could create trials on our deployed contract. Worth deciding how you want to handle
  that before the deploy rather than after.

