import { Linking } from 'react-native';
import { ACCOUNT_DELETION_PATH } from '../../../../lib/account/deletion-contract';
import { approvedOrigin } from '../circles/host';

export async function openAccountDeletionPage(origin: string): Promise<void> {
  // Hand off only the public page. The browser verifies its own sign-in.
  await Linking.openURL(approvedOrigin(origin) + ACCOUNT_DELETION_PATH);
}
