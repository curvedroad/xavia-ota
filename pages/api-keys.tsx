import {
  Alert,
  AlertIcon,
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useDisclosure,
  VStack,
} from '@chakra-ui/react';
import { useCallback, useEffect, useState } from 'react';

import Layout from '../components/Layout';
import ProtectedRoute from '../components/ProtectedRoute';

interface ApiKeySummary {
  id: string;
  name: string;
  keyPrefix: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

interface IssuedApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  token: string;
  expiresAt: string;
}

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKeySummary[]>([]);
  const [name, setName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(90);
  const [issued, setIssued] = useState<IssuedApiKey | null>(null);
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const loadApiKeys = useCallback(async () => {
    const response = await fetch('/api/api-keys');
    if (!response.ok) throw new Error('API 키 목록을 불러 주세요.');
    const data = await response.json();
    setApiKeys(data.apiKeys);
  }, []);

  useEffect(() => {
    loadApiKeys().catch((loadError) => setError(String(loadError)));
  }, [loadApiKeys]);

  const create = async () => {
    setError('');
    setIssued(null);
    setIsCreating(true);
    try {
      const response = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), expiresInDays }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'API 키 발급에 실패했습니다.');
        return;
      }
      setIssued(data.apiKey);
      setName('');
      setExpiresInDays(90);
      onClose();
      await loadApiKeys();
    } catch (createError) {
      setError(String(createError));
    } finally {
      setIsCreating(false);
    }
  };

  const openCreateModal = () => {
    setName('');
    setExpiresInDays(90);
    setError('');
    onOpen();
  };

  const revoke = async (id: string) => {
    if (!window.confirm('이 API 키를 폐기할까요? 폐기 후에는 다시 사용할 수 없습니다.')) return;
    const response = await fetch(`/api/api-keys/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!response.ok) {
      const data = await response.json();
      setError(data.error || 'API 키 폐기에 실패했습니다.');
      return;
    }
    await loadApiKeys();
  };

  return (
    <ProtectedRoute>
      <Layout>
        <VStack align="stretch" spacing={6}>
          <HStack justify="space-between" align="center">
            <Heading size="lg">Upload API Keys</Heading>
            <Button colorScheme="blue" onClick={openCreateModal}>
              API 키 발급
            </Button>
          </HStack>

          {issued && (
            <Alert status="warning" alignItems="start">
              <AlertIcon />
              <Box width="full">
                <Text fontWeight="bold">이 키는 지금 한 번만 표시됩니다.</Text>
                <Text fontFamily="mono" overflowWrap="anywhere" my={2}>
                  {issued.token}
                </Text>
                <Button size="sm" onClick={() => navigator.clipboard.writeText(issued.token)}>
                  복사
                </Button>
              </Box>
            </Alert>
          )}
          {error && !isOpen && (
            <Alert status="error">
              <AlertIcon />
              {error}
            </Alert>
          )}

          <Table size="sm">
            <Thead>
              <Tr>
                <Th>이름</Th>
                <Th>Prefix</Th>
                <Th>발급자</Th>
                <Th>만료</Th>
                <Th>마지막 사용</Th>
                <Th>상태</Th>
                <Th />
              </Tr>
            </Thead>
            <Tbody>
              {apiKeys.map((apiKey) => {
                const expired = new Date(apiKey.expiresAt).getTime() <= Date.now();
                const status = apiKey.revokedAt ? '폐기됨' : expired ? '만료됨' : '활성';
                return (
                  <Tr key={apiKey.id}>
                    <Td>{apiKey.name}</Td>
                    <Td fontFamily="mono">{apiKey.keyPrefix}</Td>
                    <Td>{apiKey.createdBy}</Td>
                    <Td>{new Date(apiKey.expiresAt).toLocaleString()}</Td>
                    <Td>
                      {apiKey.lastUsedAt ? new Date(apiKey.lastUsedAt).toLocaleString() : '-'}
                    </Td>
                    <Td>{status}</Td>
                    <Td>
                      <Button
                        size="xs"
                        colorScheme="red"
                        isDisabled={!!apiKey.revokedAt}
                        onClick={() => revoke(apiKey.id)}>
                        폐기
                      </Button>
                    </Td>
                  </Tr>
                );
              })}
            </Tbody>
          </Table>

          <Modal
            isOpen={isOpen}
            onClose={onClose}
            isCentered
            closeOnEsc={!isCreating}
            closeOnOverlayClick={!isCreating}>
            <ModalOverlay />
            <ModalContent>
              <ModalHeader>Upload API 키 발급</ModalHeader>
              <ModalCloseButton isDisabled={isCreating} />
              <ModalBody>
                <VStack align="stretch" spacing={4}>
                  <FormControl isRequired>
                    <FormLabel>키 이름</FormLabel>
                    <Input
                      value={name}
                      maxLength={100}
                      placeholder="예: newsboy-front-local"
                      onChange={(event) => setName(event.target.value)}
                    />
                  </FormControl>
                  <FormControl isRequired>
                    <FormLabel>유효 기간</FormLabel>
                    <Select
                      value={expiresInDays}
                      onChange={(event) => setExpiresInDays(Number(event.target.value))}>
                      <option value={30}>30일</option>
                      <option value={90}>90일</option>
                      <option value={180}>180일</option>
                    </Select>
                  </FormControl>
                  {error && (
                    <Alert status="error">
                      <AlertIcon />
                      {error}
                    </Alert>
                  )}
                </VStack>
              </ModalBody>
              <ModalFooter>
                <Button mr={3} onClick={onClose} isDisabled={isCreating}>
                  취소
                </Button>
                <Button
                  colorScheme="blue"
                  onClick={create}
                  isDisabled={!name.trim()}
                  isLoading={isCreating}>
                  발급
                </Button>
              </ModalFooter>
            </ModalContent>
          </Modal>
        </VStack>
      </Layout>
    </ProtectedRoute>
  );
}
