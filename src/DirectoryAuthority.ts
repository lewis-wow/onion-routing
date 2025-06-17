import z from 'zod';
import { Node } from './Node.js';
import { Utils } from './Utils.js';
import { zValidator } from '@hono/zod-validator';
import { IRelay, RelayType } from './Relay.js';

export class DirectoryAuthority extends Node {
  relayPool: IRelay[] = [];

  constructor() {
    super();

    this.app
      .post(
        '/register',
        zValidator(
          'json',
          z.object({
            relayType: z.nativeEnum(RelayType),
            name: z.string(),
          }),
        ),
        (c) => {
          const { relayType, name } = c.req.valid('json');
          this.relayPool.push({ relayType, name });

          return c.json({ relayType, name });
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
      const { data } = await Utils.fetchData<string>(
        `http://${relayName}/ping`,
        {
          signal: AbortSignal.timeout(
            DirectoryAuthority.PING_RELAY_REQUEST_TIMEOUT,
          ),
        },
      );

      if (data === null || data !== Node.PING_RESPONSE) {
        this.relayPool.splice(index, 1);
      }
    });
  }

  static readonly PING_RELAY_REQUEST_TIMEOUT = 2000;
  static readonly PING_RELAY_INTERVAL = 60000;
}
