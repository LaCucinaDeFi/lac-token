require('chai').should();

const Web3 = require('web3');
const {expect} = require('chai');
const {BN, ether, time} = require('@openzeppelin/test-helpers');
const {deployProxy} = require('@openzeppelin/truffle-upgrades');
const {PRIVATE_KEY, PUBLIC_ADDRESS} = require('../secrets.test.json');
const {claim, createSignature} = require('./helper/helper');

const LacToken = artifacts.require('LacToken');
const Vault = artifacts.require('Vault');
const BlockData = artifacts.require('BlockData');
const SampleToken = artifacts.require('SampleToken');

contract.only('Simulation1', (accounts) => {
	const owner = accounts[0];
	const minter = accounts[1];
	const user1 = accounts[2];
	const user2 = accounts[3];
	const user3 = accounts[4];
	const vaultKeeper = accounts[8];
	const blocksPerPeriod = 100;
	let currentPerBlockAmount;
	before('deploy contract', async () => {
		// deploy LAC token
		this.LacToken = await LacToken.new('Lacucina Token', 'LAC', minter, ether('500000000'));

		// deploy Sample token
		this.SampleToken = await SampleToken.new();

		// deploy Vault
		this.Vault = await deployProxy(Vault, [
			'Vault',
			this.LacToken.address,
			ether('10000'), // min 10k
			ether('10000'), // max 10k
			0, // 0%
			10
		]);

		// mint LAC tokens to minter
		this.web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8555'));

		// add account
		await this.web3.eth.accounts.wallet.add('0x' + PRIVATE_KEY);
		this.pk = Buffer.from(PRIVATE_KEY, 'hex');

		this.BlockData = await BlockData.new();
		this.chainId = await this.BlockData.getChainId();

		// transfer lac tokens to Vault
		await this.LacToken.transfer(this.Vault.address, ether('500000000'), {
			from: minter
		});
	});

	describe('setup()', () => {
		it('add fundReceivers', async () => {
			// grant vaultKeeper role
			const VAULT_KEEPER = await this.Vault.VAULT_KEEPER();
			await this.Vault.grantRole(VAULT_KEEPER, vaultKeeper, {from: owner});
			await this.Vault.grantRole(VAULT_KEEPER, PUBLIC_ADDRESS);

			// add fund receivers
			await this.Vault.setup(['receiver1', 'receiver2', 'receiver3'], [5000, 2500, 2500], {
				from: owner
			});
		});
	});

	describe('claim()', () => {
		let receiver1DetailsAfter;
		let receiver2DetailsAfter;
		let receiver3DetailsAfter;
		let startBlock;

		let currentNonceUser1;
		let signature;
		let receiver1;
		let receiver2;
		let receiver3;
		beforeEach('', async () => {
			startBlock = await this.Vault.startBlock();
			// get current nonce of user
			currentNonceUser1 = await this.Vault.userNonce(user1);
			receiver1 = 1;
			receiver2 = 2;
			receiver3 = 3;
		});

		it('should distribute correctly after 10 blocks with 0% change percentage', async () => {
			console.log('startBlock: ', startBlock.toString());

			const lastFundUpdatedBlock = await this.Vault.lastFundUpdatedBlock();
			console.log('lastFundUpdatedBlock: ', lastFundUpdatedBlock.toString());

			const blocksToIncrease = startBlock.add(new BN('10'));

			receiver1Details = await this.Vault.fundReceivers(receiver1);
			receiver2Details = await this.Vault.fundReceivers(receiver2);
			receiver3Details = await this.Vault.fundReceivers(receiver3);

			// increase blocks
			await time.advanceBlockTo(blocksToIncrease);

			const user1BalanceBefore = await this.LacToken.balanceOf(user1);

			// claim tokens
			await claim(this.Vault, user1, ether('3000'), receiver1, this.pk, this.chainId);

			receiver1DetailsAfter = await this.Vault.fundReceivers(receiver1);
			receiver2DetailsAfter = await this.Vault.fundReceivers(receiver2);
			receiver3DetailsAfter = await this.Vault.fundReceivers(receiver3);

			console.log(
				'receiver1DetailsAfter: ',
				receiver1DetailsAfter.totalAccumulatedFunds.toString()
			);
			console.log(
				'receiver2DetailsAfter: ',
				receiver2DetailsAfter.totalAccumulatedFunds.toString()
			);
			console.log(
				'receiver3DetailsAfter: ',
				receiver3DetailsAfter.totalAccumulatedFunds.toString()
			);

			const user1BalAfter = await this.LacToken.balanceOf(user1);
			const perBlockAmount = await this.Vault.currentReleaseRatePerBlock();

			expect(user1BalAfter).to.bignumber.be.eq(user1BalanceBefore.add(ether('3000')));
			expect(perBlockAmount).to.bignumber.be.eq(ether('1000'));

			//add tokens accumulated in last block
			expect(receiver1DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(ether('2000'));
			expect(receiver2DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(ether('2500'));
			expect(receiver3DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(ether('2500'));
		});

		it('should distribute correctly after 20 blocks', async () => {
			const lastFundUpdatedBlock = await this.Vault.lastFundUpdatedBlock();
			console.log('lastFundUpdatedBlock: ', lastFundUpdatedBlock.toString());
			console.log('startBlock: ', startBlock.toString());

			const blocksToIncrease = startBlock.add(new BN('10'));

			receiver1Details = await this.Vault.fundReceivers(receiver1);
			receiver2Details = await this.Vault.fundReceivers(receiver2);
			receiver3Details = await this.Vault.fundReceivers(receiver3);

			// increase blocks
			await time.advanceBlockTo(blocksToIncrease);

			receiver1Details = await this.Vault.fundReceivers(receiver1);

			const currentReleaseRate = await this.Vault.getCurrentReleaseRate();

			console.log('receiver1Details: ', receiver1Details.totalAccumulatedFunds.toString());
			console.log('receiver2Details: ', receiver2Details.totalAccumulatedFunds.toString());
			console.log('receiver3Details: ', receiver3Details.totalAccumulatedFunds.toString());

			const user1BalanceBefore = await this.LacToken.balanceOf(user1);

			// claim tokens
			await claim(this.Vault, user1, ether('2000'), receiver1, this.pk, this.chainId);

			// claim tokens
			await claim(this.Vault, user1, ether('2000'), receiver3, this.pk, this.chainId);

			receiver1DetailsAfter = await this.Vault.fundReceivers(receiver1);
			receiver2DetailsAfter = await this.Vault.fundReceivers(receiver2);
			receiver3DetailsAfter = await this.Vault.fundReceivers(receiver3);

			console.log(
				'receiver1DetailsAfter: ',
				receiver1DetailsAfter.totalAccumulatedFunds.toString()
			);
			console.log(
				'receiver2DetailsAfter: ',
				receiver2DetailsAfter.totalAccumulatedFunds.toString()
			);
			console.log(
				'receiver3DetailsAfter: ',
				receiver3DetailsAfter.totalAccumulatedFunds.toString()
			);

			const user1BalAfter = await this.LacToken.balanceOf(user1);
			const perBlockAmount = await this.Vault.currentReleaseRatePerBlock();

			expect(user1BalAfter).to.bignumber.be.eq(user1BalanceBefore.add(ether('4000')));
			expect(perBlockAmount).to.bignumber.be.eq(ether('1000'));

			expect(currentReleaseRate._currentReleaseRatePerBlock).to.bignumber.be.eq(ether('1000'));
			expect(currentReleaseRate._currentReleaseRatePerPeriod).to.bignumber.be.eq(ether('10000'));

			//add tokens accumulated in 21st block
			expect(receiver1DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				ether('5000').add(ether('500'))
			);
			expect(receiver2DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				ether('5000').add(ether('250'))
			);
			expect(receiver3DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				ether('3000').add(ether('250'))
			);
		});

		it('should distribute correctly after 100 blocks', async () => {
			const lastFundUpdatedBlock = await this.Vault.lastFundUpdatedBlock();
			console.log('lastFundUpdatedBlock: ', lastFundUpdatedBlock.toString());
			console.log('startBlock: ', startBlock.toString());

			const blocksToIncrease = startBlock.add(new BN('80'));

			receiver1Details = await this.Vault.fundReceivers(receiver1);
			receiver2Details = await this.Vault.fundReceivers(receiver2);
			receiver3Details = await this.Vault.fundReceivers(receiver3);

			// increase blocks
			await time.advanceBlockTo(blocksToIncrease);

			const user1BalanceBefore = await this.LacToken.balanceOf(user1);

			// claim  tokens
			await claim(this.Vault, user1, ether('5000'), receiver1, this.pk, this.chainId);

			// claim  tokens
			await claim(this.Vault, user1, ether('15000'), receiver2, this.pk, this.chainId);

			// claim  tokens
			await claim(this.Vault, user1, ether('3000'), receiver3, this.pk, this.chainId);

			receiver1DetailsAfter = await this.Vault.fundReceivers(receiver1);
			receiver2DetailsAfter = await this.Vault.fundReceivers(receiver2);
			receiver3DetailsAfter = await this.Vault.fundReceivers(receiver3);

		
			console.log(
				'receiver1DetailsAfter: ',
				receiver1DetailsAfter.totalAccumulatedFunds.toString()
			);
			console.log(
				'receiver2DetailsAfter: ',
				receiver2DetailsAfter.totalAccumulatedFunds.toString()
			);
			console.log(
				'receiver3DetailsAfter: ',
				receiver3DetailsAfter.totalAccumulatedFunds.toString()
			);

			const user1BalAfter = await this.LacToken.balanceOf(user1);
			const perBlockAmount = await this.Vault.currentReleaseRatePerBlock();

			expect(user1BalAfter).to.bignumber.be.eq(user1BalanceBefore.add(ether('23000')));
			expect(perBlockAmount).to.bignumber.be.eq(ether('1000'));

			//add tokens accumulated in last block
			expect(receiver1DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				ether('40000').add(ether('500').mul(new BN('3'))) // calculate extra block rewards
			);
			expect(receiver2DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				ether('10000').add(ether('250').mul(new BN('3')))
			);
			expect(receiver3DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				ether('20000').add(ether('250').mul(new BN('3')))
			);
		});

		it('should distribute correctly after 105 blocks', async () => {
			const lastFundUpdatedBlock = await this.Vault.lastFundUpdatedBlock();
			console.log('lastFundUpdatedBlock: ', lastFundUpdatedBlock.toString());
			console.log('startBlock: ', startBlock.toString());

			const blocksToIncrease = startBlock.add(new BN('5'));

			receiver1Details = await this.Vault.fundReceivers(receiver1);
			receiver2Details = await this.Vault.fundReceivers(receiver2);
			receiver3Details = await this.Vault.fundReceivers(receiver3);

			// increase blocks
			await time.advanceBlockTo(blocksToIncrease);

			const user1BalanceBefore = await this.LacToken.balanceOf(user1);

			// claim 20k tokens
			await claim(this.Vault, user1, ether('2000'), receiver1, this.pk, this.chainId);

			receiver1DetailsAfter = await this.Vault.fundReceivers(receiver1);
			receiver2DetailsAfter = await this.Vault.fundReceivers(receiver2);
			receiver3DetailsAfter = await this.Vault.fundReceivers(receiver3);

			console.log(
				'receiver1DetailsAfter: ',
				receiver1DetailsAfter.totalAccumulatedFunds.toString()
			);
			console.log(
				'receiver2DetailsAfter: ',
				receiver2DetailsAfter.totalAccumulatedFunds.toString()
			);
			console.log(
				'receiver3DetailsAfter: ',
				receiver3DetailsAfter.totalAccumulatedFunds.toString()
			);

			const user1BalAfter = await this.LacToken.balanceOf(user1);
			const perBlockAmount = await this.Vault.currentReleaseRatePerBlock();

			expect(user1BalAfter).to.bignumber.be.eq(user1BalanceBefore.add(ether('2000')));
			expect(perBlockAmount).to.bignumber.be.eq(ether('1000'));

			//add tokens accumulated in 1501st block
			expect(receiver1DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				ether('40000').add(ether('1500')) // calculate extra block rewards
			);
			expect(receiver2DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				ether('10000').add(ether('250').mul(new BN('7')))
			);
			expect(receiver3DetailsAfter.totalAccumulatedFunds).to.bignumber.be.eq(
				ether('20000').add(ether('250').mul(new BN('7')))
			);
		});
	});
});
