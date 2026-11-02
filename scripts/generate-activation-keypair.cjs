// One-time setup: generates the Ed25519 keypair used by the activation code
// system (see context/plan.md Phase 23). Run manually, once, by the developer
// only — never invoked by the app itself.
//
//   npm run generate-activation-keypair
//
// The private key is written to scripts/keys/activation-private-key.pem
// (gitignored) and used by generate-activation-code.cjs to sign codes for
// customer machines. The public key is printed to stdout — paste it into
// src/shared/activationPublicKey.ts (safe to commit: it can verify codes but
// never forge new ones).
//
// Losing the private key means you can never issue new activation codes
// again — back it up somewhere safe outside this repo. Re-running this
// script after a key already exists refuses to overwrite it, since doing so
// would invalidate every code already issued.

const { generateKeyPairSync } = require('crypto')
const { writeFileSync, mkdirSync, existsSync } = require('fs')
const { join } = require('path')

const keysDir = join(__dirname, 'keys')
const privateKeyPath = join(keysDir, 'activation-private-key.pem')

if (existsSync(privateKeyPath)) {
  console.error(
    `A private key already exists at ${privateKeyPath} — refusing to overwrite it.\n` +
      'Generating a new keypair would invalidate every activation code already issued.'
  )
  process.exit(1)
}

const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
})

mkdirSync(keysDir, { recursive: true })
writeFileSync(privateKeyPath, privateKey)

console.log(`Private key written to ${privateKeyPath} (gitignored).`)
console.log('Back it up somewhere safe — losing it means you can never issue activation codes again.\n')
console.log('Paste this into src/shared/activationPublicKey.ts as ACTIVATION_PUBLIC_KEY_PEM:\n')
console.log(publicKey)
