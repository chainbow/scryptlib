import {
   Artifact, CURRENT_CONTRACT_ARTIFACT_VERSION, hash160, md5, path2uri, resolveConstValue, TypeResolver
} from './internal';

//SOURCE_REG parser src eg: [0:6:3:8:4#Bar.constructor:0]
export const SOURCE_REG = /^(?<fileIndex>-?\d+):(?<line>\d+):(?<col>\d+):(?<endLine>\d+):(?<endCol>\d+)(#(?<tagStr>.+))?/;

// see VERSIONLOG.md

export enum CompileErrorType {
  SyntaxError = 'SyntaxError',
  SemanticError = 'SemanticError',
  InternalError = 'InternalError',
  Warning = 'Warning'
}


export enum BuildType {
  Debug = 'debug',
  Release = 'release'
}

export interface RelatedInformation {
  filePath: string;
  position: [{
    line: number;
    column: number;
  }, {
    line: number;
    column: number;
  }?];
  message: string;
}


export interface CompileErrorBase {
  type: string;
  filePath: string;
  position: [{
    line: number;
    column: number;
  }, {
    line: number;
    column: number;
  }?];
  message: string;
  relatedInformation: RelatedInformation[]
}

export interface SyntaxError extends CompileErrorBase {
  type: CompileErrorType.SyntaxError;
  unexpected: string;
  expecting: string;
}

export interface SemanticError extends CompileErrorBase {
  type: CompileErrorType.SemanticError;
}

export interface InternalError extends CompileErrorBase {
  type: CompileErrorType.InternalError;
}

export interface Warning extends CompileErrorBase {
  type: CompileErrorType.Warning;
}

export type CompileError = SyntaxError | SemanticError | InternalError | Warning;

export class CompileResult {

  constructor(public errors: CompileError[], public warnings: Warning[]) {

  }

  asm?: OpCode[];
  hex?: string;
  ast?: Record<string, unknown>;
  dependencyAsts?: Record<string, unknown>;
  abi?: Array<ABIEntity>;
  stateProps?: Array<ParamEntity>;
  compilerVersion?: string;
  contract?: string;
  md5?: string;
  structs?: Array<StructEntity>;
  library?: Array<LibraryEntity>;
  contracts?: Array<ContractEntity>;
  alias?: Array<AliasEntity>;
  file?: string;
  buildType?: string;
  autoTypedVars?: AutoTypedVar[];
  statics?: Array<StaticEntity>;
  sources?: Array<string>;
  sourceMap?: Array<string>;
  sourceMapFile?: string;
  dbgFile?: string;

  toArtifact(): Artifact {

    const artifact: Artifact = {
      version: CURRENT_CONTRACT_ARTIFACT_VERSION,
      compilerVersion: this.compilerVersion || '0.0.0',
      contract: this.contract || '',
      md5: this.md5 || '',
      structs: this.structs || [],
      library: this.library || [],
      alias: this.alias || [],
      abi: this.abi || [],
      stateProps: this.stateProps || [],
      buildType: this.buildType || BuildType.Debug,
      file: this.file || '',
      hex: this.hex || '',
      asm: '',
      sourceMap: [],
      sources: [],
      sourceMapFile: this.sourceMapFile || '',
    };

    return artifact;
  }
}


export enum DebugModeTag {
  FuncStart = 'F0',
  FuncEnd = 'F1',
  LoopStart = 'L0'
}

export interface DebugInfo {
  tag: DebugModeTag;
  contract: string;
  func: string;
  context: string;
}

export interface Pos {
  file: string;
  line: number;
  endLine: number;
  column: number;
  endColumn: number;
}

export interface OpCode {
  opcode: string;
  stack?: string[];
  topVars?: string[];
  pos?: Pos;
  debugInfo?: DebugInfo;
}

export interface AutoTypedVar {
  name: string;
  pos: Pos;
  type: string;
}

export interface ABI {
  contract: string, abi: Array<ABIEntity>
}

export enum ABIEntityType {
  FUNCTION = 'function',
  CONSTRUCTOR = 'constructor'
}
export type ParamEntity = {
  name: string;
  type: string;
}
export interface ABIEntity {
  type: string;
  name?: string;
  params: Array<ParamEntity>;
  index?: number;
}

export interface StructEntity {
  name: string;
  params: Array<ParamEntity>;
  genericTypes: Array<string>;
}
export interface LibraryEntity extends StructEntity {
  properties: Array<ParamEntity>;
}
export interface AliasEntity {
  name: string;
  type: string;
}

export type ContractEntity = LibraryEntity

export interface StaticEntity {
  name: string;
  type: string;
  const: boolean;
  value?: any;
}

export interface CompilingSettings {
  ast?: boolean,
  asm?: boolean,
  hex?: boolean,
  debug?: boolean,
  artifact?: boolean,
  outputDir?: string,
  outputToFiles?: boolean,
  cwd?: string,
  cmdPrefix?: string,
  cmdArgs?: string,
  buildType?: string,
  stdout?: boolean,
  sourceMap?: boolean,
  timeout?: number  // in ms
}




function getConstructorDeclaration(mainContract): ABIEntity {
  // explict constructor
  if (mainContract['constructor']) {
    return {
      type: ABIEntityType.CONSTRUCTOR,
      params: mainContract['constructor']['params'].map(p => { return { name: p['name'], type: p['type'] }; }),
    };
  } else {
    // implicit constructor
    if (mainContract['properties']) {
      return {
        type: ABIEntityType.CONSTRUCTOR,
        params: mainContract['properties'].map(p => { return { name: p['name'].replace('this.', ''), type: p['type'] }; }),
      };
    }
  }
}


function getPublicFunctionDeclaration(mainContract): ABIEntity[] {
  let pubIndex = 0;
  const interfaces: ABIEntity[] =
    mainContract['functions']
      .filter(f => f['visibility'] === 'Public')
      .map(f => {
        const entity: ABIEntity = {
          type: ABIEntityType.FUNCTION,
          name: f['name'],
          index: f['nodeType'] === 'Constructor' ? undefined : pubIndex++,
          params: f['params'].map(p => { return { name: p['name'], type: p['type'] }; }),
        };
        return entity;
      });
  return interfaces;
}


export function getContractName(astRoot: unknown): string {
  const mainContract = astRoot['contracts'][astRoot['contracts'].length - 1];
  if (!mainContract) {
    return '';
  }
  return mainContract['name'] || '';
}



/**
 * 
 * @param astRoot AST root node after main contract compilation
 * @param typeResolver a Type Resolver
 * @returns All function ABIs defined by the main contract, including constructors
 */
export function getABIDeclaration(astRoot: unknown, typeResolver: TypeResolver): ABI {
  const mainContract = astRoot['contracts'][astRoot['contracts'].length - 1];
  if (!mainContract) {
    return {
      contract: '',
      abi: []
    };
  }

  const interfaces: ABIEntity[] = getPublicFunctionDeclaration(mainContract);
  const constructorABI = getConstructorDeclaration(mainContract);

  interfaces.push(constructorABI);

  interfaces.forEach(abi => {
    abi.params = abi.params.map(param => {
      return Object.assign(param, {
        type: typeResolver(param.type).finalType
      });
    });
  });

  return {
    contract: getContractName(astRoot),
    abi: interfaces
  };
}

/**
 * 
 * @param astRoot AST root node after main contract compilation
 * @param dependencyAsts AST root node after all dependency contract compilation
 * @returns all defined structures of the main contract and dependent contracts
 */
export function getStructDeclaration(astRoot: unknown, dependencyAsts: unknown): Array<StructEntity> {


  const allAst = [astRoot];

  Object.keys(dependencyAsts).forEach(key => {
    allAst.push(dependencyAsts[key]);
  });

  return allAst.map(ast => {
    return (ast['structs'] || []).map(s => ({
      name: s['name'],
      params: s['fields'].map(p => { return { name: p['name'], type: p['type'] }; }),
      genericTypes: s.genericTypes || [],
    }));
  }).flat(1);
}



/**
 * 
 * @param astRoot AST root node after main contract compilation
 * @param dependencyAsts AST root node after all dependency contract compilation
 * @returns all defined Library of the main contract and dependent contracts
 */
export function getLibraryDeclaration(astRoot: unknown, dependencyAsts: unknown): Array<LibraryEntity> {

  const allAst = [astRoot];

  Object.keys(dependencyAsts).forEach(key => {
    if (key !== 'std') {
      allAst.push(dependencyAsts[key]);
    }
  });

  return allAst.map(ast => {
    return (ast['contracts'] || []).filter(c => c.nodeType == 'Library').map(c => {
      if (c['constructor']) {
        return {
          name: c.name,
          params: c['constructor']['params'].map(p => { return { name: `ctor.${p['name']}`, type: p['type'] }; }),
          properties: c['properties'].map(p => { return { name: p['name'], type: p['type'] }; }),
          genericTypes: c.genericTypes || [],
        };
      } else {
        // implicit constructor
        if (c['properties']) {
          return {
            name: c.name,
            params: c['properties'].map(p => { return { name: p['name'], type: p['type'] }; }),
            properties: c['properties'].map(p => { return { name: p['name'], type: p['type'] }; }),
            genericTypes: c.genericTypes || [],
          };
        }
      }
    });
  }).flat(1);
}


export function getContractDeclaration(astRoot: unknown, dependencyAsts: unknown): Array<ContractEntity> {

  const allAst = [astRoot];

  Object.keys(dependencyAsts).forEach(key => {
    if (key !== 'std') {
      allAst.push(dependencyAsts[key]);
    }
  });

  return allAst.map(ast => {
    return (ast['contracts'] || []).filter(c => c.nodeType == 'Contract').map(c => {
      if (c['constructor']) {
        return {
          name: c.name,
          params: c['constructor']['params'].map(p => { return { name: `ctor.${p['name']}`, type: p['type'] }; }),
          properties: c['properties'].map(p => { return { name: p['name'], type: p['type'] }; }),
          genericTypes: c.genericTypes || []
        };
      } else {
        // implicit constructor
        if (c['properties']) {
          return {
            name: c.name,
            params: c['properties'].map(p => { return { name: p['name'], type: p['type'] }; }),
            properties: c['properties'].map(p => { return { name: p['name'], type: p['type'] }; }),
            genericTypes: c.genericTypes || [],
          };
        }
      }
    });
  }).flat(1);
}


/**
 * 
 * @param astRoot AST root node after main contract compilation
 * @param dependencyAsts AST root node after all dependency contract compilation
 * @returns all defined type aliaes of the main contract and dependent contracts
 */
export function getAliasDeclaration(astRoot: unknown, dependencyAsts: unknown): Array<AliasEntity> {

  const allAst = [astRoot];

  Object.keys(dependencyAsts).forEach(key => {
    allAst.push(dependencyAsts[key]);
  });

  return allAst.map(ast => {
    return (ast['alias'] || []).map(s => ({
      name: s['alias'],
      type: s['type'],
    }));
  }).flat(1);
}



/**
 * 
 * @param astRoot AST root node after main contract compilation
 * @param dependencyAsts AST root node after all dependency contract compilation
 * @returns all defined static const int literal of the main contract and dependent contracts
 */
export function getStaticDeclaration(astRoot: unknown, dependencyAsts: unknown): Array<StaticEntity> {

  const allAst = [astRoot];
  Object.keys(dependencyAsts).forEach(key => {
    allAst.push(dependencyAsts[key]);
  });

  return allAst.map((ast) => {
    return (ast['contracts'] || []).map(contract => {
      return (contract.statics || []).map(node => {
        return {
          const: node.const,
          name: `${contract.name}.${node.name}`,
          type: node.type,
          value: resolveConstValue(node)
        };
      });
    });
  }).flat(Infinity).flat(1);
}


export function loadSourceMapfromArtifact(artifact: Artifact): Array<{
  pos: Pos | undefined,
  opcode: string
}> {

  const sources = artifact.sources;
  const asm = artifact.asm.split(' ');

  if (!artifact.sourceMap || artifact.sourceMap.length == 0) {
    return [];
  }

  return asm.map((opcode, index) => {
    const item = artifact.sourceMap[index];
    const match = SOURCE_REG.exec(item);
    if (match && match.groups) {
      const fileIndex = parseInt(match.groups.fileIndex);
      const pos: Pos | undefined = sources[fileIndex] ? {
        file: sources[fileIndex],
        line: sources[fileIndex] ? parseInt(match.groups.line) : undefined,
        endLine: sources[fileIndex] ? parseInt(match.groups.endLine) : undefined,
        column: sources[fileIndex] ? parseInt(match.groups.col) : undefined,
        endColumn: sources[fileIndex] ? parseInt(match.groups.endCol) : undefined,
      } : undefined;

      return {
        pos: pos,
        opcode: opcode
      };
    }
  });
}