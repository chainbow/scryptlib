import { assert, expect } from 'chai';
import { newTx, loadDescription} from './helper';
import { DebugLaunch} from '../src/abi';
import { buildContractClass, VerifyError, VerifyResult } from '../src/contract';
import { bsv, toHex, signTx, compileContract ,num2bin, getPreimage, uri2path} from '../src/utils';
import { Bytes, PubKey, Sig, Ripemd160, Bool, Struct, SigHashPreimage} from '../src/scryptTypes';
import { readFileSync } from 'fs';

const privateKey = new bsv.PrivateKey.fromRandom('testnet');
const publicKey = privateKey.publicKey;
const pubKeyHash = bsv.crypto.Hash.sha256ripemd160(publicKey.toBuffer());
const inputSatoshis = 100000;
const tx = newTx(inputSatoshis);

const jsonDescr = loadDescription('p2pkh_desc.json');
const DemoP2PKH = buildContractClass(jsonDescr);
const p2pkh = new DemoP2PKH(new Ripemd160(toHex(pubKeyHash)));

const personDescr = loadDescription('person_desc.json');
const PersonContract = buildContractClass(personDescr);
const outputAmount = 22222
const DataLen = 1
const dummyTxId = 'a477af6b2667c29670467e4e0728b685ee07b240235771862318e29ddbe58458'

const LINKPATTERN = /(\[((!\[[^\]]*?\]\(\s*)([^\s\(\)]+?)\s*\)\]|(?:\\\]|[^\]])*\])\(\s*)(([^\s\(\)]|\([^\s\(\)]*?\))+)\s*(".*?")?\)/g;

let man: Struct = new Struct({
  isMale: false,
  age: 33,
  addr: new Bytes("68656c6c6f20776f726c6421")
});

const person = new PersonContract(man, 18);


function readLaunchJson(error: VerifyError): DebugLaunch | undefined {
  for (const match of error.matchAll(LINKPATTERN)) {
    if(match[5] && match[5].startsWith("scryptlaunch")) {
      const file = match[5].replace(/scryptlaunch/, "file");
      return JSON.parse(readFileSync(uri2path(file)).toString());
    }
  }
  return undefined;
}


