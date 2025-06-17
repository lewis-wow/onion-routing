import chalk from 'chalk';
import uniqolor from 'uniqolor';

export class Logger {
  private color: string;

  constructor(public nodeName: string) {
    this.color = uniqolor(this.nodeName).color;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  log(...messages: any[]): void {
    console.log(chalk.hex(this.color)(`[${this.nodeName}]`), ...messages);
  }
}
