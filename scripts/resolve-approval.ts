/**
 * Manually resolve a pending approval from the CLI.
 * Usage: tsx scripts/resolve-approval.ts <approval-id> [approve|reject]
 */
import net from 'net';
import path from 'path';
import { DATA_DIR } from '../src/config.js';
import { initDb } from '../src/db/connection.js';
import { getPendingApproval, getSession } from '../src/db/sessions.js';
import { handleApprovalsResponse } from '../src/modules/approvals/response-handler.js';
import '../src/modules/self-mod/index.js'; // register install_packages / add_mcp_server handlers

const approvalId = process.argv[2];
const decision = (process.argv[3] ?? 'approve') as 'approve' | 'reject';

if (!approvalId) {
  console.error('Usage: tsx scripts/resolve-approval.ts <approval-id> [approve|reject]');
  process.exit(1);
}

initDb(path.join(DATA_DIR, 'v2.db'));

const approval = getPendingApproval(approvalId);
if (!approval) {
  console.error(`No pending approval found with id: ${approvalId}`);
  process.exit(1);
}

console.log(`Resolving approval: ${approvalId}`);
console.log(`  action:  ${approval.action}`);
console.log(`  payload: ${approval.payload}`);
console.log(`  decision: ${decision}`);

// cli_command approvals must be handled by the live host process (so launchd
// can restart it on host-restart, etc.). Route through the socket.
if (approval.action === 'cli_command' && decision === 'approve') {
  const payload = JSON.parse(approval.payload) as { frame: { id: string; command: string; args: Record<string, unknown> } };
  const sockPath = path.join(DATA_DIR, 'ncl.sock');
  const req = { ...payload.frame, approval_id: approvalId };

  await new Promise<void>((resolve, reject) => {
    const client = net.createConnection(sockPath);
    let buf = '';
    client.on('connect', () => client.write(JSON.stringify(req) + '\n'));
    client.on('data', (chunk) => {
      buf += chunk.toString();
      if (!buf.includes('\n')) return;
      try {
        const res = JSON.parse(buf.split('\n')[0]);
        if (res.ok) {
          console.log('Result:', JSON.stringify(res.data, null, 2));
        } else {
          console.error('Error:', res.error?.message);
        }
      } catch (_) { /* ignore parse errors */ }
      client.end();
      resolve();
    });
    client.on('error', reject);
    client.on('close', () => resolve());
  }).catch((e) => {
    console.error('Could not reach live host socket:', (e as Error).message);
    console.error('Start NanoClaw first, or approve via WhatsApp.');
    process.exit(1);
  });

  console.log('Done.');
  process.exit(0);
}

await handleApprovalsResponse({
  questionId: approvalId,
  value: decision,
  userId: 'cli:local',
});

console.log('Done.');
process.exit(0);
