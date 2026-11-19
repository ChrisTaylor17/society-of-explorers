import { generateLogKey } from "../src/lib/receipt";

if (!process.env.MERIDIAN_SIGNING_PRIVATE_KEY?.trim()) {
  process.env.MERIDIAN_SIGNING_PRIVATE_KEY = generateLogKey().privatePem;
}
if (!process.env.MERIDIAN_RESET_SECRET?.trim()) {
  process.env.MERIDIAN_RESET_SECRET = "test-reset-secret";
}
