import { AbstractContract, Arguments, bin2num, bsv, num2bin, readBytes } from '.';
import { deserializeArgfromHex } from './deserializer';
import { flatternArg, parseLiteral } from './internal';
import { Int, Bytes, SupportedParamType, ScryptType, Bool, PrivKey, PubKey, Sig, Ripemd160, Sha1, Sha256, SigHashType, SigHashPreimage, OpCodeType, TypeResolver } from './scryptTypes';

export default class Stateful {

  // state version
  static readonly CURRENT_STATE_VERSION = 0n;

  static int2hex(n: Int): string {
    let asm = '';
    const num = new bsv.crypto.BN(n);
    if (num.eqn(0)) {
      asm = '00';
    } else {
      asm = num.toSM({ endian: 'little' }).toString('hex');
    }

    return bsv.Script.fromASM(asm).toHex();
  }

  static hex2int(hex: string): bigint {
    const s = bsv.Script.fromHex(hex);
    const chuck = s.chunks[0];
    return bin2num(chuck.buf.toString('hex'));
  }



  static bool2hex(b: boolean): string {
    if (b) {
      return '01';
    }
    return '00';
  }

  static hex2bool(hex: string): boolean {
    if (hex === '01') {
      return true;
    } else if (hex === '00') {
      return false;
    }
    throw new Error(`invalid hex ${hex}`);
  }

  static bytes2hex(b: Bytes): string {
    if (b === '') {
      return '00';
    }
    return bsv.Script.fromASM(b).toHex();
  }

  static hex2bytes(hex: string): Bytes {
    if (hex === '00') {
      return '';
    }
    const s = bsv.Script.fromHex(hex);
    const chuck = s.chunks[0];
    return chuck.buf.toString('hex');
  }

  static toHex(x: SupportedParamType): string {

    if (typeof x === 'bigint') {
      return Stateful.int2hex(x);
    } else if (typeof x === 'boolean') {
      return Stateful.bool2hex(x as boolean);
    } else if (typeof x === 'string') {
      const [value, type] = parseLiteral(x);

      if (type === ScryptType.PRIVKEY) {
        return Stateful.int2hex(value as bigint);
      }

      return Stateful.bytes2hex(value as Bytes);
    }

    return '00';
  }

  static serialize(x: SupportedParamType): string {

    if (typeof x === 'bigint') {
      const num = new bsv.crypto.BN(x);
      if (num.eqn(0)) {
        return '';
      } else {
        return num.toSM({ endian: 'little' }).toString('hex');
      }
    } else if (typeof x === 'boolean') {
      if (x) {
        return '01';
      }
      return '';
    } else if (typeof x === 'string') {
      const [value, type] = parseLiteral(x);

      if (type === ScryptType.PRIVKEY) {
        return Stateful.int2hex(value as bigint);
      }

      return value as Bytes;
    }

    return '';
  }


  /**
 * only used for state contract
 * @param args 
 * @param isGenesis 
 * @param finalTypeResolver 
 * @returns 
 */
  static buildState(args: Arguments, isGenesis: boolean, resolver: TypeResolver): string {

    const args_ = args.map(arg => {
      return flatternArg(arg, resolver, { state: true, ignoreValue: false });
    }).flat(Infinity) as Arguments;

    if (args_.length <= 0) {
      throw new Error('no state property found, buildContractState only used for state contract');
    }

    // append isGenesis which is a hidden built-in state
    let state_hex = `${Stateful.toHex(isGenesis)}`;

    state_hex += args_.map(a => Stateful.toHex(a.value)).join('');

    //append meta
    if (state_hex) {
      const state_len = state_hex.length / 2;
      state_hex += num2bin(BigInt(state_len), 4) + num2bin(Stateful.CURRENT_STATE_VERSION, 1);
      return state_hex;
    }

    return state_hex;

  }



