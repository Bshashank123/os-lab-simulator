import { cpu } from './cpu.js';
import { memory } from './memory.js';
import { files } from './files.js';
import { deadlock } from './deadlock.js';
import { paging } from './paging.js';

export const MODULES = { cpu, memory, files, deadlock, paging };
export const MODULE_ORDER = ['cpu', 'memory', 'files', 'deadlock', 'paging'];
