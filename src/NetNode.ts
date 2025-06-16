import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { AddressInfo } from 'node:net';

export interface INetNode {
  name: string;
}

export class NetNode implements INetNode {
  protected app = new Hono().get('/ping', (c) => c.text(NetNode.PING_RESPONSE));
  protected addressInfo: AddressInfo | undefined = undefined;

  public get name(): string {
    if (!this.addressInfo) {
      throw new Error('NetNode: you must call run() method.');
    }

    return `${this.addressInfo.address}:${this.addressInfo.port}`;
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
  }

  static readonly PING_RESPONSE = 'pong';
}
