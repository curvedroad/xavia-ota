import {
  Alert,
  AlertIcon,
  Heading,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  VStack,
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';

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

  useEffect(() => {
    fetch('/api/audit-logs?limit=200')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '감사 로그를 불러오지 못했습니다.');
        setLogs(data.auditLogs);
      })
      .catch((loadError) => setError(String(loadError)));
  }, []);

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
        </VStack>
      </Layout>
    </ProtectedRoute>
  );
}
