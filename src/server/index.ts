import { config } from '../config/index.ts';
import { StudioLiveAdapter } from '../mixer/StudioLiveAdapter.ts';
import { createApi, localHosts } from '../api/app.ts';
import { loadAccounts } from '../auth/accounts.ts';
import { AuthService } from '../auth/AuthService.ts';
try {
  const { ip, port, allowed, host, accountsFile } = config();
  const accounts = await loadAccounts(accountsFile);
  const adapter = new StudioLiveAdapter(ip, allowed);
  const server = createApi(adapter, allowed, new AuthService(accounts, accountsFile));
  server.on('error', error => { console.error(`API startup failed: ${error.message}`); adapter.close(); process.exitCode = 1; });
  server.listen(port, host, () => {
    console.log(`CECP Monitor Phase 2: http://127.0.0.1:${port}`);
    if (host === '0.0.0.0') for (const address of localHosts()) if (!['localhost', '127.0.0.1'].includes(address)) console.log(`Phone / LAN: http://${address}:${port}`);
    console.log(`Allowed mixes: ${allowed.join(', ')}. PIN login required.`);
    void adapter.connect().catch(error => console.error(error.message));
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
    adapter.close(); server.close(); server.closeAllConnections();
  });
} catch (error) { console.error(`Configuration error: ${error instanceof Error ? error.message : error}`); process.exitCode = 1; }
