import checkPackagesCommand from './check-packages/index.js';
import lintCommand from './lint/index.js';

const commands = [lintCommand, checkPackagesCommand];

export default commands;
