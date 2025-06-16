import { zValidator } from '@hono/zod-validator';
import { createDecipheriv, createDiffieHellman, createHash } from 'node:crypto';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { HTTPException } from 'hono/http-exception';
import { NetNode } from './NetNode.js';

export type Session = {
  sessionId: string;
  aesKey: string;
  iv: string;
};

const sessions: Session[] = [];

export const ALGORITHM = 'aes-192-cbc';

export enum RelayType {
  GUARD_RELAY = 'GUARD_RELAY',
  MIDDLE_RELAY = 'MIDDLE_RELAY',
  EXIT_RELAY = 'EXIT_RELAY',
}

type ExitNodePayload = {
  url: string;
  init?: RequestInit;
};

type NodePayload = {
  relayId: string;
  remainingPayload: string;
};

/*
export type RelayPayload =
  | {
      relayType: RelayType.EXIT_RELAY;
      payload: {
        url: string;
        init?: RequestInit;
      };
    }
  | {
      relayType: RelayType.GUARD_RELAY | RelayType.MIDDLE_RELAY;
      payload: {
        relayId: string;
        remainingPayload: string;
      };
    };
*/

const payloadSchema = z
  .object({
    relayType: z.enum([RelayType.EXIT_RELAY]),
    payload: z.object({
      url: z.string().url(),
      init: z.record(z.string(), z.unknown()).optional(),
    }),
  })
  .or(
    z.object({
      relayType: z.enum([RelayType.GUARD_RELAY, RelayType.MIDDLE_RELAY]),
      payload: z.object({
        relayId: z.string(),
        remainingPayload: z.string(),
      }),
    }),
  );
export type RelayPayload = z.infer<typeof payloadSchema>;

export interface IRelay {
  relayType: RelayType;
  name: string;
}

export class Relay extends NetNode implements IRelay {
  constructor(public relayType: RelayType) {
    super();

    this.app
      .post(
        '/session',
        zValidator(
          'json',
          z.object({
            primeLength: z.number(),
            generator: z.number(),
            iv: z.string(),
          }),
        ),
        async (c) => {
          const { primeLength, generator, iv } = c.req.valid('json');

          const dh = createDiffieHellman(primeLength, generator);

          const sessionKey = dh.generateKeys();
          const aesKey = createHash('sha256').update(sessionKey).digest('hex');
          const sessionId = uuidv4();

          sessions.push({
            sessionId,
            aesKey,
            iv,
          });

          return c.json({
            sessionId,
          });
        },
      )
      .post(
        '/route',
        zValidator(
          'json',
          z.object({
            sessionId: z.string(),
            payload: z.string(),
          }),
        ),
        async (c) => {
          const { sessionId, payload } = c.req.valid('json');

          const session = sessions.find(
            (session) => session.sessionId === sessionId,
          );

          if (!session) {
            throw new HTTPException(400);
          }

          const decryptedPayload = this.decrypt(
            payload,
            session.aesKey,
            session.iv,
          );

          const parsedPayload = JSON.parse(btoa(decryptedPayload));
          const validatedPayload = payloadSchema.parse(parsedPayload);

          if (
            validatedPayload.relayType === RelayType.EXIT_RELAY &&
            this.relayType !== RelayType.EXIT_RELAY
          ) {
            throw new HTTPException(400);
          }

          if (validatedPayload.relayType === RelayType.EXIT_RELAY) {
            return await this.exitNodeFetch(validatedPayload.payload);
          }

          return this.forwardRoute(validatedPayload.payload);
        },
      );
  }

  private async forwardRoute(nodePayload: NodePayload): Promise<Response> {
    const response = await fetch(`http://${nodePayload.relayId}/route`, {
      body: JSON.stringify({
        payload: nodePayload.remainingPayload,
      }),
    });

    return response;
  }

  private async exitNodeFetch(
    exitNodePayload: ExitNodePayload,
  ): Promise<Response> {
    const response = await fetch(exitNodePayload.url, exitNodePayload.init);

    return response;
  }

  private decrypt(
    encryptedData: string,
    aesKey: string,
    ivHex: string,
  ): string {
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = createDecipheriv('aes-256-cbc', aesKey, iv);

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedData, 'hex')),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  static readonly CIPHER_ALGORITHM = 'aes-256-cbc';
}
