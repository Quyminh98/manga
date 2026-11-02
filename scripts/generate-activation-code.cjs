// Day-to-day activation code generator (see context/plan.md Phase 23). Run
// manually by the developer for each customer machine — never invoked by the
// app itself.
//
//   npm run generate-activation-code -- --machine-id <id>
//
// <id> is the Machine ID the customer copies from the app's Activation
// Required screen and sends to the developer out-of-band. The resulting
// code (printed to stdout) is sent back to the customer to paste into the
// app — it will only verify successfully on the exact machine that produced
// that Machine ID (see ActivationService.getStatus/activate).

const { sign, createPrivateKey } = require('crypto')
const { readFileSync, existsSync } = require('fs')
const { join } = require('path')

const flagIndex = process.argv.indexOf('--machine-id')
const machineId = flagIndex !== -1 ? process.argv[flagIndex + 1] : null

if (!machineId) {
  console.error('Usage: npm run generate-activation-code -- --machine-id <id>')
  process.exit(1)
}

const privateKeyPath = join(__dirname, 'keys', 'activation-private-key.pem')
if (!existsSync(privateKeyPath)) {
  console.error(`No private key found at ${privateKeyPath}.`)
  console.error('Run "npm run generate-activation-keypair" first.')
  process.exit(1)
}

const privateKey = createPrivateKey(readFileSync(privateKeyPath))
// Ed25519 hashes internally — the algorithm argument to sign() must be null.
const signature = sign(null, Buffer.from(machineId, 'utf8'), privateKey)
const code = `SP1-${signature.toString('base64url')}`

console.log(code)
