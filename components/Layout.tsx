import { Box, Flex, VStack, Button, FlexProps } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { FaSignOutAlt, FaTachometerAlt, FaTags } from 'react-icons/fa';
import { FaClockRotateLeft, FaKey } from 'react-icons/fa6';
import Image from 'next/image';
import { signOut, useSession } from 'next-auth/react';

export default function Layout({ children, ...props }: { children: React.ReactNode } & FlexProps) {
  const router = useRouter();
  const { data: session } = useSession();

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: <FaTachometerAlt fontSize="1.25rem" /> },
    { name: 'Releases', path: '/releases', icon: <FaTags fontSize="1.25rem" /> },
    { name: 'API Keys', path: '/api-keys', icon: <FaKey fontSize="1.25rem" /> },
    { name: 'Audit Logs', path: '/audit-logs', icon: <FaClockRotateLeft fontSize="1.25rem" /> },
  ];

  const handleLogout = async () => {
    await signOut({ callbackUrl: '/' });
  };

  return (
    <Box className="w-full" height="100vh" {...props}>
      <Box
        w="full"
        p={4}
        className=" text-white h-[6rem] border-b-gray-200 border-b-2"
        display="flex"
        alignItems="center"
        justifyContent="center"
        position="relative">
        <Box>
          <Image
            src="/xavia_logo.png"
            width={200}
            height={200}
            style={{ objectFit: 'contain' }}
            alt="Xavia Logo"
          />
        </Box>
      </Box>
      <Flex className="h-[calc(100vh-6rem)] ">
        <Box
          w="250px"
          p={4}
          className="h-full border-r-gray-200 border-r-2"
          display="flex"
          flexDirection="column"
          justifyContent="space-between">
          <VStack spacing={4} align="stretch">
            {navItems.map((item) => (
              <Button
                key={item.path}
                variant={router.pathname === item.path ? 'solid' : 'ghost'}
                colorScheme={router.pathname === item.path ? 'primary' : 'gray'}
                rightIcon={item.icon}
                onClick={() => router.push(item.path)}
                justifyContent="space-between">
                <Box flex="1" textAlign="left">
                  {item.name}
                </Box>
              </Button>
            ))}
          </VStack>
          <VStack spacing={2} align="stretch">
            <Box fontSize="xs" color="gray.500" overflowWrap="anywhere">
              {session?.user?.email}
            </Box>
            <Button
              variant="outline"
              colorScheme="red"
              onClick={handleLogout}
              rightIcon={<FaSignOutAlt />}>
              Logout
            </Button>
          </VStack>
        </Box>
        <Box flex={1} p={8}>
          {children}
        </Box>
      </Flex>
    </Box>
  );
}
