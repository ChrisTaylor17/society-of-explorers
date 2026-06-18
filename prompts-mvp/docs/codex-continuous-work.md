# Running This as a Continuous Codex Goal

The desktop Codex app can keep an explicit goal active across automatic continuations. It cannot promise business profit or operate indefinitely outside the app/runtime, but it can preserve the goal, plan, files, and verification state while continuing through long implementation sessions.

## Start or Resume

Use one goal prompt with a concrete terminal condition:

```text
/goal Continue Prompt Atlas in /prompts-mvp. Preserve every existing root change. Read the active plan, pick the highest-value incomplete item, implement it, test it in the browser, and update the plan. Do not deploy production or change DNS unless preview checks pass.
```

Useful continuation prompts:

```text
Continue the active Prompt Atlas goal. Inspect current git status and the plan first, then complete the next pending slice with tests.
```

```text
Continue UI polish against docs/design/*.png. Check desktop and mobile, record concrete mismatches, fix them, and rebuild.
```

```text
Continue production readiness. Run schema/API/privacy/payment failure-path checks, fix findings, and update the deployment runbook.
```

```text
Continue growth work. Use real aggregate product signals only; propose and implement one ethical conversion improvement without weakening privacy or member agency.
```

## Monitor Progress

- Keep the goal thread open in Codex desktop; interim updates show the current slice and blockers.
- Ask `status` at any time. Codex should report completed work, the active plan item, verification results, and blockers, then continue unless told to pause.
- Use the shared terminal to watch `npm run dev`, builds, or test output.
- Review `git status --short prompts-mvp` to see only the isolated product changes.
- Preview deployments and Vercel logs are the production progress signal; local screenshots alone are not enough.

For a 12-hour shift, leave the machine awake, network connected, and the Codex desktop thread active. Credentials should be installed in Supabase, Stripe, Anthropic/Vercel AI Gateway, and Vercel environment settings, never pasted into chat or committed to Git.

