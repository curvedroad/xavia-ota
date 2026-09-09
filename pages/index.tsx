import { Box, Button, Heading, Text, VStack } from '@chakra-ui/react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

import LoadingSpinner from '../components/LoadingSpinner';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/dashboard').catch(() => undefined);
    }
  }, [router, status]);

  if (status === 'loading' || session) return <LoadingSpinner />;

  const authError = typeof router.query.error === 'string' ? router.query.error : null;

  return (
    <Box display="flex" minHeight="100vh" alignItems="center" justifyContent="center" px={6}>
      <VStack spacing={6} maxWidth="420px" textAlign="center">
        <Heading size="lg">Newsboy OTA Console</Heading>
        <Text color="gray.600">승인된 CurvedRoad Google 계정으로 로그인하세요.</Text>
        {authError && <Text color="red.500">로그인이 허용되지 않았습니다.</Text>}
        <Button
          colorScheme="blue"
          width="full"
          onClick={() => signIn('google', { callbackUrl: '/dashboard' })}>
          Google로 로그인
        </Button>
      </VStack>
    </Box>
  );
}