describe('VerifyError', () => {

  describe('check VerifyError ackermann.scrypt', () => {
    let ackermann, result;
  
    before(() => {
      const Ackermann = buildContractClass(loadDescription('ackermann_desc.json'));
      ackermann = new Ackermann(2, 1);
    });
  
    it('stop at ackermann.scrypt#38', () => {
      result = ackermann.unlock(15).verify()
      expect(result.error).to.contains("ackermann.scrypt#38");
    });
  });


  describe('check VerifyError when no sourceMap', () => {
    let p2pkh, result;

    before(() => {
      const privateKey = new bsv.PrivateKey.fromRandom('testnet');
      const publicKey = privateKey.publicKey;
      const pubKeyHash = bsv.crypto.Hash.sha256ripemd160(publicKey.toBuffer());
      const jsonDescr = loadDescription('p2pkh_desc_without_sourceMap.json');
      const DemoP2PKH = buildContractClass(jsonDescr);
      p2pkh = new DemoP2PKH(new Ripemd160(toHex(pubKeyHash)));
    });
  
    it('need generate DemoP2PKH-launch.json', () => {
      let sig: Sig = new Sig(toHex(signTx(tx, privateKey, p2pkh.lockingScript.toASM(), inputSatoshis)));
      let pubkey: PubKey = new PubKey(toHex(publicKey));
      result = p2pkh.unlock(sig, pubkey).verify({ inputSatoshis, tx });
      expect(result.error).to.equal("VerifyError: SCRIPT_ERR_VERIFY");
    });
  });

  describe('should throw when missing version', () => {

    it('should throw when missing version', () => {
      const jsonDescr = loadDescription('p2pkh_desc_missing_version.json');
      expect(() => { buildContractClass(jsonDescr); } ).to.throw('Contract description version deprecated,  Please update your sCrypt extension to the latest version and recompile');
    });
  });


  describe('check VerifyError tokenUtxo.scrypt', () => {
    let token, lockingScriptCodePart, result

    const privateKey1 = new bsv.PrivateKey.fromWIF('cMwKrDrzN5YPRHvPAAn9SfbQcXvARzpdtuufFQZZTBvBaqDETPhP')
    const publicKey1 = bsv.PublicKey.fromPrivateKey(privateKey1)
    const pkh1 = bsv.crypto.Hash.sha256ripemd160(publicKey1.toBuffer())
    const privateKey2 = new bsv.PrivateKey.fromRandom('testnet')
    const publicKey2 = bsv.PublicKey.fromPrivateKey(privateKey2)
    const privateKey3 = new bsv.PrivateKey.fromRandom('testnet')
    const publicKey3 = bsv.PublicKey.fromPrivateKey(privateKey3)

    before(() => {
      const Token = buildContractClass(loadDescription('tokenUtxo_desc.json'))
      token = new Token()
  
      // code part
      lockingScriptCodePart = token.codePart.toASM()
    });

  
    it('stop tokenUtxo.scrypt#43', () => {

      // split 100 tokens
      token.setDataPart(toHex(publicKey1) + num2bin(10, DataLen) + num2bin(90, DataLen))
      
      const testSplit = (privKey, balance0, balance1, balanceInput0 = balance0, balanceInput1 = balance1) => {
        let tx = new bsv.Transaction()
  
        tx.addInput(new bsv.Transaction.Input({
          prevTxId: dummyTxId,
          outputIndex: 0,
          script: ''
        }), bsv.Script.fromASM(token.lockingScript.toASM()), inputSatoshis)
  
        const newLockingScript0 = [lockingScriptCodePart, toHex(publicKey2) + num2bin(0, DataLen) + num2bin(balance0, DataLen)].join(' ') + " "
        tx.addOutput(new bsv.Transaction.Output({
          script: bsv.Script.fromASM(newLockingScript0),
          satoshis: outputAmount
        }))
  
        if (balance1 > 0) {
          const newLockingScript1 = [lockingScriptCodePart, toHex(publicKey3) + num2bin(0, DataLen) + num2bin(balance1, DataLen)].join(' ')
          tx.addOutput(new bsv.Transaction.Output({
            script: bsv.Script.fromASM(newLockingScript1),
            satoshis: outputAmount
          }))
        }
  
        token.txContext = { tx: tx, inputIndex: 0, inputSatoshis }
        
        const preimage = getPreimage(tx, token.lockingScript.toASM(), inputSatoshis)
        const sig = signTx(tx, privKey, token.lockingScript.toASM(), inputSatoshis)
        return token.split(
          new Sig(toHex(sig)),
          new PubKey(toHex(publicKey2)),
          balanceInput0,
          outputAmount,
          new PubKey(toHex(publicKey3)),
          balanceInput1,
          outputAmount,
          new SigHashPreimage(toHex(preimage))
        )
      }
  
      result = testSplit(privateKey1, 60, 40).verify()
      expect(result.error).to.contains("fails at 02beb44ff058a00b9d2dd287619c141451fa337210592a8d72b92c4d8d9b60e7d80a5a");
      expect(result.error).to.contains("tokenUtxo.scrypt#43");
      const launch = readLaunchJson(result.error);
      expect(launch).not.undefined;
      expect(launch.configurations[0].program).to.contains("tokenUtxo.scrypt");
    });


  });
  

  describe('check VerifyError', () => {

    
    it('stop at person.scrypt#26', () => {

      let result = person.main(man, 44, false).verify()

      expect(result.error).to.contains("person.scrypt#26");
      expect(result.error).to.contains("Main-launch.json");
      expect(result.error).to.contains("fails at OP_VERIFY");
    })

    it('stop at person.scrypt#25', () => {

      let result = person.main(man, 10, true).verify()

      expect(result.error).to.contains("person.scrypt#25");
      expect(result.error).to.contains("Main-launch.json");
      expect(result.error).to.contains("fails at OP_VERIFY");

    })


    it('stop at p2pkh.scrypt#10', () => {

      let sig = new Sig(toHex(signTx(tx, new bsv.PrivateKey.fromRandom('testnet'), p2pkh.lockingScript.toASM(), inputSatoshis)));
      let pubkey = new PubKey(toHex(publicKey));

      p2pkh.txContext = { inputSatoshis, tx };
      let result = p2pkh.unlock(sig, pubkey).verify();

      expect(result.error).to.contains("p2pkh.scrypt#10");
      expect(result.error).to.contains("DemoP2PKH-launch.json");
      expect(result.error).to.contains("fails at OP_CHECKSIG");

    })

  })


  describe('check asmArgs', () => {
    let asm, result;
  
    before(() => {
      const ASM = buildContractClass(loadDescription('asm_desc.json'));
      asm = new ASM();
    });
  
    it('it should success when replace correctly ', () => {

      asm.replaceAsmVars({
        'ASM.equalImpl.x': 'OP_5'
      })

      assert.deepEqual("OP_NOP 0 OP_PICK OP_5 ab12 OP_SIZE OP_NIP OP_MUL OP_1 OP_MUL OP_5 OP_SUB OP_EQUAL OP_NOP OP_NIP", asm.lockingScript.toASM())

      result = asm.equal(5).verify()
      expect(result.success, result.error).to.be.true;
    });


    it('it should error when replace incorrectly ', () => {

      asm.replaceAsmVars({
        'ASM.equalImpl.x': 'OP_5'
      })

      result = asm.equal(15).verify()
      expect(result.success, result.error).to.be.false;

      const launch = readLaunchJson(result.error);

      assert.deepEqual(launch.configurations[0].asmArgs, {
          'ASM.equalImpl.x': 'OP_5'
        }
      )
    });

  });

})