  static buildDefaultStateArgs(contract: AbstractContract): Arguments {

    const dummyArgs = contract.stateProps.map(p => {
      const dummyArg = Object.assign({}, p, { value: false });
      return flatternArg(dummyArg, contract.resolver, { state: true, ignoreValue: true });
    }).flat(Infinity) as Arguments;


    const hexTemplateMap: Map<string, string> = new Map();

    dummyArgs.forEach(p => {

      if (p.type === ScryptType.INT || p.type === ScryptType.PRIVKEY) {
        hexTemplateMap.set(`<${p.name}>`, Stateful.int2hex(0n));
      } else if (p.type === ScryptType.BOOL) {
        hexTemplateMap.set(`<${p.name}>`, Stateful.bool2hex(true));
      } else if (p.type === ScryptType.BYTES
        || p.type === ScryptType.PUBKEY
        || p.type === ScryptType.SIG
        || p.type === ScryptType.RIPEMD160
        || p.type === ScryptType.SHA1
        || p.type === ScryptType.SHA256
        || p.type === ScryptType.SIGHASHTYPE
        || p.type === ScryptType.SIGHASHPREIMAGE
        || p.type === ScryptType.OPCODETYPE) {
        hexTemplateMap.set(`<${p.name}>`, Stateful.bytes2hex('00'));
      } else {
        throw new Error(`param ${p.name} has unknown type ${p.type}`);
      }
    });

    return contract.stateProps.map(param => deserializeArgfromHex(contract.resolver, Object.assign(param, {
      value: undefined
    }), hexTemplateMap, { state: true }));

  }



  static deserializer(type: string, hex: string): SupportedParamType {

    switch (type) {
      case ScryptType.BOOL:
        return Bool(Stateful.hex2bool(hex));
      case ScryptType.INT:
        return Int(Stateful.hex2int(hex));
      case ScryptType.BYTES:
        return Bytes(Stateful.hex2bytes(hex));
      case ScryptType.PRIVKEY:
        return PrivKey(Stateful.hex2int(hex));
      case ScryptType.PUBKEY:
        return PubKey(Stateful.hex2bytes(hex));
      case ScryptType.SIG:
        return Sig(Stateful.hex2bytes(hex));
      case ScryptType.RIPEMD160:
        return Ripemd160(Stateful.hex2bytes(hex));
      case ScryptType.SHA1:
        return Sha1(Stateful.hex2bytes(hex));
      case ScryptType.SHA256:
        return Sha256(Stateful.hex2bytes(hex));
      case ScryptType.SIGHASHTYPE:
        return SigHashType(Number(Stateful.hex2int(hex)));
      case ScryptType.SIGHASHPREIMAGE:
        return SigHashPreimage(Stateful.hex2bytes(hex));
      case ScryptType.OPCODETYPE:
        return OpCodeType(Stateful.hex2bytes(hex));
      default:
        throw new Error(`<${type}> cannot be cast to ScryptType, only sCrypt native types supported`);
    }

  }


  static parseStateHex(contract: AbstractContract, scriptHex: string): [boolean, Arguments] {

    const metaScript = scriptHex.substr(scriptHex.length - 10, 10);
    const version = Number(bin2num(metaScript.substr(metaScript.length - 2, 2)));
    const stateLen = Number(bin2num(metaScript.substr(0, 8)));


    const stateHex = scriptHex.substr(scriptHex.length - 10 - stateLen * 2, stateLen * 2);

    const br = new bsv.encoding.BufferReader(Buffer.from(stateHex, 'hex'));

    const opcodenum = br.readUInt8();

    const isGenesis = opcodenum == 1;

    const stateTemplateArgs: Map<string, string> = new Map();


    const dummyArgs = contract.stateProps.map(p => {
      const dummyArg = Object.assign({}, p, { value: false });
      return flatternArg(dummyArg, contract.resolver, { state: true, ignoreValue: true });
    }).flat(Infinity) as Arguments;

    dummyArgs.forEach((param) => {
      if (param.type === ScryptType.BOOL) {
        const opcodenum = br.readUInt8();
        stateTemplateArgs.set(`<${param.name}>`, opcodenum === 1 ? '01' : '00');
      } else {
        const { data } = readBytes(br);
        stateTemplateArgs.set(`<${param.name}>`, data ? bsv.Script.fromASM(data).toHex() : '');
      }
    });

    return [isGenesis, contract.stateProps.map(param => deserializeArgfromHex(contract.resolver, Object.assign(param, {
      value: false
    }), stateTemplateArgs, { state: true }))];
  }

}