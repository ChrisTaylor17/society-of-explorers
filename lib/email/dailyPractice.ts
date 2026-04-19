export function renderDailyPracticeEmail(params: {
  thinkerName: string;
  questionText: string;
  unsubscribeToken: string;
  displayName: string;
}): { subject: string; html: string } {
  const { thinkerName, questionText, unsubscribeToken } = params;
  const subject = `${thinkerName} asks:`;
  const unsubscribeUrl = `https://societyofexplorers.com/unsubscribe?token=${unsubscribeToken}`;
  const html = `
    <div style="max-width:520px;margin:0 auto;font-family:Georgia,serif;color:#f5f0e8;background:#0a0a0a;padding:2.5rem 2rem;">
      <div style="text-align:center;margin-bottom:2rem;">
        <span style="font-family:Georgia,serif;font-size:10px;letter-spacing:0.4em;color:#c9a84c;">TODAY</span>
      </div>
      <p style="font-size:14px;color:#9a8f7a;margin-bottom:0.75rem;text-align:center;">
        Posed by <strong style="color:#c9a84c;font-weight:normal;">${thinkerName}</strong>
      </p>
      <p style="font-size:22px;font-style:italic;color:#f5f0e8;line-height:1.5;margin:0 0 2rem 0;text-align:center;">
        &ldquo;${questionText}&rdquo;
      </p>
      <div style="text-align:center;margin-bottom:2.5rem;">
        <a href="https://societyofexplorers.com/practice" style="display:inline-block;padding:14px 32px;background:#c9a84c;color:#0a0a0a;text-decoration:none;font-family:Georgia,serif;font-size:11px;letter-spacing:0.2em;">
          RESPOND TODAY &rarr;
        </a>
      </div>
      <p style="font-size:13px;color:#9a8f7a;font-style:italic;text-align:center;margin:0 0 2rem 0;">
        Two hundred and eighty characters. A whole day&apos;s attention.
      </p>
      <div style="text-align:center;border-top:1px solid rgba(201,168,76,0.08);padding-top:1rem;">
        <span style="font-size:10px;letter-spacing:0.2em;color:rgba(201,168,76,0.4);">SOCIETY OF EXPLORERS</span>
        <br/>
        <a href="${unsubscribeUrl}" style="font-size:11px;color:rgba(154,143,122,0.5);text-decoration:underline;">Unsubscribe</a>
      </div>
    </div>
  `;
  return { subject, html };
}
