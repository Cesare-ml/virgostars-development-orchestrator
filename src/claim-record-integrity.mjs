/**
 * Structural check for legacy PRIVATE pilot claim records.
 *
 * This is a pure fail-closed validation step, not ownership authorization.
 * Unknown fields and contradictory lifecycle metadata require owner review.
 * Raw JSON duplicate-key handling is a separate concern at the blob decoder.
 */
const SESSION = /^(chat|codex)-[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
const REPO = /^[a-z\d][a-z\d_.-]*\/[a-z\d][a-z\d_.-]*$/i;
const RESOURCE_ID = /^[a-z][a-z0-9_-]{0,63}$/;
const ROOT = /^[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)*\/?$/i;
const SHA = /^[\da-f]{40}$/i;
const TIMESTAMP = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
const CLAIM_FIELDS = [
  'schema_version','target_repository','issue_number','session_id',
  'role','access','resource_scope_id','resource_roots','state',
  'claimed_at','branch','last_handoff'
];
const HANDOFF_FIELDS = ['at','summary','head_sha'];
const READ_ROLES = new Set(['reviewer','auditor','planner','integrator']);
const WRITE_ROLES = new Set(['developer','tester']);

function exactPlainRecord(obj,fields) {
  if(!obj || typeof obj!=='object' || Array.isArray(obj) ||
     ![Object.prototype,null].includes(Object.getPrototypeOf(obj))) return false;
  const keys=Reflect.ownKeys(obj);
  return keys.length===fields.length &&
    keys.every(key=>typeof key==='string' && fields.includes(key) &&
      Object.hasOwn(Object.getOwnPropertyDescriptor(obj,key),'value'));
}
function utcIso(value) {
  return typeof value==='string' && TIMESTAMP.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString()===value;
}
function validRoot(root) {
  if(typeof root!=='string'||root.length>200||!ROOT.test(root)) return false;
  return !root.replace(/\/$/,'').split('/').some(segment=>
    segment==='.' || segment==='..' || segment.endsWith('.') ||
    segment.toLowerCase()==='.git' ||
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment));
}
function sortedRoots(roots) {
  return Array.isArray(roots) && roots.length>=1 && roots.length<=20 &&
    roots.every(validRoot) &&
    roots.every((value,i)=>i===0||roots[i-1]<value) &&
    new Set(roots.map(value=>value.toLowerCase())).size===roots.length;
}

/** Return false on any corrupted, stale or cross-target active issue record. */
export function isStructurallyValidActiveClaim(data,repo,issue) {
  if(!exactPlainRecord(data,CLAIM_FIELDS) || data.schema_version!==2 ||
     typeof repo!=='string' || !REPO.test(repo) ||
     !Number.isSafeInteger(issue) || issue<1 ||
     data.target_repository!==repo || data.issue_number!==issue ||
     typeof data.session_id!=='string'||!SESSION.test(data.session_id) ||
     !['claimed','in_progress'].includes(data.state) ||
     !utcIso(data.claimed_at) ||
     !(data.branch===null || (typeof data.branch==='string' &&
       data.branch.length>0 && data.branch.length<=255))) return false;

  if(data.access==='read') {
    if(!READ_ROLES.has(data.role) || data.resource_scope_id!==null ||
       data.resource_roots!==null) return false;
  } else if(data.access==='write') {
    if(!WRITE_ROLES.has(data.role) ||
       typeof data.resource_scope_id!=='string' ||
       !RESOURCE_ID.test(data.resource_scope_id) ||
       !sortedRoots(data.resource_roots)) return false;
  } else return false;

  if(data.state==='claimed') return data.last_handoff===null;
  const h=data.last_handoff;
  return exactPlainRecord(h,HANDOFF_FIELDS) && utcIso(h.at) &&
    h.at>=data.claimed_at &&
    typeof h.summary==='string' && !!h.summary.trim() &&
    h.summary.length<=2000 &&
    (h.head_sha===null || (typeof h.head_sha==='string' && SHA.test(h.head_sha)));
}
