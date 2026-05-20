/**
 * One-shot VAPID keypair generator. Prints public + private keys to
 * stdout so the editor can drop them into Vercel env vars (or .env.local).
 *
 *   npm run push:keys
 *
 * Keys are paired and irreplaceable once subscribers are recorded —
 * rotating them invalidates every existing PushSubscription. Save
 * them once, share via the team secrets store.
 */
import webpush from "web-push";

function main() {
  const keys = webpush.generateVAPIDKeys();
  console.log("\n  VAPID keypair — store these as Vercel env vars.\n");
  console.log(`  VAPID_PUBLIC_KEY=${keys.publicKey}`);
  console.log(`  VAPID_PRIVATE_KEY=${keys.privateKey}`);
  console.log(`  VAPID_SUBJECT=mailto:hello@frederickradius.app   # any mailto: or https: URL\n`);
  console.log("  Set them in Vercel project settings → Environment Variables, then redeploy.\n");
}

main();
