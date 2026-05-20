import { CONFIG, MAX_SOLDIER_LEVEL } from './config.js';

export class DropQueue {
  constructor() {
    const init = CONFIG.dropQueue?.initialQueue ?? [1, 2, 1];
    this.queue = [...init];
  }

  reset() {
    const init = CONFIG.dropQueue?.initialQueue ?? [1, 2, 1];
    this.queue = [...init];
  }

  peek() {
    return this.queue[0] ?? 1;
  }

  peekSecond() {
    return this.queue[1] ?? 1;
  }

  swap() {
    if (this.queue.length < 2) return;
    [this.queue[0], this.queue[1]] = [this.queue[1], this.queue[0]];
  }

  consume() {
    const level = this.queue.shift() ?? 1;
    this.queue.push(this._rollLevel());
    return level;
  }

  _rollLevel() {
    const table = CONFIG.dropQueue?.weights ?? [
      { level: 1, p: 0.5 },
      { level: 2, p: 0.28 },
      { level: 3, p: 0.15 },
      { level: 4, p: 0.07 },
    ];
    const r = Math.random();
    let acc = 0;
    for (const row of table) {
      acc += row.p;
      if (r < acc) return Math.min(row.level, MAX_SOLDIER_LEVEL);
    }
    return 1;
  }
}
