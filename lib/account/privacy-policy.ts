export const PRIVACY_POLICY_PATH = '/privacy';
export const PRIVACY_CONTACT = 'chris@societyofexplorers.com';
export const PRIVACY_POLICY_STATUS = 'Release preview. The retention and deletion details are under review before member access opens.';

export const PRIVACY_POLICY_SECTIONS = [
  {
    title: 'Accounts and devices',
    text: 'We use your sign-in details, account identifier, and session information to verify your account and keep it connected. Supabase provides account sign-in and data storage. Google handles its part of sign-in when you choose Google. A wallet sign-in uses the public wallet address and a signed challenge. The website uses session cookies, and the phone app uses protected device storage for session credentials.',
  },
  {
    title: 'Profiles, reading, and salons',
    text: 'We store what you enter and the actions you take to provide the features you use. This can include profile fields, reading progress and notes, salon membership and attendance, posts, and messages. Your profile starts private. Publishing a profile or a public listing makes the fields shown in its preview visible to visitors. Other members of a salon can see posts you share with that salon.',
  },
  {
    title: 'Reports and AI assistance',
    text: 'Assigned human reviewers use reports and the relevant content to review safety issues. If optional AI moderation is enabled, Anthropic may receive an individual Circle message only after its author has allowed AI review for that message. Reporter notes stay with human review. Authors can change their permission from their posted messages.',
  },
  {
    title: 'AI conversations and transcription',
    text: 'When signed-in Thinker conversations are available, the configured Anthropic integration uses conversation text to generate replies. If you choose OpenAI transcription for a Waddle voice post, OpenAI receives the selected recording to turn it into text. Publishing your recording and transcript is a separate choice.',
  },
  {
    title: 'Hosting and services you choose',
    text: 'Vercel hosts the web app. The app and its hosting services handle connection and request information to deliver pages, protect access, and troubleshoot problems. External meeting or media providers handle the information you share when you open their service. If you choose a paid supporter option, Stripe handles the checkout.',
  },
  {
    title: 'Your choices and account deletion',
    text: 'Use your profile settings to edit your profile or make it private. Use the report and block controls to manage contact in the app. The account deletion page shows whether new requests are open and lets you check an existing request with a private status code. On a phone, open Delete account on the website from your connected account screen. The website checks its own sign-in.',
  },
  {
    title: 'Retention and privacy requests',
    text: 'The release policy will explain the timing for account deletion and which records are retained for safety, operations, legal obligations, or backup recovery. Contact Society of Explorers about access, correction, deletion, or questions about how your data is handled.',
  },
] as const;
