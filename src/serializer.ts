import { bsv, num2bin } from './utils';

/*
 * a varint serializer into Script ASM
 */

const BN = bsv.crypto.BN;
// number of bytes to denote state length after serialization, exclusing varint prefix
const STATE_LEN = 2;

function serializeBool(flag: boolean): string {
    return flag ? '01' : '00';
}

// TODO: handle bigint
function serializeInt(n: number): string {
    // special case: otherwise it returns empty string
    if (n === 0) {
        return '00';
    }

    const num = BN.fromNumber(n);
    return num.toSM({ endian: 'little' }).toString('hex');
}

// TODO: validate
function serializeBytes(hexStr: string): string {
    return hexStr;
}

function serialize(x: boolean | number | string) {
    if (typeof x === 'boolean') {
        return serializeBool(x);
    } if (typeof x === 'number') {
        return serializeInt(x);
    } else {
        return serializeBytes(x);
    }
}

export type State = Record<string, boolean | number | string>

// serialize contract state into Script ASM
export function serializeState(state: State): string {
    const asms = [];
    let stateLen = 0;

    Object.values(state).forEach(s => {
        const asm = serialize(s);
        // TODO: handle long data OP_PUSHDATAx, whose length byte exceeds 1
        stateLen += 1 /* length byte */ + asm.length / 2;
        asms.push(asm);
    });

    // use fixed size (2 bytes) to denote state len
    const len = num2bin(stateLen, STATE_LEN);
    asms.push(len);
    return asms.join(' ');
}