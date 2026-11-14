/**
 * Validate owner-only commands before any private ledger preflight or API call.
 * Unknown commands, extra flags and wrong positional counts fail locally.
 * This is input-shape validation, not authorization to use the ledger.
 */
const commandRules = Object.freeze({
  discover: {positions: 0, flags: []},
  'fleet-status': {positions: 0, flags: []},
  'audit-pr': {positions: 3, flags: []},
  'audit-collisions': {positions: 2, flags: []},
  'claim-next': {positions: 0, flags: ['session', 'role', 'repo']},
  status: {positions: 2, flags: []},
  claim: {positions: 2, flags: ['session', 'role', 'branch']},
  handoff: {positions: 2, flags: ['session', 'summary', 'branch', 'head-sha']},
  release: {positions: 2, flags: ['session', 'confirm']},
  submit: {positions: 2, flags: ['session', 'confirm', 'pr']}
});

export function validateLegacyCliInvocation(command, positionals, flags) {
  const rule = Object.hasOwn(commandRules, command) ? commandRules[command] : null;
  if (!rule) throw new Error('Unknown command ' + command);
  if (!Array.isArray(positionals) || positionals.length !== rule.positions ||
      !flags || typeof flags !== 'object' || Array.isArray(flags)) {
    throw new Error('Invalid arguments for ' + command + '.');
  }
  const unexpected = Object.keys(flags).find(flag => !rule.flags.includes(flag));
  if (unexpected) throw new Error('Option --' + unexpected + ' is not valid for ' + command + '.');
}
