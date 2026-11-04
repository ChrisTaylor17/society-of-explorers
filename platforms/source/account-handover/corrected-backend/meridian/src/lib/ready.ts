import { currentStoreKind, getRepository, type Repository, type StoreKind } from "./db";
import { seedIfEmpty } from "./seed";

export async function ready(): Promise<{ repo: Repository; kind: StoreKind }> {
  const repo = await getRepository();
  await seedIfEmpty(repo);
  return { repo, kind: currentStoreKind() };
}
