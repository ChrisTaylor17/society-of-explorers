# Native member entry

The existing Circle and MemberCircle TSX screens, verified-provider owner, host and native port adapters have been integrated into this package. `index.ts` registers the member-first `App.tsx`; it does not register the historical synthetic demo.

The authenticated native application composition supplies `App` with `{memberCircle: {origin, circleId, auth, transport}}`. `auth` is its existing verifying Supabase Auth interface and `transport` must reject redirects before forwarding credentials. No client, account, credential, native bridge or global configuration is created here. Unconfigured builds show an honest unavailable state and perform no authentication or private reads.

The existing flat composer remains available after an authorized conversation refresh. Complete archive and thread reads use the current canonical discussion endpoint and parser. Thread reply, report and withdrawal controls still require the member web experience. All private read state clears on identity changes, activity loss, offline signals and closure.

The historical Android project remains available for integration with synthetic application IDs and instrumentation. Its embedded synthetic build uses debug signing for local fixtures; release tasks reject default debug signing and require a reviewed external identity/signing descriptor. Unnecessary permissions and app-data backup were removed from the release policy, but actual binary/signing/backup acceptance remains unverified. There is no generated iOS native project. Expo exports are JavaScript/assets; they are not native binaries or store acceptance. See the [staged toolchain plan](../../docs/integration/native-toolchain-unblock.md).

`node_modules` links the existing native runtime without installing anything. Its offloaded dependencies currently prevent a verified full native typecheck/export. The portable controller types, real TSX server render with explicit React Native primitive doubles, and Quest browser integration are tested separately; those do not establish Hermes, native networking or device behavior.

The transport adapter observes late `begin()` completions after timeout or abort and attempts to cancel each valid allocated handle once, without sending after retirement. Synthetic bridge tests verify that behavior; they do not prove OS-level cancellation or a registered native bridge.
