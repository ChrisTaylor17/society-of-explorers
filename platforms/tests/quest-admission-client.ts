// Explicit synthetic SDK adapter for the actual Quest component/browser hook.
export function createClient() {
  return (window as unknown as { questAdmissionQa: { client(): unknown } }).questAdmissionQa.client();
}
