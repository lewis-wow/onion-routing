import z from 'zod';
import { NetNode } from './NetNode.js';
import { Utils } from './Utils.js';
import { zValidator } from '@hono/zod-validator';

export class DirectoryAuthority extends NetNode {
  relayPool: string[] = [];

  constructor() {
    super();

    this.app
      .post(
        '/register',
        zValidator(
          'json',
          z.object({
            relayName: z.string(),
          }),
        ),
        (c) => {
          const { relayName } = c.req.valid('json');
          this.relayPool.push(relayName);

          return c.text('OK');
        },
      )
      .get('/list', (c) =>
        c.json(this.relayPool.map((relayName) => relayName)),
      );

    setInterval(
      () => this.kickDeadRelays(),
      DirectoryAuthority.PING_RELAY_INTERVAL,
    );
  }

  private async kickDeadRelays(): Promise<void> {
    this.relayPool.forEach(async (relayName, index) => {
      const data = await Utils.fetchData<string>(`http://${relayName}/ping`, {
        signal: AbortSignal.timeout(
          DirectoryAuthority.PING_RELAY_REQUEST_TIMEOUT,
        ),
      });

      if (data === null || data !== NetNode.PING_RESPONSE) {
        this.relayPool.splice(index, 1);
      }
    });
  }

  static readonly PING_RELAY_REQUEST_TIMEOUT = 2000;
  static readonly PING_RELAY_INTERVAL = 60000;
}
