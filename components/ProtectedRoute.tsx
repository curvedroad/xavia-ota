import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

import LoadingSpinner from './LoadingSpinner';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const { status } = useSession();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/').catch(() => undefined);
    }
  }, [router, status]);

  if (status !== 'authenticated') return <LoadingSpinner />;

  return <>{children}</>;
}
