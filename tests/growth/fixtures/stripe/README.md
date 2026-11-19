# Stripe-shaped webhook fixtures

Hand-built to match the Stripe API objects for `apiVersion 2026-03-25.dahlia`
(event envelope, Checkout Session, line item list, Subscription, Customer).
They are not captured from a live account: there are no live keys anywhere in
these tests. All ids are fake `*_test_*` / `*_fixture*` values, `livemode` is
false, and emails use the reserved `example.test` domain.

Tests sign each payload with the real `stripe` library signature helper and a
fixture webhook secret, so the route's real signature verification runs.
