const { ethers } = require('hardhat');
const { expect } = require('chai');

const { ZERO_ADDRESS, TLD } = require('./helpers/constants');
const { mintDomain } = require('./helpers/registry');

const { utils } = ethers;

describe('ProxyReader (UNS only)', () => {
  const domainName = 'test_42';
  const keys = ['test.key1', 'test.key2'];
  const values = ['test.value1', 'test.value2'];

  let UNSRegistry, ProxyReader;
  let unsRegistry, proxy;
  let signers, coinbase, accounts;
  let walletTokenId, cryptoTokenId;

  before(async () => {
    signers = await ethers.getSigners();
    [coinbase] = signers;
    [, ...accounts] = signers.map(s => s.address);

    UNSRegistry = await ethers.getContractFactory('UNSRegistry');
    ProxyReader = await ethers.getContractFactory('contracts/ProxyReader.sol:ProxyReader');

    // deploy UNS
    unsRegistry = await UNSRegistry.deploy();
    await unsRegistry.initialize(coinbase.address);
    await unsRegistry.setTokenURIPrefix('/');

    // mint .wallet TLD
    await unsRegistry['mint(address,uint256,string)'](coinbase.address, TLD.WALLET, 'wallet');
    await unsRegistry['mint(address,uint256,string)'](coinbase.address, TLD.CRYPTO, 'crypto');

    // mint .wallet
    walletTokenId = await mintDomain(unsRegistry, coinbase.address, TLD.WALLET, domainName);

    // mint .crypto
    cryptoTokenId = await mintDomain(unsRegistry, coinbase.address, TLD.CRYPTO, domainName);

    proxy = await ProxyReader.deploy(unsRegistry.address, ZERO_ADDRESS);
  });

  it('should support IERC165 interface', async () => {
    /*
     * bytes4(keccak256(abi.encodePacked('supportsInterface(bytes4)'))) == 0x01ffc9a7
     */
    expect(await proxy.supportsInterface('0x01ffc9a7')).to.be.equal(true);
  });

  describe('IRegistryReader', () => {
    it('should support IRegistryReader interface', async () => {
      /*
      * bytes4(keccak256(abi.encodePacked('tokenURI(uint256)'))) == 0xc87b56dd
      * bytes4(keccak256(abi.encodePacked('isApprovedOrOwner(address,uint256)'))) == 0x430c2081
      * bytes4(keccak256(abi.encodePacked('resolverOf(uint256)'))) == 0xb3f9e4cb
      * bytes4(keccak256(abi.encodePacked('childIdOf(uint256,string)'))) == 0x68b62d32
      * bytes4(keccak256(abi.encodePacked('balanceOf(address)'))) == 0x70a08231
      * bytes4(keccak256(abi.encodePacked('ownerOf(uint256)'))) == 0x6352211e
      * bytes4(keccak256(abi.encodePacked('getApproved(uint256)'))) == 0x081812fc
      * bytes4(keccak256(abi.encodePacked('isApprovedForAll(address,address)'))) == 0xe985e9c5
      * bytes4(keccak256(abi.encodePacked('exists(uint256)'))) == 0x4f558e79
      * bytes4(keccak256(abi.encodePacked('reverseOf(address)'))) == 0x7e37479e
      *
      * => 0xc87b56dd ^ 0x430c2081 ^ 0xb3f9e4cb ^ 0x68b62d32 ^
      *    0x70a08231 ^ 0x6352211e ^ 0x081812fc ^ 0xe985e9c5 ^
      *    0x4f558e79 ^ 0x7e37479e == 0x93352e54
      */
      expect(await proxy.supportsInterface('0x93352e54')).to.be.equal(true);
    });

    it('should revert isApprovedForAll call', async () => {
      await expect(
        proxy.isApprovedForAll(accounts[0], accounts[1]),
      ).to.be.revertedWith('ProxyReader: UNSUPPORTED_METHOD');
    });

    describe('getApproved', () => {
      it('should return approved zero-address .wallet domain', async () => {
        const proxyResult = await proxy.getApproved(walletTokenId);
        const resolverResult = await unsRegistry.getApproved(walletTokenId);

        expect(proxyResult).to.be.equal(resolverResult);
        expect(resolverResult).to.be.equal(ZERO_ADDRESS);
      });

      it('should return approved zero-address .crypto domain', async () => {
        const proxyResult = await proxy.getApproved(cryptoTokenId);
        const resolverResult = await unsRegistry.getApproved(cryptoTokenId);

        expect(proxyResult).to.be.equal(resolverResult);
        expect(resolverResult).to.be.equal(ZERO_ADDRESS);
      });

      it('should return approved address .wallet domain', async () => {
        await unsRegistry.approve(accounts[0], walletTokenId);

        const proxyResult = await proxy.getApproved(walletTokenId);
        const resolverResult = await unsRegistry.getApproved(walletTokenId);

        expect(proxyResult).to.be.equal(resolverResult);
        expect(resolverResult).to.be.equal(accounts[0]);
      });

      it('should return approved address .crypto domain', async () => {
        await unsRegistry.approve(accounts[0], cryptoTokenId);

        const proxyResult = await proxy.getApproved(cryptoTokenId);
        const resolverResult = await unsRegistry.getApproved(cryptoTokenId);

        expect(proxyResult).to.be.equal(resolverResult);
        expect(resolverResult).to.be.equal(accounts[0]);
      });

      it('should return zero address when token does not exist', async () => {
        const proxyResult = await proxy.getApproved(1);
        expect(proxyResult).to.be.equal(ZERO_ADDRESS);
      });
    });

    describe('isApprovedOrOwner', () => {
      it('should return false for not-approved .wallet domain', async () => {
        const proxyResult = await proxy.isApprovedOrOwner(accounts[1], walletTokenId);
        const resolverResult = await unsRegistry.isApprovedOrOwner(accounts[1], walletTokenId);

        expect(proxyResult).to.be.equal(resolverResult);
        expect(resolverResult).to.be.equal(false);
      });

      it('should return false for not-approved .crypto domain', async () => {
        const proxyResult = await proxy.isApprovedOrOwner(accounts[1], cryptoTokenId);
        const resolverResult = await unsRegistry.isApprovedOrOwner(accounts[1], cryptoTokenId);

        expect(proxyResult).to.be.equal(resolverResult);
        expect(resolverResult).to.be.equal(false);
      });

      it('should return whether approved address .wallet domain', async () => {
        await unsRegistry.approve(accounts[0], walletTokenId);

        const proxyResult = await proxy.isApprovedOrOwner(accounts[0], walletTokenId);
        const resolverResult = await unsRegistry.isApprovedOrOwner(accounts[0], walletTokenId);

        expect(proxyResult).to.be.equal(resolverResult);
        expect(resolverResult).to.be.equal(true);
      });

      it('should return whether approved address .crypto domain', async () => {
        await unsRegistry.approve(accounts[0], cryptoTokenId);

        const proxyResult = await proxy.isApprovedOrOwner(accounts[0], cryptoTokenId);
        const resolverResult = await unsRegistry.isApprovedOrOwner(accounts[0], cryptoTokenId);

        expect(proxyResult).to.be.equal(resolverResult);
        expect(resolverResult).to.be.equal(true);
      });

      it('should return false value when token does not exist', async () => {
        const proxyResult = await proxy.isApprovedOrOwner(accounts[0], 1);
        expect(proxyResult).to.be.equal(false);
      });
    });

    describe('ownerOf', () => {
      it('should return empty owner for unknown domain', async () => {
        const unknownTokenId = await unsRegistry.childIdOf(TLD.CRYPTO, 'unknown');
        const owners = await proxy.callStatic.ownerOf(unknownTokenId);
        expect(owners).to.be.equal(ZERO_ADDRESS);
      });

      it('should return owner of .wallet domain', async () => {
        const proxyResult = await proxy.ownerOf(walletTokenId);
        const resolverResult = await unsRegistry.ownerOf(walletTokenId);

        expect(proxyResult).to.be.equal(resolverResult);
        expect(resolverResult).to.be.equal(coinbase.address);
      });

      it('should return owner of .crypto domain', async () => {
        const proxyResult = await proxy.ownerOf(cryptoTokenId);
        const resolverResult = await unsRegistry.ownerOf(cryptoTokenId);

        expect(proxyResult).to.be.equal(resolverResult);
        expect(resolverResult).to.be.equal(coinbase.address);
      });
    });

    describe('resolverOf', () => {
      it('should return resolver of .wallet domain', async () => {
        const proxyResult = await proxy.resolverOf(walletTokenId);
        const resolverResult = await unsRegistry.resolverOf(walletTokenId);

        expect(proxyResult).to.be.equal(resolverResult);
        expect(resolverResult).to.be.equal(unsRegistry.address);
      });

      it('should return resolver of .crypto domain', async () => {
        const proxyResult = await proxy.resolverOf(cryptoTokenId);
        const resolverResult = await unsRegistry.resolverOf(cryptoTokenId);

        expect(proxyResult).to.be.equal(resolverResult);
        expect(resolverResult).to.be.equal(unsRegistry.address);
      });

      it('should return false value when token does not exist', async () => {
        const proxyResult = await proxy.resolverOf(1);
        expect(proxyResult).to.be.equal(ZERO_ADDRESS);
      });
    });

    describe('tokenURI', () => {
      it('should return tokenURI of .wallet domain', async () => {
        const proxyResult = await proxy.tokenURI(walletTokenId);
        const resolverResult = await unsRegistry.tokenURI(walletTokenId);

        expect(proxyResult).to.be.equal(resolverResult);
        expect(resolverResult).to.be
          .equal('/40559307672254207728557027035302885851369665055277251407821151545011532191308');
      });

      it('should return tokenURI of .crypto domain', async () => {
        const proxyResult = await proxy.tokenURI(cryptoTokenId);
        const resolverResult = await unsRegistry.tokenURI(cryptoTokenId);

        expect(proxyResult).to.be.equal(resolverResult);
        expect(resolverResult).to.be
          .equal('/107771857897517834290909154724501010203356272148473478760301214125032721342346');
      });

      it('should return empty tokenURI when token does not exist', async () => {
        const proxyResult = await proxy.tokenURI(1);
        expect(proxyResult).to.be.equal('');
      });
    });

    describe('childIdOf', () => {
      it('should return childIdOf of .wallet domain', async () => {
        const proxyResult = await proxy.childIdOf(TLD.WALLET, 'test');
        const resolverResult = await unsRegistry.childIdOf(TLD.WALLET, 'test');

        expect(proxyResult).to.be.equal(resolverResult);
        expect(resolverResult).to.be
          .equal('50586162622368517199428676025463367639931450566950616867100918499864570754504');
      });

      it('should return childIdOf of .crypto domain', async () => {
        const proxyResult = await proxy.childIdOf(TLD.CRYPTO, 'test');
        const resolverResult = await unsRegistry.childIdOf(TLD.CRYPTO, 'test');

        expect(proxyResult).to.be.equal(resolverResult);
        expect(resolverResult).to.be
          .equal('82856763987730893573226808376519199326595862773989062576563108342755511775491');
      });
    });

    describe('balanceOf', () => {
      it('should aggregate balance from all registries', async () => {
        const _domainName = 'hey_hoy_23bkkcbv';
        const account = accounts[7];
        await mintDomain(unsRegistry, account, TLD.CRYPTO, _domainName);
        await mintDomain(unsRegistry, account, TLD.WALLET, _domainName);

        const proxyResult = await proxy.balanceOf(account);
        const result = await unsRegistry.balanceOf(account);
        expect(proxyResult).to.be.equal(result);
      });
    });

    describe('exists', () => {
      it('should return false for zero tokenId', async () => {
        expect(await proxy.exists(0)).to.be.equal(false);
      });

      it('should return false for unknown .wallet domain', async () => {
        const unknownTokenId = await unsRegistry.childIdOf(TLD.WALLET, 'unknown');

        expect(await proxy.exists(unknownTokenId)).to.be.equal(false);
      });

      it('should return false for unknown .crypto domain', async () => {
        const unknownTokenId = await unsRegistry.childIdOf(TLD.CRYPTO, 'unknown');

        expect(await proxy.exists(unknownTokenId)).to.be.equal(false);
      });

      it('should return true for .wallet domain', async () => {
        const tokenId = await mintDomain(unsRegistry, accounts[3], TLD.WALLET, 'hey_hoy_97hds');
        expect(await proxy.exists(tokenId)).to.be.equal(true);
      });

      it('should return true for .crypto domain', async () => {
        const tokenId = await mintDomain(unsRegistry, accounts[3], TLD.CRYPTO, 'hey_hoy_97hds');
        expect(await proxy.exists(tokenId)).to.be.equal(true);
      });

      it('should return true for .crypto TLD', async () => {
        expect(await proxy.exists(TLD.CRYPTO)).to.be.equal(true);
      });

      it('should return true for .wallet TLD', async () => {
        expect(await proxy.exists(TLD.WALLET)).to.be.equal(true);
      });
    });

    describe('reverseOf', () => {
      it('should return empty reverse record when it is not set', async () => {
        expect(await proxy.reverseOf(coinbase.address)).to.be.equal(0);
      });

      it('should return reverse record', async () => {
        const owner = signers[3];
        const tokenId = await mintDomain(unsRegistry, owner.address, TLD.X, 'hey_hoy_11sfg');
        await unsRegistry.connect(owner).setReverse(tokenId);

        expect(await proxy.reverseOf(owner.address)).to.be.equal(tokenId);
      });
    });
  });

  describe('IRecordReader', () => {
    it('should support IRecordReader interface', async () => {
      /*
       * bytes4(keccak256(abi.encodePacked('get(string,uint256)'))) == 0x1be5e7ed
       * bytes4(keccak256(abi.encodePacked('getByHash(uint256,uint256)'))) == 0x672b9f81
       * bytes4(keccak256(abi.encodePacked('getMany(string[],uint256)'))) == 0x1bd8cc1a
       * bytes4(keccak256(abi.encodePacked('getManyByHash(uint256[],uint256)'))) == 0xb85afd28
       *
       * => 0x1be5e7ed ^ 0x672b9f81 ^ 0x1bd8cc1a ^ 0xb85afd28 == 0xdf4c495e
       */
      expect(await proxy.supportsInterface('0xdf4c495e')).to.be.equal(true);
    });

    describe('get', () => {
      it('should return value of record for .wallet domain', async () => {
        await unsRegistry.set('get_key_39', 'value1', walletTokenId);

        const proxyResult = await proxy.get('get_key_39', walletTokenId);
        const resolverResult = await unsRegistry.get('get_key_39', walletTokenId);

        expect(proxyResult).to.be.equal(resolverResult);
        expect(resolverResult).to.be.equal('value1');
      });

      it('should return value of record for .crypto domain', async () => {
        await unsRegistry.set('get_key_134', 'value12', cryptoTokenId);

        const proxyResult = await proxy.get('get_key_134', cryptoTokenId);
        const resolverResult = await unsRegistry.get('get_key_134', cryptoTokenId);

        expect(proxyResult).to.be.equal(resolverResult);
        expect(resolverResult).to.be.equal('value12');
      });
    });

    describe('getMany', () => {
      it('should return list with empty value for unregistered key', async () => {
        const result = await proxy.getMany([keys[0]], walletTokenId);

        expect(result.length).to.be.equal(1);
        expect(result[0]).to.be.equal('');
      });

      it('should return list with single value for .wallet domain', async () => {
        const [key] = keys;
        const [value] = values;
        await unsRegistry.set(key, value, walletTokenId);

        const proxyResult = await proxy.getMany([key], walletTokenId);
        const resolverResult = await unsRegistry.getMany([key], walletTokenId);

        expect(proxyResult).to.be.eql(resolverResult);
        expect(resolverResult).to.be.eql([value]);
      });

      it('should return list with single value for .crypto domain', async () => {
        const [key] = keys;
        const [value] = values;
        await unsRegistry.set(key, value, cryptoTokenId);

        const proxyResult = await proxy.getMany([key], cryptoTokenId);
        const resolverResult = await unsRegistry.getMany([key], cryptoTokenId);

        expect(proxyResult).to.be.eql(resolverResult);
        expect(resolverResult).to.be.eql([value]);
      });

      it('should return list with multiple values for .wallet domain', async () => {
        for (let i = 0; i < keys.length; i++) {
          await unsRegistry.set(keys[i], values[i], walletTokenId);
        }

        const result = await proxy.getMany(keys, walletTokenId);
        expect(result).to.be.eql(values);
      });

      it('should return list with multiple values for .crypto domain', async () => {
        for (let i = 0; i < keys.length; i++) {
          await unsRegistry.set(keys[i], values[i], cryptoTokenId);
        }

        const result = await proxy.getMany(keys, cryptoTokenId);
        expect(result).to.be.eql(values);
      });
    });

    describe('getByHash', () => {
      it('should return value of record for .wallet domain', async () => {
        const keyHash = utils.id('get_key_4235');
        await unsRegistry.set('get_key_4235', 'value1454', walletTokenId);

        const proxyResult = await proxy.getByHash(keyHash, walletTokenId);
        const resolverResult = await unsRegistry.getByHash(keyHash, walletTokenId);

        expect(proxyResult).to.be.eql(resolverResult);
        expect(resolverResult).to.be.eql(['get_key_4235', 'value1454']);
      });

      it('should return value of record for .crypto domain', async () => {
        const keyHash = utils.id('get_key_0946');
        await unsRegistry.set('get_key_0946', 'value4521', cryptoTokenId);

        const proxyResult = await proxy.getByHash(keyHash, cryptoTokenId);
        const resolverResult = await unsRegistry.getByHash(keyHash, cryptoTokenId);

        expect(proxyResult).to.be.eql(resolverResult);
        expect(resolverResult).to.be.eql(['get_key_0946', 'value4521']);
      });
    });

    describe('getManyByHash', () => {
      it('should return list with empty value for unregistered key', async () => {
        const keyHash = utils.id('key_aaaaaa');
        const result = await proxy.getManyByHash([keyHash], walletTokenId);
        expect(result[0]).to.be.eql(['']);
      });

      it('should return list with single value for .wallet domain', async () => {
        const [key] = keys;
        const [value] = values;
        const keyHash = utils.id(key);
        await unsRegistry.set(key, value, walletTokenId);

        const proxyResult = await proxy.getManyByHash([keyHash], walletTokenId);
        const resolverResult = await unsRegistry.getManyByHash([keyHash], walletTokenId);

        expect(proxyResult).to.be.eql(resolverResult);
        expect(resolverResult).to.be.eql([[key], [value]]);
      });

      it('should return list with single value for .crypto domain', async () => {
        const [key] = keys;
        const [value] = values;
        const keyHash = utils.id(key);
        await unsRegistry.set(key, value, cryptoTokenId);

        const proxyResult = await proxy.getManyByHash([keyHash], cryptoTokenId);
        const resolverResult = await unsRegistry.getManyByHash([keyHash], cryptoTokenId);

        expect(proxyResult).to.be.eql(resolverResult);
        expect(resolverResult).to.be.eql([[key], [value]]);
      });
    });
  });

  describe('IDataReader', () => {
    it('should support IDataReader interface', async () => {
      /*
       * bytes4(keccak256(abi.encodePacked('getData(string[],uint256)'))) == 0x91015f6b
       * bytes4(keccak256(abi.encodePacked('getDataForMany(string[],uint256[])'))) == 0x933c051d
       * bytes4(keccak256(abi.encodePacked('getDataByHash(uint256[],uint256)'))) == 0x03280755
       * bytes4(keccak256(abi.encodePacked('getDataByHashForMany(uint256[],uint256[])'))) == 0x869b8884
       * bytes4(keccak256(abi.encodePacked('ownerOfForMany(uint256[])'))) == 0xc15ae7cf
       *
       * => 0x91015f6b ^ 0x933c051d ^ 0x03280755 ^
       *    0x869b8884 ^ 0xc15ae7cf == 0x46d43268
       */
      expect(await proxy.supportsInterface('0x46d43268')).to.be.equal(true);
    });

    describe('getData', () => {
      it('should return empty data for non-existing .wallet domain', async () => {
        // arrange
        const _domainName = 'hey_hoy_1037';
        const _tokenId = await unsRegistry.childIdOf(TLD.WALLET, _domainName);

        // act
        const data = await proxy.callStatic.getData(keys, _tokenId);

        // asserts
        expect(data).to.be.eql([ZERO_ADDRESS, ZERO_ADDRESS, ['', '']]);
      });

      it('should return empty data for non-existing .crypto domain', async () => {
        // arrange
        const _domainName = 'hey_hoy_1037';
        const _tokenId = await unsRegistry.childIdOf(TLD.CRYPTO, _domainName);

        // act
        const data = await proxy.callStatic.getData(keys, _tokenId);

        // asserts
        expect(data).to.be.eql([ZERO_ADDRESS, ZERO_ADDRESS, ['', '']]);
      });

      it('should return data for .crypto domain', async () => {
        // arrange
        const tokenId = await mintDomain(unsRegistry, coinbase.address, TLD.CRYPTO, 'hey_hoy_121');

        // act
        const data = await proxy.callStatic.getData(keys, tokenId);

        // asserts
        expect(data).to.be.eql([unsRegistry.address, coinbase.address, ['', '']]);
      });

      it('should return data for .wallet domain', async () => {
        // arrange
        const tokenId = await mintDomain(unsRegistry, coinbase.address, TLD.WALLET, 'hey_hoy_121');

        // act
        const data = await proxy.callStatic.getData(keys, tokenId);

        // asserts
        expect(data).to.be.eql([unsRegistry.address, coinbase.address, ['', '']]);
      });
    });

    describe('getDataForMany', () => {
      it('should return empty lists for empty list of domains', async () => {
        const data = await proxy.callStatic.getDataForMany([], []);

        expect(data).to.be.eql([[], [], []]);
      });

      it('should return empty data for non-existing .crypto|.wallet domains', async () => {
        // arrange
        const _domainName = 'hey_hoy_1037';
        const _walletTokenId = await unsRegistry.childIdOf(TLD.WALLET, _domainName);
        const _cryptoTokenId = await unsRegistry.childIdOf(TLD.CRYPTO, _domainName);

        // act
        const data = await proxy.callStatic.getDataForMany(keys, [_walletTokenId, _cryptoTokenId]);

        // asserts
        expect(data).to.be.eql([[ZERO_ADDRESS, ZERO_ADDRESS], [ZERO_ADDRESS, ZERO_ADDRESS], [['', ''], ['', '']]]);
      });

      it('should return data for multiple .crypto|.wallet domains', async () => {
        // arrange
        const _domainName = 'test_1291';
        const _walletTokenId = await mintDomain(unsRegistry, coinbase.address, TLD.WALLET, _domainName);
        const _cryptoTokenId = await mintDomain(unsRegistry, coinbase.address, TLD.CRYPTO, _domainName);

        for (let i = 0; i < keys.length; i++) {
          await unsRegistry.set(keys[i], values[i], _walletTokenId);
          await unsRegistry.set(keys[i], values[i], _cryptoTokenId);
        }

        // act
        const data = await proxy.callStatic.getDataForMany(keys, [_walletTokenId, _cryptoTokenId]);

        // assert
        expect(data).to.be.eql([
          [unsRegistry.address, unsRegistry.address],
          [coinbase.address, coinbase.address],
          [['test.value1', 'test.value2'], ['test.value1', 'test.value2']],
        ]);
      });

      it('should return owners for multiple tokens (including unknown)', async () => {
        // arrange
        const unknownTokenId = await unsRegistry.childIdOf(TLD.CRYPTO, 'unknown');

        // act
        const data = await proxy.callStatic.getDataForMany([], [walletTokenId, unknownTokenId]);

        // assert
        expect(data).to.be.eql([
          [unsRegistry.address, ZERO_ADDRESS],
          [coinbase.address, ZERO_ADDRESS],
          [[], []],
        ]);
      });
    });

    describe('getDataByHash', () => {
      it('should return empty data for non-existing .wallet domain', async () => {
        // arrange
        const hashes = keys.map(utils.id);
        const _domainName = 'hey_hoy_29224';
        const _tokenId = await unsRegistry.childIdOf(TLD.WALLET, _domainName);

        // act
        const data = await proxy.callStatic.getDataByHash(hashes, _tokenId);

        // asserts
        expect(data).to.be.eql([ZERO_ADDRESS, ZERO_ADDRESS, keys, ['', '']]);
      });

      it('should return empty data for non-existing .crypto domain', async () => {
        // arrange
        const hashes = keys.map(utils.id);
        const _domainName = 'hey_hoy_29228';
        const _tokenId = await unsRegistry.childIdOf(TLD.CRYPTO, _domainName);

        // act
        const data = await proxy.callStatic.getDataByHash(hashes, _tokenId);

        // asserts
        expect(data).to.be.eql([ZERO_ADDRESS, ZERO_ADDRESS, keys, ['', '']]);
      });

      it('should return data by hashes for .crypto domain', async () => {
        // arrange
        const hashes = keys.map(utils.id);
        const tokenId = await mintDomain(unsRegistry, coinbase.address, TLD.CRYPTO, 'hey_hoy_292');
        for (let i = 0; i < keys.length; i++) {
          await unsRegistry.set(keys[i], values[i], tokenId);
        }

        // act
        const data = await proxy.callStatic.getDataByHash(hashes, tokenId);

        // assert
        expect(data).to.be.eql([
          unsRegistry.address,
          coinbase.address,
          keys,
          values,
        ]);
      });

      it('should return data by hashes for .wallet domain', async () => {
        // arrange
        const hashes = keys.map(utils.id);
        const tokenId = await mintDomain(unsRegistry, coinbase.address, TLD.WALLET, 'hey_hoy_292');
        for (let i = 0; i < keys.length; i++) {
          await unsRegistry.set(keys[i], values[i], tokenId);
        }

        // act
        const data = await proxy.callStatic.getDataByHash(hashes, tokenId);

        // assert
        expect(data).to.be.eql([
          unsRegistry.address,
          coinbase.address,
          keys,
          values,
        ]);
      });
    });

    describe('getDataByHashForMany', () => {
      it('should return empty lists for empty list of domains', async () => {
        const data = await proxy.callStatic.getDataByHashForMany([], []);

        expect(data).to.be.eql([[], [], [], []]);
      });

      it('should return empty data for non-existing .crypto|.wallet domains', async () => {
        // arrange
        const hashes = keys.map(utils.id);
        const _domainName = 'hey_hoy_1037';
        const _walletTokenId = await unsRegistry.childIdOf(TLD.WALLET, _domainName);
        const _cryptoTokenId = await unsRegistry.childIdOf(TLD.CRYPTO, _domainName);

        // act
        const data = await proxy.callStatic.getDataByHashForMany(hashes, [_walletTokenId, _cryptoTokenId]);

        // asserts
        expect(data).to.be.eql([
          [ZERO_ADDRESS, ZERO_ADDRESS],
          [ZERO_ADDRESS, ZERO_ADDRESS],
          [keys, keys],
          [['', ''], ['', '']],
        ]);
      });

      it('should return data for multiple .crypto|.wallet domains', async () => {
        // arrange
        const hashes = keys.map(utils.id);
        const _domainName = 'test_1082q';
        const _walletTokenId = await mintDomain(unsRegistry, coinbase.address, TLD.WALLET, _domainName);
        const _cryptoTokenId = await mintDomain(unsRegistry, coinbase.address, TLD.CRYPTO, _domainName);

        for (let i = 0; i < keys.length; i++) {
          await unsRegistry.set(keys[i], values[i], _walletTokenId);
          await unsRegistry.set(keys[i], values[i], _cryptoTokenId);
        }

        // act
        const data = await proxy.callStatic.getDataByHashForMany(hashes, [_walletTokenId, _cryptoTokenId]);

        // assert
        expect(data).to.be.eql([
          [unsRegistry.address, unsRegistry.address],
          [coinbase.address, coinbase.address],
          [['test.key1', 'test.key2'], ['test.key1', 'test.key2']],
          [['test.value1', 'test.value2'], ['test.value1', 'test.value2']],
        ]);
      });

      it('should return owners for multiple domains (including unknown)', async () => {
        // arrange
        const unknownTokenId = await unsRegistry.childIdOf(TLD.CRYPTO, 'unknown');

        // act
        const data = await proxy.callStatic.getDataByHashForMany([], [walletTokenId, unknownTokenId]);

        // assert
        expect(data).to.be.eql([
          [unsRegistry.address, ZERO_ADDRESS],
          [coinbase.address, ZERO_ADDRESS],
          [[], []],
          [[], []],
        ]);
      });
    });

    describe('ownerOfForMany', () => {
      it('should return empty owner for unknown domain', async () => {
        const unknownTokenId = await unsRegistry.childIdOf(TLD.CRYPTO, 'unknown');
        const owners = await proxy.callStatic.ownerOfForMany([unknownTokenId]);
        expect(owners).to.be.eql([ZERO_ADDRESS]);
      });

      it('should return empty list for empty list of domains', async () => {
        const owners = await proxy.callStatic.ownerOfForMany([]);
        expect(owners).to.be.eql([]);
      });

      it('should return owners for multiple .crypto|.wallet domains', async () => {
        // arrange
        const _domainName = 'test_125t';
        const _walletTokenId = await mintDomain(unsRegistry, accounts[0], TLD.WALLET, _domainName);
        const _cryptoTokenId = await mintDomain(unsRegistry, coinbase.address, TLD.CRYPTO, _domainName);

        // act
        const owners = await proxy.callStatic.ownerOfForMany([walletTokenId, _walletTokenId, _cryptoTokenId]);

        // assert
        expect(owners).to.be.eql([coinbase.address, accounts[0], coinbase.address]);
      });

      it('should return owners for multiple domains (including unknown)', async () => {
        // arrange
        const unknownTokenId = await unsRegistry.childIdOf(TLD.CRYPTO, 'unknown');

        // act
        const owners = await proxy.callStatic.ownerOfForMany([walletTokenId, unknownTokenId]);

        // assert
        expect(owners).to.be.eql([coinbase.address, ZERO_ADDRESS]);
      });
    });
  });

  describe('registryOf', () => {
    it('should return zero for zero tokenId', async () => {
      const address = await proxy.registryOf(0);
      expect(address).to.be.equal(ZERO_ADDRESS);
    });

    it('should return error for unknown .wallet domain', async () => {
      const unknownTokenId = await unsRegistry.childIdOf(TLD.WALLET, 'unknown');
      const address = await proxy.registryOf(unknownTokenId);
      expect(address).to.be.equal(ZERO_ADDRESS);
    });

    it('should return error for unknown .crypto domain', async () => {
      const unknownTokenId = await unsRegistry.childIdOf(TLD.CRYPTO, 'unknown');
      const address = await proxy.registryOf(unknownTokenId);
      expect(address).to.be.equal(ZERO_ADDRESS);
    });

    it('should return value for .wallet domain', async () => {
      const tokenId = await mintDomain(unsRegistry, accounts[3], TLD.WALLET, 'hey_hoy_98hds');
      const address = await proxy.registryOf(tokenId);
      expect(address).to.be.equal(unsRegistry.address);
    });

    it('should return value for .crypto domain', async () => {
      const tokenId = await mintDomain(unsRegistry, accounts[3], TLD.CRYPTO, 'hey_hoy_98hds');
      const address = await proxy.registryOf(tokenId);
      expect(address).to.be.equal(unsRegistry.address);
    });

    it('should return value for .crypto TLD', async () => {
      const address = await proxy.registryOf(TLD.CRYPTO);
      expect(address).to.be.equal(unsRegistry.address);
    });

    it('should return value for .wallet TLD', async () => {
      const address = await proxy.registryOf(TLD.WALLET);
      expect(address).to.be.equal(unsRegistry.address);
    });
  });
});
