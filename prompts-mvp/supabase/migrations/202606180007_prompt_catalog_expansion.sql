-- Prompt Atlas catalog expansion: high-intent revenue, privacy, and community prompts.
-- These prompts are public discovery assets and do not include member-specific data.

insert into public.prompts
  (id, slug, title, description, category, prompt_text, tags, is_featured, published_at)
values
  ('10000000-0000-4000-8000-000000000026', 'price-this-offer-without-apology', 'Price this offer without apology', 'Name the value, cost, risk, and fair exchange behind a paid offer.', 'create', 'Help me price this offer without shrinking from the value or inflating the promise. Identify the customer, costly problem, measurable outcome, delivery effort, support burden, alternatives, risk reversal, and three price tests I can run ethically.', array['pricing','revenue'], true, now()),
  ('10000000-0000-4000-8000-000000000027', 'find-my-first-ten-customers', 'Find my first ten customers', 'Turn a vague audience into ten real conversations and one paid test.', 'create', 'Help me find the first ten likely customers for this offer. Define the specific buyer, where they already gather, what pain signal to look for, a respectful outreach message, and how to convert conversations into one paid validation step.', array['customers','validation'], true, now()),
  ('10000000-0000-4000-8000-000000000028', 'write-a-landing-page-that-earns-trust', 'Write a landing page that earns trust', 'Explain the offer clearly enough that the right person can say yes.', 'create', 'Turn my offer notes into a landing page that earns trust. Include the audience, problem, promised outcome, proof, process, pricing expectation, objections, privacy promise, and one direct call to action without hype.', array['landing-page','trust'], true, now()),
  ('10000000-0000-4000-8000-000000000029', 'turn-community-energy-into-a-paid-ritual', 'Turn community energy into a paid ritual', 'Create a recurring paid experience that gives members real value.', 'create', 'Help me design a paid community ritual around real member value. Define who it is for, the transformation, cadence, host role, member contribution, privacy expectations, price, free preview, and renewal reason.', array['community','revenue'], false, now()),
  ('10000000-0000-4000-8000-000000000030', 'decide-what-to-make-free', 'Decide what to make free', 'Balance generosity, sustainability, and member agency.', 'think', 'Help me decide what should be free, paid, or member-only. Separate trust-building public value from labor-intensive support, ongoing access, scarce attention, and outcomes that should fund the commons.', array['pricing','generosity'], false, now()),
  ('10000000-0000-4000-8000-000000000031', 'design-a-privacy-first-data-bargain', 'Design a privacy-first data bargain', 'Make the value exchange around data clear, optional, and useful.', 'work', 'Design a privacy-first data bargain for this product. State what data is needed, what value the member receives, what stays local or encrypted, what is never collected, how consent can change, and how the community benefits.', array['privacy','trust'], true, now()),
  ('10000000-0000-4000-8000-000000000032', 'recover-a-churn-risk-member', 'Recover a churn-risk member', 'Respond to disengagement with respect instead of pressure.', 'work', 'Help me design a respectful recovery path for a member who may churn. Identify likely causes, value gaps, support actions, a no-pressure message, a useful save offer, and when to let them leave gracefully.', array['retention','support'], false, now()),
  ('10000000-0000-4000-8000-000000000033', 'choose-the-right-paid-tier', 'Choose the right paid tier', 'Package access around outcomes, cost, and fairness.', 'think', 'Help me choose a paid tier for this product. Compare usage limits, support burden, member outcomes, provider cost, perceived fairness, community contribution, upgrade triggers, and a simple launch experiment.', array['pricing','product'], false, now())
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  prompt_text = excluded.prompt_text,
  tags = excluded.tags,
  is_featured = excluded.is_featured,
  published_at = excluded.published_at;
