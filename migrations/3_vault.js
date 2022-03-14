const {ether} = require('@openzeppelin/test-helpers');
const {deployProxy} = require('@openzeppelin/truffle-upgrades');

const {saveAddress} = require('../scripts/saveAddress');
const {VaultParams} = require('../configurations/config');

const Vault = artifacts.require('Vault');

module.exports = async function (deployer) {
	const DECIMAL_FIXER_FOR_PERCENTAGE = 100;

	const network_id = deployer.network_id.toString();
	const addresses = require(`../configurations/${network_id}/Addresses.json`);

	this.Vault = await deployProxy(
		Vault,
		[
			'LaCucina Vault', // name
			addresses[network_id].LacToken, // lac token
			ether(VaultParams[network_id].initialRelease), // initial release rate
			ether(VaultParams[network_id].finalRelease), // final release rate
			Number(VaultParams[network_id].changePercentage) * DECIMAL_FIXER_FOR_PERCENTAGE, // change percentage
			Number(VaultParams[network_id].totalBlocksPerPeriod) // blocks per period
		],
		{
			initializer: 'initialize'
		}
	);

	console.log('Contract Address: ', this.Vault.address);
	await saveAddress('Vault', this.Vault.address, network_id);
};
