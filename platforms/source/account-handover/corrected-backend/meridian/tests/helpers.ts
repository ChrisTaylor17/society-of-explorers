import { openSqliteRepository, type Repository } from "../src/lib/db";
import { createIdentity, type Result } from "../src/lib/domain";

export async function testRepo(): Promise<Repository> {
  return openSqliteRepository(":memory:");
}

export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export async function makePerson(
  repo: Repository,
  magicName: string,
  interests: string[] = ["Walks"],
  availability: string[] = ["Saturday morning"],
) {
  return unwrap(
    await createIdentity(repo, {
      magicName,
      displayName: `${magicName} person`,
      passcode: "demo-pass",
      interests,
      availability,
      area: "Example hill",
      contactHandle: `relay:${magicName}.demo`,
      bio: "Synthetic test person.",
    }),
  );
}
