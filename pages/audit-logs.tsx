import {
  Alert,
  AlertIcon,
  Button,
  Heading,
  HStack,
  Spinner,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
} from '@chakra-ui/react';
import { useCallback, useEffect, useState } from 'react';

import Layout from '../components/Layout';
import ProtectedRoute from '../components/ProtectedRoute';

interface AuditLog {
  id: string;
  createdAt: string;
  actor: { type: string; id: string };
  action: string;
  outcome: string;
  httpStatus: number;
  targetType?: string;
  targetId?: string;
  ipAddress?: string;
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);
  const [previousCursors, setPreviousCursors] = useState<(string | null)[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const loadPage = useCallback(async (beforeId: string | null): Promise<boolean> => {
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (beforeId) params.set('beforeId', beforeId);
      const response = await fetch(`/api/audit-logs?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '감사 로그를 불러오지 못했습니다.');
      setLogs(data.auditLogs);
      setNextCursor(data.nextCursor);
      return true;
    } catch (loadError) {
      setError(String(loadError));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPage(null);
  }, [loadPage]);

  const goToNextPage = async () => {
    if (!nextCursor || isLoading) return;
    if (await loadPage(nextCursor)) {
      setPreviousCursors((cursors) => [...cursors, currentCursor]);
      setCurrentCursor(nextCursor);
    }
  };

  const goToPreviousPage = async () => {
    if (previousCursors.length === 0 || isLoading) return;
    const previousCursor = previousCursors.at(-1) ?? null;
    if (await loadPage(previousCursor)) {
      setPreviousCursors((cursors) => cursors.slice(0, -1));
      setCurrentCursor(previousCursor);
    }
  };

  return (
    <ProtectedRoute>
      <Layout>
        <VStack align="stretch" spacing={6}>
          <Heading size="lg">Audit Logs</Heading>
          {error && (
            <Alert status="error">
              <AlertIcon />
              {error}
            </Alert>
          )}
          {isLoading && logs.length === 0 ? (
            <HStack justify="center" py={10}>
              <Spinner />
            </HStack>
          ) : (
            <Table size="sm">
              <Thead>
                <Tr>
                  <Th>시간</Th>
                  <Th>주체</Th>
                  <Th>액션</Th>
                  <Th>결과</Th>
                  <Th>대상</Th>
                  <Th>IP</Th>
                </Tr>
              </Thead>
              <Tbody>
                {logs.map((log) => (
                  <Tr key={log.id}>
                    <Td>{new Date(log.createdAt).toLocaleString()}</Td>
                    <Td>
                      {log.actor.type}: {log.actor.id}
                    </Td>
                    <Td>{log.action}</Td>
                    <Td>
                      {log.outcome} ({log.httpStatus})
                    </Td>
                    <Td>{log.targetType ? `${log.targetType}:${log.targetId ?? ''}` : '-'}</Td>
                    <Td>{log.ipAddress ?? '-'}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
          <HStack justify="flex-end">
            <Button
              size="sm"
              onClick={goToPreviousPage}
              isDisabled={previousCursors.length === 0 || isLoading}>
              이전
            </Button>
            <Text fontSize="sm">{previousCursors.length + 1}페이지</Text>
            <Button size="sm" onClick={goToNextPage} isDisabled={!nextCursor || isLoading}>
              다음
            </Button>
          </HStack>
        </VStack>
      </Layout>
    </ProtectedRoute>
  );
}
