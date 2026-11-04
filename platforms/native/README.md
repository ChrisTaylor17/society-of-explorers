# Native member entry

The existing Circle and MemberCircle TSX screens, verified-provider owner, host and native port adapters have been integrated into this package. `index.ts` registers the member-first `App.tsx`; it does not register the historical synthetic demo.

The authenticated native application composition supplies `App` with `{memberCircle: {origin, circleId, auth, transport}}`. `auth` is its existing verifying Supabase Auth interface and `transport` must reject redirects before forwarding credentials. No client, account, credential, native bridge or global configuration is created here. Unconfigured builds show an honest unavailable state and perform no authentication or private reads.

The existing flat composer remains available after an authorized conversation refresh. Complete archive and thread reads use the current canonical discussion endpoint and parser. Thread reply, report and withdrawal controls still require the member web experience. All private read state clears on identity changes, activity loss, offline signals and closure.

The historical Android project remains available for integration, but retains synthetic application IDs, instrumentation and debug-signing configuration. Its release manifest/signing/backup policy must be reviewed before any binary release. There is no generated iOS native project. Expo exports are JavaScript/assets; they are not native binaries or store acceptance.

`node_modules` links the existing native runtime without installing anything. Its offloaded dependencies currently prevent a verified full native typecheck/export. The portable controller types, real TSX server render with explicit React Native primitive doubles, and Quest browser integration are tested separately; those do not establish Hermes, native networking or device behavior.
