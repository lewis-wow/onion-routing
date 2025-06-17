import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { AddressInfo } from 'node:net';
import { Logger } from './Logger.js';
import { cors } from 'hono/cors';

export interface INode {
  name: string;
}

export class Node implements INode {
  protected logger?: Logger;
  protected app = new Hono()
    .use(
      cors({
        origin: '*',
      }),
    )
    .get('/ping', (c) => c.text(Node.PING_RESPONSE));

  protected addressInfo: AddressInfo | undefined = undefined;

  public get name(): string {
    if (!this.addressInfo) {
      throw new Error('NetNode: you must call run() method.');
    }

    return `${this.addressInfo.address.replace('::', 'localhost')}:${this.addressInfo.port}`;
  }

  async run(): Promise<void> {
    const addressInfo = await new Promise<AddressInfo>((resolve) =>
      serve(
        {
          fetch: this.app.fetch,
          port: 0,
        },
        resolve,
      ),
    );

    this.addressInfo = addressInfo;
    this.logger = new Logger(this.name);
    this.logger.log(`${this.constructor.name}::run()`);
  }

  toJSON(): INode {
    return {
      name: this.name,
    };
  }

  static readonly PING_RESPONSE = 'pong';
}
