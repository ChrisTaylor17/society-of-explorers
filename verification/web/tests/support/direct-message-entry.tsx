import { createRoot } from 'react-dom/client';
import MembersPage from '@/app/members/page';
import { notifyAuthProviderChanged } from '@/lib/auth/providerSelection';

Object.assign(window, { dmChangeAccount: notifyAuthProviderChanged });

createRoot(document.getElementById('root')!).render(<MembersPage />);
