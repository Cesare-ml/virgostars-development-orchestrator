/**
 * Shared fail-closed file change inspection for all future Integrator gates.
 * Applies to BOTH current and old filenames; a rename cannot hide governance
 * or deployment file modifications behind an innocuous new filename.
 * Pure metadata review, NEVER a GitHub merge or owner approval.
 */
const VALID_STATUSES=new Set([
  'added','modified','removed','renamed','copied','changed','unchanged'
]);
const PREVIOUS_STATUSES=new Set(['renamed','copied']);
const LOCKFILES=new Set([
  'package-lock.json','npm-shrinkwrap.json','yarn.lock','pnpm-lock.yaml',
  'pnpm-workspace.yaml','cargo.lock','poetry.lock','uv.lock','pipfile.lock',
  'gemfile.lock','composer.lock','go.sum','flake.lock','bun.lock','bun.lockb'
]);
const MANIFESTS=new Set([
  'package.json','cargo.toml','pyproject.toml','pipfile','gemfile',
  'composer.json','go.mod','pom.xml','build.gradle','build.gradle.kts',
  'settings.gradle','settings.gradle.kts','dockerfile','containerfile'
]);
const DIRECTORY_RISKS=new Set([
  'secrets','secret','credentials','credential','migrations','migration',
  'deploy','deployment','infrastructure','terraform'
]);
function safePath(path) {
  return typeof path==='string' && path.length>0 && path.length<=300 &&
    !path.startsWith('/') && !path.includes('\\') &&
    !/[\u0000-\u001f\u007f]/.test(path) &&
    path.split('/').every(x=>x!==''&&x!=='.'&&x!=='..');
}
function sensitivePath(path) {
  const parts=path.toLowerCase().split('/');
  const name=parts.at(-1);
  if(parts.length===1 && name==='codeowners')return true;
  if(parts.length===2 && ['.github','docs'].includes(parts[0])&&name==='codeowners')return true;
  if(parts.length>=3 && parts[0]==='.github'&&parts[1]==='workflows')return true;
  if(parts.some(x=>DIRECTORY_RISKS.has(x)))return true;
  if(parts.some(x=>x==='.env'||x.startsWith('.env.')))return true;
  if(name==='agents.md'||name==='security.md')return true;
  if(name==='license'||name.startsWith('license.')||name==='copying'||
     name.startsWith('copying.')||name==='notice'||name.startsWith('notice.'))return true;
  if(LOCKFILES.has(name)||MANIFESTS.has(name))return true;
  if(/^requirements(?:[-_.][a-z0-9_.-]+)?\.txt$/.test(name))return true;
  if(parts[0]==='.github' && ['dependabot.yml','dependabot.yaml'].includes(name))return true;
  return false;
}
/**
 * @returns {{valid:boolean,sensitive:boolean,paths:string[],reasons:string[]}}
 */
export function inspectIntegratorChangedFile(file) {
  const reasons=[];
  const mark=code=>{if(!reasons.includes(code))reasons.push(code)};
  const status=file?.status;
  const current=file?.filename;
  const hasPrevious=file!==null && typeof file==='object' &&
    Object.prototype.hasOwnProperty.call(file,'previous_filename');
  const previous=hasPrevious ? file.previous_filename : undefined;
  const paths=[];
  if(!VALID_STATUSES.has(status))mark('UNKNOWN_FILE_STATUS');
  if(!safePath(current))mark('UNSAFE_FILENAME');else paths.push(current);
  if(status==='renamed' && !hasPrevious)mark('MISSING_RENAME_SOURCE');
  if(hasPrevious) {
    if(!PREVIOUS_STATUSES.has(status))mark('UNEXPECTED_PREVIOUS_FILENAME');
    if(!safePath(previous))mark('UNSAFE_PREVIOUS_FILENAME');
    else {
      paths.push(previous);
      if(safePath(current) && previous.toLowerCase()===current.toLowerCase())
        mark('SAME_OR_CASE_ONLY_RENAME');
    }
  }
  const sensitive=paths.some(sensitivePath);
  return {valid:reasons.length===0,sensitive,paths,reasons};
}
