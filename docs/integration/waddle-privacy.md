# Waddle recording and publication

The November 6 hosted catalog showed anonymous and signed-in read, write and truncate privileges on `public.waddles`, with row security disabled. The `waddles` Storage bucket is public and also received older Twiddle audio. The inspection used permissions and bucket settings only. [Supabase bucket access](https://supabase.com/docs/guides/storage/buckets/fundamentals)

The [local database draft](../sql/waddle-data-containment-apply.sql) enables row security and revokes browser table and column access. It keeps the records and the app server’s permissions, including the member’s own Waddle count. It adds a nullable publication-consent timestamp without backfilling the old rows. Unknown dependencies stop the draft. The isolated rehearsal reproduced the original read and edit access, refused 12 browser operations after applying the draft, and preserved all fixture records through a second restore.

The feed requires both the public flag and recorded publication consent. The earlier Save to archive action set the public flag, so those records stay preserved and need fresh consent to appear in the feed. The response contains six fields and omits the member and token fields. The `audio_url` field now carries an app address. The server stores an object key for new uploads and recognizes both historical WebM filenames in the configured project when the object belongs to the author of the row.

When recording stops, the browser shows local playback. The member chooses whether to send the recording to OpenAI for transcription. They then see a separate publication action that says the recording and transcript will be public. The server requires that explicit choice and the account shown at review time before uploading a WebM file or writing a consented public record. A failure stays visible without showing a success state.

The route rehearsal used the installed Supabase client and a disposable PostgreSQL database with a simulated Storage transport. The built Chromium test used a synthetic microphone, account, and provider. It checked that recording alone sends neither request, that each action uses the expected fields, and that refusal and retry render correctly. [Verification](waddle-privacy-verification.json)

## Audio playback

The app checks the publication flag and consent on each playback request. It accepts only the author's WebM path. A successful response streams full audio or one verified byte range from private Storage and disallows caching. HEAD checks the same row and object metadata. A public or unexpected bucket stops playback and new audio uploads. Text-only publication still uses the same account and consent checks. [Local playback verification](waddle-private-audio-verification.json)

An upload precedes the publication write. If that write fails, an unreferenced object may remain in private Storage. Review uncertain writes before retrying or removing an object. The rehearsal used a synthetic Storage transport. Restoring the database preserved the references and consent, while an independent media backup is required to restore the bytes.

## Hosted cutover

The hosted table, public bucket, and older reachable builds remain release gates. Direct requests for previously public URLs can bypass the application while the bucket is public. Before the approved cutover, preserve the database and media separately, verify restores, and confirm ownership and disposition for the legacy Waddle and Twiddle objects. Protect old write routes. Use the supported Storage operation to make the bucket private and verify that anonymous and signed-in browser roles cannot read known fixture objects directly. After the database access draft and replacement app are in place, verify the same fixture through the app, then withdraw consent and check that the next request is refused. Member deletion also needs a reviewed disposition for each row, audio object and known copy. [Supabase Storage access](https://supabase.com/docs/guides/storage/security/access-control)
