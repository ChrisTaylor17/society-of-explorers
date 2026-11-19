import { ErrorNote } from "@/components/Shell";
import { LivePermissions } from "@/components/LivePermissions";
import { agentPreview, listAgents, listPermissionViews } from "@/lib/domain";
import { requirePerson } from "@/lib/session";

export const metadata = { title: "Permissions" };

export default async function PermissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { repo, person } = await requirePerson();
  const { error } = await searchParams;
  const [permissions, agents] = await Promise.all([
    listPermissionViews(repo, person.id),
    listAgents(repo, person.id),
  ]);
  const previews = (
    await Promise.all(agents.map((agent) => agentPreview(repo, person.id, agent.id)))
  ).filter((item) => item !== null);
  return (
    <>
      <p className="eyebrow">Access</p>
      <h1>Who can see what.</h1>
      <p className="lede">Each row is a grant you made. Revoke takes effect on the next read. The other window hides the relay within seconds. Revoking stops future sharing; it can't erase what was already seen.</p>
      <ErrorNote error={error} />
      <LivePermissions initial={{ permissions, agents: previews }} />
    </>
  );
}
